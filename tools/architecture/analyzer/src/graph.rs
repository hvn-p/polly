//! The import graph between modules, and the rules applied to it.

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;

use oxc_resolver::{ResolveOptions, Resolver};
use serde::Serialize;

use crate::glob;
use crate::parse::{Parsed, Request, Use};
use crate::rules::{MayImport, Rules, Tier};
use crate::workspace::Package;

/// A module: the files under one tier path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Module {
    /// Its path, relative to the root.
    pub id: String,
    /// Its tier.
    pub tier: String,
    /// The package it is in.
    pub package: String,
    /// Its files.
    pub files: Vec<String>,
}

/// One file's import of another module.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    /// The importing module.
    pub from: String,
    /// The imported module.
    pub to: String,
    /// The importing file.
    pub file: String,
    /// The import's line.
    pub line: u32,
    /// The import's last line.
    pub end_line: u32,
    /// The specifier as written.
    pub spec: String,
    /// Whether it carries types only.
    pub type_only: bool,
    /// The names it takes.
    pub names: Vec<String>,
    /// Where the file uses the names that reach this module.
    pub uses: Vec<Use>,
}

/// One file's import of a technology: an external package or a Node built-in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Technology {
    /// The importing module, if the file is in one.
    pub module: Option<String>,
    /// The importing file.
    pub file: String,
    /// The import's line.
    pub line: u32,
    /// The package, or `node:<module>`.
    pub name: String,
}

/// A rule broken, where, and how to fix it.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
pub struct Violation {
    /// The rule: tier, isolated, types-only, only-from, index, package-entry, technology,
    /// undeclared, unresolved, run-only, no-tier, cycle, root-manifest.
    pub rule: String,
    /// The file, relative to the root.
    pub file: String,
    /// The line, from 1.
    pub line: u32,
    /// What is wrong.
    pub message: String,
    /// What to do.
    pub fix: String,
}

/// The analysis of one tree.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Graph {
    /// The modules.
    pub modules: Vec<Module>,
    /// The imports between modules.
    pub edges: Vec<Edge>,
    /// The imports of technologies.
    pub technologies: Vec<Technology>,
    /// Every rule broken.
    pub violations: Vec<Violation>,
}

/// What a specifier resolved to.
enum Target {
    /// A file of the tree.
    File(String),
    /// An external package or a built-in.
    Technology(String),
    /// Nothing.
    Unresolved,
}

/// The names an import takes, those among them taken as types only, and the names of
/// the import statement each one comes from through re-exports.
#[derive(Debug, Clone)]
struct Taken {
    names: BTreeSet<String>,
    types: BTreeSet<String>,
    origins: BTreeMap<String, BTreeSet<String>>,
}

/// Each file's imports with what they resolved to.
type Resolved<'a> = BTreeMap<&'a str, Vec<(&'a Request, Target)>>;

/// Everything a graph is built from.
pub struct Input<'a> {
    /// The tree's root.
    pub root: &'a Path,
    /// Its rules.
    pub rules: &'a Rules,
    /// Its workspace packages.
    pub packages: &'a [Package],
    /// Each source file's imports and exports.
    pub parsed: &'a BTreeMap<String, Parsed>,
    /// The resolver for relative and external specifiers; none skips externals.
    pub resolver: Option<&'a Resolver>,
    /// The root manifest, when the root rule applies.
    pub root_manifest: Option<&'a str>,
}

/// A resolver reading TypeScript sources and pnpm's `node_modules`.
#[must_use]
pub fn resolver() -> Resolver {
    Resolver::new(ResolveOptions {
        extensions: vec![
            ".ts".into(),
            ".tsx".into(),
            ".mts".into(),
            ".js".into(),
            ".mjs".into(),
            ".json".into(),
        ],
        condition_names: vec![
            "import".into(),
            "node".into(),
            "default".into(),
            "types".into(),
        ],
        main_fields: vec!["module".into(), "main".into(), "types".into()],
        ..ResolveOptions::default()
    })
}

/// The package name a bare specifier names.
fn package_name(spec: &str) -> &str {
    let mut parts = spec.splitn(3, '/');
    let first = parts.next().unwrap_or_default();
    match (first.starts_with('@'), parts.next()) {
        (true, Some(second)) => &spec[..first.len() + 1 + second.len()],
        _ => first,
    }
}

struct Context<'a> {
    input: &'a Input<'a>,
    by_name: HashMap<&'a str, &'a Package>,
    /// File → (tier, module).
    located: HashMap<String, Option<(&'a Tier, String)>>,
    violations: BTreeSet<Violation>,
}

impl<'a> Context<'a> {
    fn package_of(&self, file: &str) -> Option<&'a Package> {
        self.input
            .packages
            .iter()
            .filter(|p| p.dir.is_empty() || file.starts_with(&format!("{}/", p.dir)))
            .max_by_key(|p| p.dir.len())
    }

    /// The tier and module of a file: its longest matching tier path.
    fn locate(&mut self, file: &str) -> Option<(&'a Tier, String)> {
        if let Some(found) = self.located.get(file) {
            return found.clone();
        }
        let rules = self.input.rules;
        let found = rules
            .tiers
            .iter()
            .flat_map(|tier| tier.paths.iter().map(move |path| (tier, path)))
            .filter_map(|(tier, path)| {
                glob::prefix(path, file).map(|module| (tier, module.to_string()))
            })
            .max_by_key(|(_, module)| module.len());
        self.located.insert(file.to_string(), found.clone());
        found
    }

    fn violation(&mut self, rule: &str, file: &str, line: u32, message: String, fix: String) {
        self.violations.insert(Violation {
            rule: rule.to_string(),
            file: file.to_string(),
            line,
            message,
            fix,
        });
    }

    fn resolve(&mut self, file: &str, request: &Request) -> Target {
        let spec = request.spec.as_str();
        if let Some(builtin) = spec.strip_prefix("node:") {
            return Target::Technology(format!(
                "node:{}",
                builtin.split('/').next().unwrap_or(builtin)
            ));
        }
        let importer = self.package_of(file);
        if spec.starts_with('.') || spec.starts_with('/') {
            let Some(resolver) = self.input.resolver else {
                let base = Path::new(file).parent().unwrap_or(Path::new(""));
                return normalize(&base.join(spec).to_string_lossy())
                    .map_or(Target::Unresolved, Target::File);
            };
            let dir = self.input.root.join(file);
            let dir = dir.parent().unwrap_or(self.input.root);
            return match resolver.resolve(dir, spec) {
                Ok(resolution) => match resolution.full_path().strip_prefix(self.input.root) {
                    Ok(path) => Target::File(path.to_string_lossy().replace('\\', "/")),
                    Err(_) => Target::Unresolved,
                },
                Err(_) => Target::Unresolved,
            };
        }
        let name = package_name(spec);
        if let Some(importer) = importer
            && importer.name != name
            && !importer.declared.contains(name)
        {
            self.violation(
                "undeclared",
                file,
                request.line,
                format!(
                    "{name} is imported but not declared in {}'s package.json",
                    importer.name
                ),
                format!(
                    "Declare {name} in {}'s package.json, or reach it through a package that does.",
                    importer.name
                ),
            );
        }
        if let Some(package) = self.by_name.get(name) {
            let subpath = format!(".{}", &spec[name.len()..]);
            return package
                .exports
                .get(&subpath)
                .map_or(Target::Unresolved, |f| Target::File(f.clone()));
        }
        if let Some(resolver) = self.input.resolver {
            let dir = self.input.root.join(file);
            if resolver
                .resolve(dir.parent().unwrap_or(self.input.root), spec)
                .is_err()
            {
                return Target::Unresolved;
            }
        }
        Target::Technology(name.to_string())
    }

    /// Whether a file exports a name, through its re-exports too.
    fn exports(&self, file: &str, name: &str, seen: &mut BTreeSet<String>) -> bool {
        if !seen.insert(file.to_string()) {
            return false;
        }
        let Some(parsed) = self.input.parsed.get(file) else {
            return true;
        };
        if name == "*" || parsed.exports.contains(name) {
            return true;
        }
        for request in &parsed.requests {
            for (imported, exported) in &request.reexports {
                if exported == name {
                    return true;
                }
                if exported == "*" && imported == "*" {
                    let base = Path::new(file).parent().unwrap_or(Path::new(""));
                    if let Some(target) = normalize(&base.join(&request.spec).to_string_lossy())
                        && self.exports(&target, name, seen)
                    {
                        return true;
                    }
                }
            }
        }
        false
    }
}

/// A relative path with `.` and `..` folded, or none when it climbs above the root.
fn normalize(path: &str) -> Option<String> {
    let mut parts: Vec<&str> = vec![];
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            other => parts.push(other),
        }
    }
    Some(parts.join("/"))
}

/// Builds the graph of a tree and applies its rules.
#[must_use]
pub fn build(input: &Input) -> Graph {
    let mut cx = Context {
        input,
        by_name: input
            .packages
            .iter()
            .map(|p| (p.name.as_str(), p))
            .collect(),
        located: HashMap::new(),
        violations: BTreeSet::new(),
    };
    let barrels: BTreeSet<&str> = input
        .packages
        .iter()
        .flat_map(|p| p.exports.values().map(String::as_str))
        .collect();
    let (modules, resolved) = locate_all(&mut cx, &barrels);

    let mut edges = vec![];
    let mut technologies = vec![];
    for (file, targets) in &resolved {
        let from = cx.locate(file);
        for (request, target) in targets {
            match target {
                Target::Unresolved => cx.violation(
                    "unresolved",
                    file,
                    request.line,
                    format!("'{}' resolves to nothing", request.spec),
                    "Import an existing file, or a package through its exports.".to_string(),
                ),
                Target::Technology(name) => {
                    if let Some((_, module)) = &from {
                        technologies.push(Technology {
                            module: Some(module.clone()),
                            file: (*file).to_string(),
                            line: request.line,
                            name: name.clone(),
                        });
                    }
                }
                Target::File(to_file) => {
                    if let Some((_, from_module)) = &from {
                        edges.extend(module_edges(
                            &mut cx,
                            file,
                            from_module,
                            request,
                            to_file,
                            &barrels,
                        ));
                    }
                }
            }
        }
    }
    edges.sort_by(|a, b| {
        (&a.0.from, &a.0.to, &a.0.file, a.0.line).cmp(&(&b.0.from, &b.0.to, &b.0.file, b.0.line))
    });
    edges.dedup_by(|a, b| a.0 == b.0);

    for (edge, to_file) in &edges {
        check_edge(&mut cx, edge, to_file, &modules);
    }
    for technology in &technologies {
        check_technology(&mut cx, technology, &modules);
    }
    let edges: Vec<Edge> = edges.into_iter().map(|(edge, _)| edge).collect();
    check_cycles(&mut cx, &edges, &modules);
    if let (Some(rule), Some(manifest)) = (&input.rules.root, input.root_manifest) {
        check_root(&mut cx, rule, manifest);
    }
    Graph {
        modules: modules.into_values().collect(),
        edges,
        technologies,
        violations: cx.violations.into_iter().collect(),
    }
}

/// The modules an import of a file reaches, each with the file it reaches.
fn module_edges(
    cx: &mut Context,
    file: &str,
    from_module: &str,
    request: &Request,
    to_file: &str,
    barrels: &BTreeSet<&str>,
) -> Vec<(Edge, String)> {
    let mut reached = vec![];
    let types = if request.type_only {
        request.names.clone()
    } else {
        request.type_names.clone()
    };
    let taken = Taken {
        names: request.names.clone(),
        types,
        origins: request
            .names
            .iter()
            .map(|n| (n.clone(), BTreeSet::from([n.clone()])))
            .collect(),
    };
    follow(cx, to_file, &taken, &mut BTreeSet::new(), &mut reached);
    let mut edges = vec![];
    for (
        to_file,
        Taken {
            names,
            types,
            origins,
        },
    ) in reached
    {
        let Some((_, to_module)) = cx.locate(&to_file) else {
            continue;
        };
        if to_module == from_module {
            continue;
        }
        check_entry(cx, file, request, &to_file, &to_module, barrels);
        let origins: BTreeSet<&String> = names
            .iter()
            .filter_map(|n| origins.get(n))
            .flatten()
            .collect();
        let uses = request
            .uses
            .iter()
            .filter(|(name, _)| origins.contains(name))
            .map(|(_, at)| at.clone())
            .collect();
        edges.push((
            Edge {
                from: from_module.to_string(),
                to: to_module,
                file: file.to_string(),
                line: request.line,
                end_line: request.end_line,
                spec: request.spec.clone(),
                type_only: !names.is_empty() && names.is_subset(&types),
                names: names.into_iter().collect(),
                uses,
            },
            to_file,
        ));
    }
    edges
}

/// Each file's module, and what its imports resolve to; a file in no tier is a violation
/// unless it is a package's entry.
fn locate_all<'a>(
    cx: &mut Context<'a>,
    barrels: &BTreeSet<&str>,
) -> (BTreeMap<String, Module>, Resolved<'a>) {
    let input = cx.input;
    let mut modules: BTreeMap<String, Module> = BTreeMap::new();
    let mut resolved: Resolved<'a> = BTreeMap::new();
    for (file, parsed) in input.parsed {
        let targets = parsed
            .requests
            .iter()
            .map(|r| (r, cx.resolve(file, r)))
            .collect();
        resolved.insert(file, targets);
        match cx.locate(file) {
            Some((tier, id)) => {
                let package = cx.package_of(file).map(|p| p.name.clone()).unwrap_or_default();
                modules
                    .entry(id.clone())
                    .or_insert_with(|| Module { id, tier: tier.id.clone(), package, files: vec![] })
                    .files
                    .push(file.clone());
            }
            None if barrels.contains(file.as_str()) => {}
            None => cx.violation(
                "no-tier",
                file,
                1,
                format!("{file} belongs to no tier"),
                "Name the tier whose criterion this file meets and add its path to architecture.rules.json; when none fits, stop and ask.".to_string(),
            ),
        }
    }

    (modules, resolved)
}

/// The files an import reaches: through a barrel (a package entry in no tier), to what it
/// re-exports of the names taken.
fn follow(
    cx: &mut Context,
    file: &str,
    taken: &Taken,
    seen: &mut BTreeSet<String>,
    out: &mut Vec<(String, Taken)>,
) {
    let Taken {
        names,
        types,
        origins,
    } = taken;
    if cx.locate(file).is_some() || !seen.insert(file.to_string()) {
        out.push((file.to_string(), taken.clone()));
        return;
    }
    let Some(parsed) = cx.input.parsed.get(file) else {
        return;
    };
    let all = names.contains("*");
    for request in parsed.requests.clone() {
        let mut taken = BTreeSet::new();
        let mut as_types = BTreeSet::new();
        let mut from: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
        let mut inherit = |name: &String, of: &str| {
            let original = origins.get(of).into_iter().flatten().cloned();
            from.entry(name.clone()).or_default().extend(original);
        };
        for (imported, exported) in &request.reexports {
            if exported == "*" {
                for name in names.iter().filter(|n| all || n.as_str() != "default") {
                    taken.insert(name.clone());
                    inherit(name, name);
                    if types.contains(name) || request.type_names.contains(imported) {
                        as_types.insert(name.clone());
                    }
                }
            } else if all || names.contains(exported) {
                taken.insert(imported.clone());
                inherit(
                    imported,
                    if names.contains(exported) {
                        exported
                    } else {
                        "*"
                    },
                );
                if types.contains(exported) || request.type_names.contains(imported) {
                    as_types.insert(imported.clone());
                }
            }
        }
        if taken.is_empty() {
            continue;
        }
        if let Target::File(target) = cx.resolve(file, &request) {
            let star = request.reexports.iter().any(|(i, e)| i == "*" && e == "*");
            if star && !all {
                taken.retain(|name| cx.exports(&target, name, &mut BTreeSet::new()));
                if taken.is_empty() {
                    continue;
                }
            }
            as_types.retain(|name| taken.contains(name));
            follow(
                cx,
                &target,
                &Taken {
                    names: taken,
                    types: as_types,
                    origins: from,
                },
                seen,
                out,
            );
        }
    }
}

/// A module is entered through its index; a package through its exports.
fn check_entry(
    cx: &mut Context,
    file: &str,
    request: &Request,
    to_file: &str,
    to_module: &str,
    barrels: &BTreeSet<&str>,
) {
    let from_package = cx.package_of(file).map(|p| p.name.clone());
    let to_package = cx.package_of(to_file);
    let relative = request.spec.starts_with('.');
    if let Some(to_package) = to_package
        && relative
        && from_package.as_deref() != Some(to_package.name.as_str())
    {
        let name = to_package.name.clone();
        cx.violation(
            "package-entry",
            file,
            request.line,
            format!("'{}' reaches into {name}'s files", request.spec),
            format!("Import {name} through its exports, and declare it in the importing package."),
        );
        return;
    }
    let is_file_module = to_module == to_file;
    let stem = to_file
        .strip_prefix(&format!("{to_module}/"))
        .unwrap_or_default();
    let entry = stem.starts_with("index.") && !stem.contains('/');
    if !is_file_module && !entry && !barrels.contains(to_file) {
        cx.violation(
            "index",
            file,
            request.line,
            format!(
                "'{}' enters {to_module} through {stem}, not its index",
                request.spec
            ),
            format!("Import {to_module}/index.ts, and export from it what others need."),
        );
    }
}

fn check_edge(cx: &mut Context, edge: &Edge, to_file: &str, modules: &BTreeMap<String, Module>) {
    let rules = cx.input.rules;
    let (Some(from), Some(to)) = (modules.get(&edge.from), modules.get(&edge.to)) else {
        return;
    };
    let (Some(from_tier), Some(to_tier)) = (rules.tier(&from.tier), rules.tier(&to.tier)) else {
        return;
    };
    if from.package != to.package
        && let Some(fix) = rules
            .packages
            .get(&to.package)
            .and_then(|p| p.run_only.clone())
    {
        cx.violation(
            "run-only",
            &edge.file,
            edge.line,
            format!("{} imports {}", from.package, to.package),
            fix,
        );
        return;
    }
    let allowed = from_tier.may_import.iter().find(|m| m.tier() == to_tier.id);
    if from_tier.id == to_tier.id && (allowed.is_none() || from_tier.isolated.is_some()) {
        let fix = from_tier
            .isolated
            .clone()
            .unwrap_or_else(|| from_tier.fix.clone());
        cx.violation(
            "isolated",
            &edge.file,
            edge.line,
            format!("{} imports its peer {}", edge.from, edge.to),
            fix,
        );
        return;
    }
    let message = format!(
        "{} ({}) imports {} ({})",
        edge.from, from_tier.id, edge.to, to_tier.id
    );
    match allowed {
        None => cx.violation(
            "tier",
            &edge.file,
            edge.line,
            message,
            from_tier.fix.clone(),
        ),
        Some(MayImport::Conditional(condition)) => {
            if !condition.only_from.is_empty()
                && !condition
                    .only_from
                    .iter()
                    .any(|p| glob::matches(p, &edge.file))
            {
                cx.violation(
                    "only-from",
                    &edge.file,
                    edge.line,
                    message,
                    from_tier.fix.clone(),
                );
            } else if condition.types_only && !edge.type_only {
                let fix = from_tier
                    .types_fix
                    .clone()
                    .unwrap_or_else(|| from_tier.fix.clone());
                cx.violation(
                    "types-only",
                    &edge.file,
                    edge.line,
                    format!("{message}: a value, where only types may be"),
                    fix,
                );
            }
        }
        Some(MayImport::Tier(_)) => {}
    }
    let _ = to_file;
}

fn check_technology(cx: &mut Context, technology: &Technology, modules: &BTreeMap<String, Module>) {
    let rules = cx.input.rules;
    let Some(module) = technology.module.as_ref().and_then(|m| modules.get(m)) else {
        return;
    };
    let allows = |list: &Vec<String>| list.iter().any(|p| glob::wildcard(p, &technology.name));
    if let Some(tier) = rules.tier(&module.tier)
        && let Some(list) = &tier.technologies
        && !allows(list)
    {
        let fix = tier
            .technology_fix
            .clone()
            .unwrap_or_else(|| tier.fix.clone());
        let message = format!(
            "{} uses {}, which tier {} does not allow",
            module.id, technology.name, tier.id
        );
        cx.violation(
            "technology",
            &technology.file,
            technology.line,
            message,
            fix,
        );
        return;
    }
    if let Some(list) = rules
        .packages
        .get(&module.package)
        .and_then(|p| p.technologies.as_ref())
        && !allows(list)
    {
        cx.violation(
            "technology",
            &technology.file,
            technology.line,
            format!(
                "{} uses {}; {} may use only {}",
                module.id,
                technology.name,
                module.package,
                list.join(", ")
            ),
            format!(
                "Move what needs {} into the capacity package that provides it, behind a port.",
                technology.name
            ),
        );
    }
}

/// No cycle between modules, nor between packages.
fn check_cycles(cx: &mut Context, edges: &[Edge], modules: &BTreeMap<String, Module>) {
    let package = |module: &str| {
        modules
            .get(module)
            .map(|m| m.package.clone())
            .unwrap_or_default()
    };
    let mut module_graph: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut package_graph: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for edge in edges {
        module_graph
            .entry(edge.from.clone())
            .or_default()
            .insert(edge.to.clone());
        let (from, to) = (package(&edge.from), package(&edge.to));
        if from != to {
            package_graph.entry(from).or_default().insert(to);
        }
    }
    let mut cycles = components(&module_graph);
    let module_cycles = cycles.len();
    cycles.extend(components(&package_graph));
    for (index, members) in cycles.into_iter().enumerate() {
        let in_cycle = |module: &str| {
            if index < module_cycles {
                members.contains(module)
            } else {
                members.contains(&package(module))
            }
        };
        let names: Vec<String> = if index < module_cycles {
            members.iter().cloned().collect()
        } else {
            members
                .iter()
                .map(|p| {
                    cx.by_name
                        .get(p.as_str())
                        .map_or_else(|| p.clone(), |p| p.dir.clone())
                })
                .collect()
        };
        if let Some(edge) = edges.iter().find(|e| {
            in_cycle(&e.from)
                && in_cycle(&e.to)
                && (index < module_cycles || package(&e.from) != package(&e.to))
        }) {
            cx.violation(
                "cycle",
                &edge.file,
                edge.line,
                format!("cycle between {}", names.join(", ")),
                "Break the cycle: move what both need down a tier, or invert one import through a port.".to_string(),
            );
        }
    }
}

/// The strongly connected components of more than one node (Tarjan).
fn components(graph: &BTreeMap<String, BTreeSet<String>>) -> Vec<BTreeSet<String>> {
    struct State<'a> {
        graph: &'a BTreeMap<String, BTreeSet<String>>,
        index: HashMap<&'a str, usize>,
        low: HashMap<&'a str, usize>,
        stack: Vec<&'a str>,
        on_stack: BTreeSet<&'a str>,
        found: Vec<BTreeSet<String>>,
    }
    fn visit<'a>(s: &mut State<'a>, node: &'a str) {
        let next = s.index.len();
        s.index.insert(node, next);
        s.low.insert(node, next);
        s.stack.push(node);
        s.on_stack.insert(node);
        for target in s.graph.get(node).into_iter().flatten() {
            let target = target.as_str();
            if !s.index.contains_key(target) {
                visit(s, target);
                let low = s.low[node].min(s.low[target]);
                s.low.insert(node, low);
            } else if s.on_stack.contains(target) {
                let low = s.low[node].min(s.index[target]);
                s.low.insert(node, low);
            }
        }
        if s.low[node] == s.index[node] {
            let mut members = BTreeSet::new();
            while let Some(member) = s.stack.pop() {
                s.on_stack.remove(member);
                members.insert(member.to_string());
                if member == node {
                    break;
                }
            }
            if members.len() > 1 {
                s.found.push(members);
            }
        }
    }
    let mut state = State {
        graph,
        index: HashMap::new(),
        low: HashMap::new(),
        stack: vec![],
        on_stack: BTreeSet::new(),
        found: vec![],
    };
    for node in graph.keys() {
        if !state.index.contains_key(node.as_str()) {
            visit(&mut state, node);
        }
    }
    state.found
}

fn check_root(cx: &mut Context, rule: &crate::rules::RootRule, manifest: &str) {
    let Ok(json) = serde_json::from_str::<serde_json::Value>(manifest) else {
        return;
    };
    for section in ["dependencies", "devDependencies", "optionalDependencies"] {
        for name in json[section].as_object().into_iter().flat_map(|m| m.keys()) {
            if rule.dependencies.contains(name) {
                continue;
            }
            let needle = format!("\"{name}\"");
            let line = manifest
                .lines()
                .position(|l| l.trim_start().starts_with(&needle))
                .and_then(|i| u32::try_from(i + 1).ok())
                .unwrap_or(1);
            cx.violation(
                "root-manifest",
                "package.json",
                line,
                format!("the root manifest declares {name}"),
                rule.fix.clone(),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_names_keep_their_scope() {
        assert_eq!(package_name("@polly/back/domains"), "@polly/back");
        assert_eq!(package_name("hono/factory"), "hono");
        assert_eq!(package_name("@scope"), "@scope");
    }

    #[test]
    fn paths_fold_and_never_climb_above_the_root() {
        assert_eq!(normalize("a/b/../c/./d.ts").as_deref(), Some("a/c/d.ts"));
        assert_eq!(normalize("../x"), None);
    }

    #[test]
    fn components_hold_cycles_only() {
        let graph: BTreeMap<String, BTreeSet<String>> = [
            ("a".into(), BTreeSet::from(["b".into()])),
            ("b".into(), BTreeSet::from(["a".into(), "c".into()])),
            ("c".into(), BTreeSet::new()),
        ]
        .into_iter()
        .collect();
        assert_eq!(
            components(&graph),
            vec![BTreeSet::from(["a".to_string(), "b".to_string()])]
        );
    }
}
