//! One fixture per rule (C69), undeclared and unresolvable imports (C71), the check
//! command (C68) and the branch's difference with its base.

mod support;

use architecture_analyzer::{Violation, analyze};
use support::Tree;

fn violations(tree: &Tree) -> Vec<Violation> {
    analyze(tree.path(), None).unwrap().violations
}

fn only(tree: &Tree, rule: &str) -> Violation {
    let found = violations(tree);
    assert_eq!(
        found.len(),
        1,
        "expected one {rule} violation, found {found:#?}"
    );
    assert_eq!(found[0].rule, rule, "{found:#?}");
    found.into_iter().next().unwrap()
}

#[test]
fn the_valid_tree_has_no_violation() {
    let tree = Tree::valid();
    assert_eq!(violations(&tree), vec![]);
    let report = analyze(tree.path(), None).unwrap();
    let modules: Vec<_> = report
        .modules
        .iter()
        .map(|m| (m.id.as_str(), m.tier.as_str()))
        .collect();
    assert!(
        modules.contains(&("packages/back/src/flows/start-lesson", "flows")),
        "{modules:?}"
    );
    assert!(
        modules.contains(&("apps/api/src", "interfaces")),
        "{modules:?}"
    );
    // The back's index is a barrel: the app's import reaches the flow it names, not the other.
    let to: Vec<_> = report
        .edges
        .iter()
        .filter(|e| e.from == "apps/api/src")
        .map(|e| e.to.as_str())
        .collect();
    assert!(
        to.contains(&"packages/back/src/flows/start-lesson"),
        "{to:?}"
    );
    assert!(!to.contains(&"packages/back/src/flows/seed"), "{to:?}");
}

#[test]
fn an_import_written_over_several_lines_reports_where_it_ends() {
    let tree = Tree::valid();
    tree.write(
        "apps/api/src/routes.ts",
        "// routes\nimport {\n  type EventCodes,\n} from '@t/back/domains'\nimport { type Code } from '@t/kernel'\nexport function serve(x: unknown): void {}\nexport type { EventCodes, Code }\n",
    );
    let report = serde_json::to_value(analyze(tree.path(), None).unwrap()).unwrap();
    let lines: Vec<_> = report["edges"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["file"] == "apps/api/src/routes.ts")
        .map(|e| (e["line"].clone(), e["endLine"].clone()))
        .collect();
    assert_eq!(
        lines,
        [(2.into(), 4.into()), (5.into(), 5.into())],
        "{report:#}"
    );
}

#[test]
fn c69_types_only_is_judged_name_by_name_through_a_barrel() {
    let tree = Tree::valid();
    tree.write(
        "packages/back/src/index.ts",
        "export { startLesson } from './flows/start-lesson/index.ts'\nexport * from './flows/seed/index.ts'\nexport type { EventCodes } from './domains/event-codes/index.ts'\n",
    )
    .write(
        "apps/api/src/routes.ts",
        "import { seed, type EventCodes } from '@t/back'\nexport function serve(x: EventCodes): void { seed() }\n",
    );
    assert_eq!(violations(&tree), vec![]);
    tree.write(
        "packages/back/src/index.ts",
        "export { startLesson } from './flows/start-lesson/index.ts'\nexport * from './flows/seed/index.ts'\nexport { bind } from './domains/event-codes/index.ts'\n",
    )
    .write("apps/api/src/routes.ts", "import { seed, bind } from '@t/back'\nexport function serve(): void { seed(); void bind }\n");
    assert_eq!(only(&tree, "types-only").file, "apps/api/src/routes.ts");
}

#[test]
fn c69_a_tier_imports_only_the_tiers_it_may() {
    let tree = Tree::valid();
    tree.write(
        "packages/back/src/domains/event-codes/rules.ts",
        "import { seed } from '../../flows/seed/index.ts'\nexport function rule(): void { seed() }\n",
    );
    let v = only(&tree, "tier");
    assert_eq!(v.file, "packages/back/src/domains/event-codes/rules.ts");
    assert_eq!(v.line, 1);
    assert_eq!(v.fix, "A domain imports only the kernel.");
}

#[test]
fn c69_peers_of_an_isolated_tier_never_import_each_other() {
    let tree = Tree::valid();
    tree.write(
        "packages/back/src/flows/seed/index.ts",
        "import '../start-lesson/index.ts'\nexport function seed(): void {}\n",
    );
    let v = only(&tree, "isolated");
    assert_eq!(
        v.fix,
        "Two flows never import each other: compose them in the process."
    );
}

#[test]
fn c69_a_types_only_import_carries_no_value() {
    let tree = Tree::valid();
    tree.write(
        "packages/back/src/flows/seed/index.ts",
        "import { hash } from '@t/kernel'\nexport function seed(): string { return hash('x') }\n",
    );
    assert_eq!(
        only(&tree, "types-only").fix,
        "A flow imports only types from the kernel."
    );
}

#[test]
fn c69_an_adapter_is_imported_by_a_composition_root_only() {
    let tree = Tree::valid();
    tree.write(
        "apps/api/src/routes.ts",
        "import { connect } from '@t/database'\nexport const serve = connect\n",
    );
    let v = only(&tree, "only-from");
    assert_eq!(v.file, "apps/api/src/routes.ts");
    assert_eq!(v.fix, "Only main.ts imports an adapter.");
}

#[test]
fn c69_a_module_is_entered_through_its_index() {
    let tree = Tree::valid();
    tree.write(
        "packages/back/src/flows/seed/index.ts",
        "import { rule } from '../../domains/event-codes/rules.ts'\nexport function seed(): void { rule() }\n",
    );
    let v = only(&tree, "index");
    assert!(
        v.message.contains("packages/back/src/domains/event-codes"),
        "{v:?}"
    );
}

#[test]
fn c69_a_package_is_entered_through_its_exports() {
    let tree = Tree::valid();
    tree.write(
        "packages/database/src/index.ts",
        "import { hash } from '../../kernel/src/index.ts'\nexport function connect() { return { save() { hash('') } } }\n",
    );
    let v = only(&tree, "package-entry");
    assert!(v.fix.contains("@t/kernel"), "{v:?}");
}

#[test]
fn c69_a_tier_uses_only_the_technologies_it_allows() {
    let tree = Tree::valid();
    tree.write("packages/back/src/domains/event-codes/rules.ts", "import { readFileSync } from 'node:fs'\nexport function rule(): void { readFileSync('x') }\n");
    let v = only(&tree, "technology");
    assert!(v.message.contains("node:fs"), "{v:?}");
    assert_eq!(v.fix, "A domain knows no technology: declare a port.");
}

#[test]
fn c69_a_package_uses_only_the_technologies_it_declares() {
    let tree = Tree::valid();
    tree.write(
        "packages/database/src/index.ts",
        "import pg from 'pg'\nexport function connect() { return { save() { void pg } } }\n",
    );
    let v = only(&tree, "technology");
    assert!(
        v.message.contains("pg") && v.message.contains("@t/database"),
        "{v:?}"
    );
}

#[test]
fn c69_no_cycle_between_packages() {
    let tree = Tree::valid();
    tree.write("packages/identity/package.json", r#"{ "name": "@t/identity", "exports": { ".": "./src/index.ts" }, "dependencies": { "@t/database": "workspace:*" } }"#)
        .write("packages/identity/src/index.ts", "import { connect } from '@t/database'\nexport const who = connect\n")
        .write(
            "packages/database/package.json",
            r#"{ "name": "@t/database", "exports": { ".": "./src/index.ts" }, "dependencies": { "kysely": "0.29.7", "@t/back": "workspace:*", "@t/identity": "workspace:*" } }"#,
        )
        .write(
            "packages/database/src/index.ts",
            "import { Kysely } from 'kysely'\nimport { who } from '@t/identity'\nexport function connect() { return { save() { void Kysely; void who } } }\n",
        );
    let v = only(&tree, "cycle");
    assert!(
        v.message.contains("packages/database") && v.message.contains("packages/identity"),
        "{v:?}"
    );
}

#[test]
fn c69_a_run_only_package_is_never_imported() {
    let tree = Tree::valid();
    tree.write("apps/api/package.json", r#"{ "name": "@t/api", "dependencies": { "@t/back": "workspace:*", "@t/database": "workspace:*", "@t/kernel": "workspace:*", "@t/migrations": "workspace:*" } }"#)
        .write("apps/api/src/main.ts", "import { migrations } from '@t/migrations'\nvoid migrations\n");
    assert_eq!(
        only(&tree, "run-only").fix,
        "@t/migrations is run, never imported."
    );
}

#[test]
fn c69_a_file_belongs_to_a_tier() {
    let tree = Tree::valid();
    tree.write("packages/back/src/helpers.ts", "export const x = 1\n");
    let v = only(&tree, "no-tier");
    assert_eq!(v.file, "packages/back/src/helpers.ts");
}

#[test]
fn c69_the_root_manifest_holds_only_the_project_tools() {
    let tree = Tree::valid();
    tree.write(
        "package.json",
        "{\n  \"name\": \"fixture\",\n  \"dependencies\": {\n    \"zod\": \"4.0.0\"\n  },\n  \"devDependencies\": { \"typescript\": \"1.0.0\" }\n}\n",
    );
    let v = only(&tree, "root-manifest");
    assert_eq!((v.file.as_str(), v.line), ("package.json", 4));
    assert_eq!(v.fix, "The root holds only the project's tools.");
}

#[test]
fn c71_an_undeclared_package_and_an_unresolvable_specifier_are_violations() {
    let tree = Tree::valid();
    tree.write(
        "packages/database/src/index.ts",
        "import { Kysely } from 'kysely'\nimport { gone } from './gone.ts'\nimport left from 'left-pad'\nexport function connect() { return { save() { void Kysely; void gone; void left } } }\n",
    )
    .write("node_modules/left-pad/package.json", r#"{ "name": "left-pad", "main": "index.js" }"#)
    .write("node_modules/left-pad/index.js", "export default 1\n");
    let found = violations(&tree);
    let rules: Vec<_> = found.iter().map(|v| v.rule.as_str()).collect();
    assert!(rules.contains(&"unresolved"), "{found:#?}");
    assert!(rules.contains(&"undeclared"), "{found:#?}");
    let unresolved = found.iter().find(|v| v.rule == "unresolved").unwrap();
    assert!(unresolved.message.contains("./gone.ts"), "{unresolved:?}");
    assert_eq!(unresolved.line, 2);
    let undeclared = found.iter().find(|v| v.rule == "undeclared").unwrap();
    assert!(
        undeclared.fix.contains("left-pad") && undeclared.fix.contains("@t/database"),
        "{undeclared:?}"
    );
}

#[test]
fn c71_a_path_the_package_does_not_export_resolves_to_nothing() {
    let tree = Tree::valid();
    tree.write(
        "apps/api/src/routes.ts",
        "import { seed } from '@t/back/src/flows/seed/index.ts'\nexport const serve = seed\n",
    );
    let v = only(&tree, "unresolved");
    assert!(
        v.message.contains("@t/back/src/flows/seed/index.ts"),
        "{v:?}"
    );
}

#[test]
fn rules_naming_an_unknown_tier_are_refused() {
    let tree = Tree::valid();
    tree.write(
        "architecture.rules.json",
        &support::RULES.replace(
            "\"mayImport\": [\"kernel\"]",
            "\"mayImport\": [\"nowhere\"]",
        ),
    );
    let error = analyze(tree.path(), None).unwrap_err();
    assert!(error.contains("nowhere"), "{error}");
}

fn run(tree: &Tree, args: &[&str]) -> (i32, String) {
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_architecture-analyzer"))
        .args(args)
        .current_dir(tree.path())
        .output()
        .unwrap();
    (
        output.status.code().unwrap(),
        String::from_utf8(output.stdout).unwrap() + &String::from_utf8(output.stderr).unwrap(),
    )
}

#[test]
fn c68_check_fails_naming_the_file_the_rule_and_the_fix() {
    let tree = Tree::valid();
    assert_eq!(run(&tree, &["check"]), (0, String::new()));
    tree.write(
        "apps/api/src/routes.ts",
        "import { connect } from '@t/database'\nexport const serve = connect\n",
    );
    let (code, out) = run(&tree, &["check"]);
    assert_eq!(code, 1);
    assert!(out.contains("apps/api/src/routes.ts:1"), "{out}");
    assert!(out.contains("only-from"), "{out}");
    assert!(out.contains("Only main.ts imports an adapter."), "{out}");
}

#[test]
fn check_refuses_an_unknown_command_and_a_missing_rules_file() {
    let tree = Tree::empty();
    assert_eq!(run(&tree, &["nonsense"]).0, 2);
    let (code, out) = run(&tree, &["check"]);
    assert_eq!(code, 2);
    assert!(out.contains("architecture.rules.json"), "{out}");
}

fn git(tree: &Tree, args: &[&str]) {
    let status = std::process::Command::new("git")
        .args([
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .current_dir(tree.path())
        .output()
        .unwrap();
    assert!(status.status.success(), "{status:?}");
}

#[test]
fn the_json_report_names_what_the_branch_adds_and_removes_against_its_base() {
    let tree = Tree::valid();
    git(&tree, &["init", "-q", "-b", "main"]);
    git(&tree, &["add", "-A"]);
    git(&tree, &["commit", "-q", "-m", "base"]);
    git(&tree, &["switch", "-q", "-c", "feature"]);
    tree.write(
        "apps/api/src/routes.ts",
        "import { seed } from '@t/back'\nexport const serve = seed\n",
    );
    let (code, out) = run(&tree, &["json", "--base", "main"]);
    assert_eq!(code, 0, "{out}");
    let report: serde_json::Value = serde_json::from_str(&out).unwrap();
    let base = &report["base"];
    assert_eq!(report["name"], "fixture");
    assert_eq!(base["ref"], "main");
    assert_eq!(base["head"], "feature");
    assert_eq!(
        base["added"],
        serde_json::json!([["apps/api/src", "packages/back/src/flows/seed"]])
    );
    assert_eq!(
        base["removed"],
        serde_json::json!([
            ["apps/api/src", "packages/back/src/domains/event-codes"],
            ["apps/api/src", "packages/kernel"]
        ])
    );
}

#[test]
fn a_base_is_read_with_the_tree_s_rules_even_when_it_has_none() {
    let tree = Tree::valid();
    git(&tree, &["init", "-q", "-b", "main"]);
    git(&tree, &["add", "-A"]);
    git(&tree, &["rm", "-q", "--cached", "architecture.rules.json"]);
    git(&tree, &["commit", "-q", "-m", "before the rules"]);
    tree.write(
        "apps/api/src/routes.ts",
        "import { seed } from '@t/back'\nexport const serve = seed\n",
    );
    let (code, out) = run(&tree, &["json", "--base", "main"]);
    assert_eq!(code, 0, "{out}");
    let report: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(
        report["base"]["added"],
        serde_json::json!([["apps/api/src", "packages/back/src/flows/seed"]])
    );
}

#[test]
fn a_base_from_before_the_workspace_imports_nothing() {
    let tree = Tree::valid();
    git(&tree, &["init", "-q", "-b", "main"]);
    tree.write("README.md", "before the workspace\n");
    git(&tree, &["add", "README.md"]);
    git(&tree, &["commit", "-q", "-m", "first"]);
    let (code, out) = run(&tree, &["json", "--base", "main"]);
    assert_eq!(code, 0, "{out}");
    let report: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(report["base"]["removed"], serde_json::json!([]));
    assert_eq!(
        report["base"]["added"].as_array().unwrap().len(),
        report["edges"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| (e["from"].to_string(), e["to"].to_string()))
            .collect::<std::collections::BTreeSet<_>>()
            .len()
    );
}

/// Runs `json --base <reference>` on a committed tree, with `tar` replaced by `script`.
fn with_tar(reference: &str, script: &str) -> (Option<i32>, String) {
    let tree = Tree::valid();
    git(&tree, &["init", "-q", "-b", "main"]);
    git(&tree, &["add", "-A"]);
    git(&tree, &["commit", "-q", "-m", "base"]);
    let bin = Tree::empty();
    bin.write("tar", script);
    let shim = bin.path().join("tar");
    let mut mode = std::fs::metadata(&shim).unwrap().permissions();
    std::os::unix::fs::PermissionsExt::set_mode(&mut mode, 0o755);
    std::fs::set_permissions(&shim, mode).unwrap();
    let path = format!(
        "{}:{}",
        bin.path().display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let output = std::process::Command::new(env!("CARGO_BIN_EXE_architecture-analyzer"))
        .args(["json", "--base", reference])
        .env("PATH", path)
        .current_dir(tree.path())
        .output()
        .unwrap();
    (
        output.status.code(),
        String::from_utf8(output.stderr).unwrap(),
    )
}

#[test]
fn a_missing_base_fails_naming_it_whatever_tar_makes_of_no_archive() {
    // A tar that takes an empty input for an empty archive, as bsdtar does.
    let (code, err) = with_tar("no-such-branch", "#!/bin/sh\ncat > /dev/null\n");
    assert_eq!(code, Some(2), "{err}");
    assert!(err.contains("no-such-branch"), "{err}");
}

#[test]
fn a_base_tar_cannot_extract_fails_naming_it() {
    let (code, err) = with_tar(
        "main",
        "#!/bin/sh\ncat > /dev/null\necho 'no space left' >&2\nexit 1\n",
    );
    assert_eq!(code, Some(2), "{err}");
    assert!(
        err.contains("main") && err.contains("no space left"),
        "{err}"
    );
}
