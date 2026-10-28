//! The rules file, `architecture.rules.json` at the repository root.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// The whole rules file.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Rules {
    /// What the file is, for its reader.
    #[serde(default)]
    pub about: Option<String>,
    /// Files left out of the analysis, as globs from the root.
    #[serde(default)]
    pub ignore: Vec<String>,
    /// The tiers, top first within each group.
    pub tiers: Vec<Tier>,
    /// Rules on workspace packages, by package name.
    #[serde(default)]
    pub packages: BTreeMap<String, PackageRule>,
    /// What the root manifest may declare.
    #[serde(default)]
    pub root: Option<RootRule>,
}

/// One tier: where its modules are and what they may import.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Tier {
    /// Its identifier, used by `mayImport`.
    pub id: String,
    /// The stack it belongs to (back, web, dev…), for the view.
    pub group: String,
    /// Its name, for people.
    pub name: String,
    /// What a module must meet to belong here.
    pub criterion: String,
    /// Where its modules are; a `*` segment makes one module per directory.
    pub paths: Vec<String>,
    /// The tiers its modules may import, its own included when peers may.
    pub may_import: Vec<MayImport>,
    /// Set when two of its modules never import each other: the fix.
    #[serde(default)]
    pub isolated: Option<String>,
    /// The technologies it may import; absent, any.
    #[serde(default)]
    pub technologies: Option<Vec<String>>,
    /// The fix of an import it may not make.
    pub fix: String,
    /// The fix of a value imported where only types may be.
    #[serde(default)]
    pub types_fix: Option<String>,
    /// The fix of a technology it may not use.
    #[serde(default)]
    pub technology_fix: Option<String>,
}

/// A tier that may be imported, with its conditions.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum MayImport {
    /// Any import of that tier.
    Tier(String),
    /// An import of that tier under conditions.
    Conditional(Condition),
}

/// The conditions on importing a tier.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Condition {
    /// The tier.
    pub tier: String,
    /// Only these files (globs) may import it.
    #[serde(default)]
    pub only_from: Vec<String>,
    /// Only types may be imported from it.
    #[serde(default)]
    pub types_only: bool,
}

impl MayImport {
    /// The tier it names.
    #[must_use]
    pub fn tier(&self) -> &str {
        match self {
            Self::Tier(tier) => tier,
            Self::Conditional(condition) => &condition.tier,
        }
    }
}

/// What applies to one workspace package.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PackageRule {
    /// What it provides, for people.
    pub provides: String,
    /// The technologies its files may import; absent, its tiers decide.
    #[serde(default)]
    pub technologies: Option<Vec<String>>,
    /// Set when it is run and never imported: the fix.
    #[serde(default)]
    pub run_only: Option<String>,
}

/// What the root manifest may declare.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RootRule {
    /// The dependencies it may declare.
    pub dependencies: Vec<String>,
    /// The fix of any other.
    pub fix: String,
}

impl Rules {
    /// Reads and validates the rules file.
    ///
    /// # Errors
    /// When it is unreadable, malformed, or names a tier it does not define.
    pub fn parse(text: &str) -> Result<Self, String> {
        let rules: Self =
            serde_json::from_str(text).map_err(|e| format!("architecture.rules.json: {e}"))?;
        let mut seen = std::collections::BTreeSet::new();
        for tier in &rules.tiers {
            if !seen.insert(tier.id.as_str()) {
                return Err(format!(
                    "architecture.rules.json: tier {} is defined twice",
                    tier.id
                ));
            }
        }
        for tier in &rules.tiers {
            for may in &tier.may_import {
                if !seen.contains(may.tier()) {
                    return Err(format!(
                        "architecture.rules.json: tier {} may import {}, which is not a tier",
                        tier.id,
                        may.tier()
                    ));
                }
            }
        }
        Ok(rules)
    }

    /// The tier with this identifier.
    #[must_use]
    pub fn tier(&self, id: &str) -> Option<&Tier> {
        self.tiers.iter().find(|t| t.id == id)
    }
}
