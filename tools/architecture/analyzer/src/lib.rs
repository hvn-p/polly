//! Checks a TypeScript repository's imports against the rules of its
//! `architecture.rules.json`, once (`check`) or live (`watch`), and describes the graph
//! as JSON for the architecture view. It knows nothing of the repository it reads.

mod glob;
mod graph;
mod parse;
mod rules;
mod serve;
mod watch;
mod workspace;

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use schemars::JsonSchema;
use serde::Serialize;

pub use graph::{Edge, Module, Technology, Violation};
pub use parse::Use;
pub use rules::Rules;
pub use serve::serve;
pub use watch::{Change, Update, watch};

/// The rules file, at the root.
pub const RULES_FILE: &str = "architecture.rules.json";

/// The identity of the sources this analyzer was built from, as JSON (see
/// `build.rs`).
pub const IDENTITY: &str = env!("ANALYZER_IDENTITY");

/// The analysis of the repository, as the view reads it.
#[derive(Debug, Clone, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    /// The repository's name, from its root manifest.
    pub name: Option<String>,
    /// The rules' tiers, top first.
    pub tiers: Vec<rules::Tier>,
    /// The modules.
    pub modules: Vec<Module>,
    /// The imports between modules.
    pub edges: Vec<Edge>,
    /// The imports of technologies.
    pub technologies: Vec<Technology>,
    /// Every rule broken.
    pub violations: Vec<Violation>,
    /// What the tree adds and removes against its base, when one is given.
    pub base: Option<BaseDiff>,
}

/// The module imports a tree adds and removes against its base.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct BaseDiff {
    /// The base's git reference.
    #[serde(rename = "ref")]
    pub reference: String,
    /// The branch checked out, when the tree is on one.
    pub head: Option<String>,
    /// Module pairs imported here and not in the base.
    pub added: Vec<(String, String)>,
    /// Module pairs imported in the base and not here.
    pub removed: Vec<(String, String)>,
}

/// One tree's state: its rules, packages and parsed files.
pub(crate) struct Tree {
    pub root: PathBuf,
    pub rules: Rules,
    /// The globs of `pnpm-workspace.yaml`'s packages.
    pub globs: Vec<String>,
    pub packages: Vec<workspace::Package>,
    pub parsed: BTreeMap<String, parse::Parsed>,
    pub root_manifest: Option<String>,
}

impl Tree {
    /// Reads the rules, the packages and every source.
    pub fn load(root: &Path) -> Result<Self, String> {
        let text = std::fs::read_to_string(root.join(RULES_FILE))
            .map_err(|e| format!("{RULES_FILE}: {e}"))?;
        let rules = Rules::parse(&text)?;
        let root = &root
            .canonicalize()
            .map_err(|e| format!("{}: {e}", root.display()))?;
        let yaml = std::fs::read_to_string(root.join("pnpm-workspace.yaml"))
            .map_err(|e| format!("pnpm-workspace.yaml: {e}"))?;
        let globs = workspace::package_globs(&yaml);
        let packages = workspace::packages(root, &globs)?;
        let mut parsed = BTreeMap::new();
        for file in workspace::sources(root, &packages, &rules.ignore) {
            if let Some(p) = read(root, &file) {
                parsed.insert(file, p);
            }
        }
        let root_manifest = std::fs::read_to_string(root.join("package.json")).ok();
        Ok(Self {
            root: root.clone(),
            rules,
            globs,
            packages,
            parsed,
            root_manifest,
        })
    }

    /// Whether a path relative to the root is a source of a package.
    pub fn is_source(&self, file: &str) -> bool {
        let name = file.rsplit('/').next().unwrap_or(file);
        workspace::is_source(name)
            && !workspace::ignored(file, &self.rules.ignore)
            && !file.split('/').any(workspace::is_skipped)
            && self
                .packages
                .iter()
                .any(|p| p.dir.is_empty() || file.starts_with(&format!("{}/", p.dir)))
    }

    pub fn graph(&self, resolver: Option<&oxc_resolver::Resolver>) -> graph::Graph {
        graph::build(&graph::Input {
            root: &self.root,
            rules: &self.rules,
            packages: &self.packages,
            parsed: &self.parsed,
            resolver,
            root_manifest: self.root_manifest.as_deref(),
        })
    }

    pub fn report(&self, resolver: &oxc_resolver::Resolver, base: Option<&Base>) -> Report {
        let graph = self.graph(Some(resolver));
        let base = base.map(|base| {
            let now = pairs(&graph.edges);
            BaseDiff {
                reference: base.reference.clone(),
                head: base.head.clone(),
                added: now.difference(&base.pairs).cloned().collect(),
                removed: base.pairs.difference(&now).cloned().collect(),
            }
        });
        let name = self
            .root_manifest
            .as_deref()
            .and_then(|m| serde_json::from_str::<serde_json::Value>(m).ok())
            .and_then(|m| m.get("name")?.as_str().map(str::to_string));
        Report {
            name,
            tiers: self.rules.tiers.clone(),
            modules: graph.modules,
            edges: graph.edges,
            technologies: graph.technologies,
            violations: graph.violations,
            base,
        }
    }
}

/// Reads and parses one source.
pub(crate) fn read(root: &Path, file: &str) -> Option<parse::Parsed> {
    let path = root.join(file);
    std::fs::read_to_string(&path)
        .ok()
        .map(|source| parse::parse(&path, &source))
}

pub(crate) fn pairs(edges: &[Edge]) -> BTreeSet<(String, String)> {
    edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect()
}

/// The base a tree is compared with.
pub(crate) struct Base {
    reference: String,
    head: Option<String>,
    pairs: BTreeSet<(String, String)>,
}

/// The branch checked out at `root`, if any.
fn head(root: &Path) -> Option<String> {
    let out = std::process::Command::new("git")
        .args(["symbolic-ref", "--short", "-q", "HEAD"])
        .current_dir(root)
        .output()
        .ok()?;
    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !name.is_empty()).then_some(name)
}

/// Writes the tree of a git reference into `copy`: `git archive` piped to `tar`, each
/// checked, since some tars take an empty input for an empty archive.
fn extract(root: &Path, reference: &str, copy: &Path) -> Result<(), String> {
    use std::process::{Command, Stdio};

    let failed = |command: &str, e: &dyn std::fmt::Display| {
        format!("cannot read {reference}: {command}: {e}")
    };
    let mut archive = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["archive", reference])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| failed("git", &e))?;
    let input = archive
        .stdout
        .take()
        .ok_or_else(|| failed("git", &"no output"))?;
    let tar = Command::new("tar")
        .arg("-x")
        .arg("-C")
        .arg(copy)
        .stdin(input)
        .stderr(Stdio::piped())
        .output();
    let archived = archive.wait_with_output();
    let (tar, archived) = (
        tar.map_err(|e| failed("tar", &e))?,
        archived.map_err(|e| failed("git", &e))?,
    );
    if !archived.status.success() {
        return Err(failed(
            "git archive",
            &String::from_utf8_lossy(&archived.stderr).trim(),
        ));
    }
    if !tar.status.success() {
        return Err(failed("tar", &String::from_utf8_lossy(&tar.stderr).trim()));
    }
    Ok(())
}

/// The module imports of a git reference, read from a copy of its tree with the rules of
/// the tree at `root`.
pub(crate) fn base_pairs(root: &Path, reference: &str) -> Result<Base, String> {
    let copy = std::env::temp_dir().join(format!("architecture-base-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&copy);
    std::fs::create_dir_all(&copy).map_err(|e| e.to_string())?;
    let archive = extract(root, reference, &copy);
    // Read with today's rules, so both graphs name the same modules, and a base
    // from before the rules file can still be compared. A base from before the
    // workspace imports nothing.
    let result = archive.and_then(|()| {
        if copy.join("pnpm-workspace.yaml").exists() {
            std::fs::copy(root.join(RULES_FILE), copy.join(RULES_FILE))
                .map_err(|e| format!("{RULES_FILE}: {e}"))
                .and_then(|_| Tree::load(&copy))
                .map(|tree| pairs(&tree.graph(None).edges))
        } else {
            Ok(BTreeSet::new())
        }
    });
    let _ = std::fs::remove_dir_all(&copy);
    result.map(|pairs| Base {
        reference: reference.to_string(),
        head: head(root),
        pairs,
    })
}

/// Analyzes the tree at `root`, and its difference with `base` when given.
///
/// # Errors
/// When the rules or the workspace cannot be read, or the base is no git reference.
pub fn analyze(root: &Path, base: Option<&str>) -> Result<Report, String> {
    let tree = Tree::load(root)?;
    let base = base
        .map(|reference| base_pairs(root, reference))
        .transpose()?;
    Ok(tree.report(&graph::resolver(), base.as_ref()))
}

/// The JSON Schema of the rules file, generated from the types that read it.
#[must_use]
pub fn schema() -> String {
    let schema = schemars::schema_for!(Rules);
    serde_json::to_string_pretty(&schema).unwrap_or_default() + "\n"
}

/// The JSON Schema of what the analyzer sends the view: its report, and each
/// change of the session's history. The view compares it with the one it was
/// built against, and warns when they differ.
#[must_use]
pub fn report_schema() -> String {
    let mut generator = schemars::SchemaGenerator::default();
    let report = generator.subschema_for::<Report>();
    let change = generator.subschema_for::<watch::Change>();
    let schema = serde_json::json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "What the architecture analyzer sends its view",
        "type": "object",
        "properties": { "report": report, "change": change },
        "$defs": generator.definitions(),
    });
    serde_json::to_string_pretty(&schema).unwrap_or_default() + "\n"
}

/// The violations as the check prints them: one per line, then its fix.
#[must_use]
pub fn render(violations: &[Violation]) -> String {
    use std::fmt::Write;
    violations.iter().fold(String::new(), |mut out, v| {
        let _ = write!(
            out,
            "{}:{}: {}: {}\n  fix: {}\n",
            v.file, v.line, v.rule, v.message, v.fix
        );
        out
    })
}
