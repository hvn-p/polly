//! The pnpm workspace: its packages, their manifests and their source files.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde_json::Value;

use crate::glob;

/// One workspace package.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Package {
    /// Its name in its manifest.
    pub name: String,
    /// Its directory, relative to the root.
    pub dir: String,
    /// Everything it declares: dependencies of every kind.
    pub declared: BTreeSet<String>,
    /// Its `exports`, subpath to file relative to the root.
    pub exports: BTreeMap<String, String>,
}

/// A package manifest's dependency sections.
const SECTIONS: [&str; 4] = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
];

/// Directories never holding sources.
const SKIPPED: [&str; 5] = ["node_modules", "dist", "coverage", "target", "build"];

/// The globs of `pnpm-workspace.yaml`'s `packages` list.
#[must_use]
pub fn package_globs(yaml: &str) -> Vec<String> {
    let mut globs = vec![];
    let mut inside = false;
    for line in yaml.lines() {
        if !line.starts_with(' ') && !line.starts_with('-') {
            inside = line.trim_end() == "packages:";
            continue;
        }
        if let Some(item) = line.trim().strip_prefix("- ").filter(|_| inside) {
            globs.push(item.trim().trim_matches(['"', '\'']).to_string());
        }
    }
    globs
}

/// The workspace's packages, from the globs of its `packages` list.
///
/// # Errors
/// When a manifest is unreadable.
pub fn packages(root: &Path, globs: &[String]) -> Result<Vec<Package>, String> {
    let mut found = vec![];
    for pattern in globs {
        for dir in directories(root, pattern) {
            let manifest = root.join(&dir).join("package.json");
            if manifest.is_file() {
                found.push(package(&dir, &read_json(&manifest)?));
            }
        }
    }
    found.sort_by(|a, b| a.dir.cmp(&b.dir));
    Ok(found)
}

fn directories(root: &Path, pattern: &str) -> Vec<String> {
    let mut dirs = vec![String::new()];
    for segment in pattern.split('/') {
        let mut next = vec![];
        for dir in dirs {
            let join = |name: &str| {
                if dir.is_empty() {
                    name.to_string()
                } else {
                    format!("{dir}/{name}")
                }
            };
            if segment.contains('*') {
                let Ok(entries) = std::fs::read_dir(root.join(&dir)) else {
                    continue;
                };
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if entry.path().is_dir()
                        && glob::wildcard(segment, &name)
                        && !SKIPPED.contains(&name.as_str())
                    {
                        next.push(join(&name));
                    }
                }
            } else if root.join(join(segment)).is_dir() {
                next.push(join(segment));
            }
        }
        dirs = next;
    }
    dirs
}

/// Reads a JSON file.
///
/// # Errors
/// When it is unreadable or malformed.
pub fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

fn package(dir: &str, manifest: &Value) -> Package {
    let declared = SECTIONS
        .iter()
        .filter_map(|section| manifest[section].as_object())
        .flat_map(|deps| deps.keys().cloned())
        .collect();
    let mut exports = BTreeMap::new();
    match &manifest["exports"] {
        Value::Object(map) if map.keys().all(|k| k.starts_with('.')) => {
            for (subpath, target) in map {
                if let Some(file) = target_file(target) {
                    exports.insert(subpath.clone(), join(dir, file));
                }
            }
        }
        Value::Null => {}
        other => {
            if let Some(file) = target_file(other) {
                exports.insert(".".to_string(), join(dir, file));
            }
        }
    }
    Package {
        name: manifest["name"].as_str().unwrap_or(dir).to_string(),
        dir: dir.to_string(),
        declared,
        exports,
    }
}

/// The file an `exports` target points to, for code that runs.
fn target_file(target: &Value) -> Option<&str> {
    match target {
        Value::String(file) => Some(file),
        Value::Object(conditions) => ["import", "node", "default", "types"]
            .iter()
            .find_map(|condition| conditions.get(*condition).and_then(target_file)),
        _ => None,
    }
}

fn join(dir: &str, file: &str) -> String {
    let file = file.trim_start_matches("./");
    if dir.is_empty() {
        file.to_string()
    } else {
        format!("{dir}/{file}")
    }
}

/// Whether a file name is a source the analysis reads.
#[must_use]
pub fn is_source(name: &str) -> bool {
    !name.ends_with(".d.ts")
        && [".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx"]
            .iter()
            .any(|extension| name.ends_with(extension))
}

/// Whether a directory is never read.
#[must_use]
pub fn is_skipped(name: &str) -> bool {
    SKIPPED.contains(&name) || name.starts_with('.')
}

/// Every source file of the packages, relative to the root, minus the ignored ones.
#[must_use]
pub fn sources(root: &Path, packages: &[Package], ignore: &[String]) -> Vec<String> {
    let mut files = vec![];
    for package in packages {
        walk(root, &package.dir, ignore, &mut files);
    }
    files.sort();
    files.dedup();
    files
}

/// Adds the sources under one directory, relative to the root.
pub fn walk(root: &Path, dir: &str, ignore: &[String], files: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(root.join(dir)) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = if dir.is_empty() {
            name.clone()
        } else {
            format!("{dir}/{name}")
        };
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            if !is_skipped(&name) {
                walk(root, &path, ignore, files);
            }
        } else if is_source(&name) && !ignored(&path, ignore) {
            files.push(path);
        }
    }
}

/// Whether a file is left out of the analysis.
#[must_use]
pub fn ignored(path: &str, ignore: &[String]) -> bool {
    ignore.iter().any(|pattern| glob::matches(pattern, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_packages_list_only() {
        let yaml = "packages:\n  - apps/*\n  - \"dev\"\nminimumReleaseAgeExclude:\n  - x@1\n";
        assert_eq!(package_globs(yaml), vec!["apps/*", "dev"]);
    }

    #[test]
    fn reads_exports_in_every_form() {
        let manifest: Value = serde_json::from_str(
            r#"{ "name": "a", "exports": { ".": { "types": "./t.d.ts", "import": "./src/i.ts" }, "./x": "./src/x.ts", "./y": 1 } }"#,
        )
        .unwrap();
        let p = package("packages/a", &manifest);
        assert_eq!(p.exports.get("."), Some(&"packages/a/src/i.ts".to_string()));
        assert_eq!(
            p.exports.get("./x"),
            Some(&"packages/a/src/x.ts".to_string())
        );
        assert_eq!(p.exports.len(), 2);
        let p = package(
            "b",
            &serde_json::from_str(r#"{ "exports": "./main.ts" }"#).unwrap(),
        );
        assert_eq!(
            (p.name.as_str(), p.exports.get(".").map(String::as_str)),
            ("b", Some("b/main.ts"))
        );
    }
}
