//! The rules file's JSON Schema: generated from the analyzer's types, and committed with
//! the launcher.

mod support;

use std::path::{Path, PathBuf};

use architecture_analyzer::analyze;
use support::Tree;

/// The schema the launcher ships.
fn committed() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../npm/launcher/architecture.rules.schema.json")
}

fn generated() -> serde_json::Value {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_architecture-analyzer"))
        .arg("schema")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn the_committed_schema_is_the_generated_one() {
    let on_disk: serde_json::Value = std::fs::read_to_string(committed())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    assert!(
        on_disk == generated(),
        "{} differs from the analyzer's types: in tools/architecture/analyzer, run \
         `cargo run -- schema > ../npm/launcher/architecture.rules.schema.json`, then format it",
        committed().display()
    );
}

#[test]
fn the_schema_describes_every_field_and_refuses_any_other() {
    let schema = generated();
    assert_eq!(schema["additionalProperties"], false);
    let properties = schema["properties"].as_object().unwrap();
    for field in ["$schema", "about", "ignore", "tiers", "packages", "root"] {
        assert!(properties.contains_key(field), "{field}");
    }
    assert_eq!(schema["required"], serde_json::json!(["tiers"]));
    let tier = &schema["$defs"]["Tier"];
    assert_eq!(tier["additionalProperties"], false);
    assert!(
        tier["properties"]["criterion"]["description"]
            .as_str()
            .is_some_and(|d| d.contains("belong")),
        "{tier}"
    );
}

#[test]
fn a_rules_file_may_name_its_schema() {
    let tree = Tree::valid();
    tree.write(
        "architecture.rules.json",
        &support::RULES.replacen('{', r#"{ "$schema": "./schema.json","#, 1),
    );
    assert_eq!(analyze(tree.path(), None).unwrap().violations, vec![]);
}
