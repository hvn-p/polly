//! The watch mode: a graph pushed on an architecture change only (C66, C67), and an
//! analyzer that costs nothing while nothing changes (C74).

mod support;

use std::sync::mpsc;
use std::time::Duration;

use architecture_analyzer::{Update, watch};
use support::Tree;

fn pushed(rx: &mpsc::Receiver<Update>, within: Duration) -> Option<serde_json::Value> {
    rx.recv_timeout(within)
        .ok()
        .map(|update| serde_json::to_value(&update.report).unwrap())
}

#[test]
fn c66_a_forbidden_import_is_pushed_within_a_second() {
    let tree = Tree::valid();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    let first = pushed(&rx, Duration::from_secs(5)).expect("the first graph");
    assert_eq!(first["violations"], serde_json::json!([]));
    tree.write(
        "apps/api/src/routes.ts",
        "import { connect } from '@t/database'\nexport const serve = connect\n",
    );
    let next = pushed(&rx, Duration::from_secs(1)).expect("a graph within 1 s");
    assert_eq!(next["violations"][0]["rule"], "only-from");
}

#[test]
fn each_change_says_what_it_changed() {
    let tree = Tree::valid();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    let first = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("the first graph");
    assert!(first.change.is_none());
    tree.write(
        "apps/api/src/routes.ts",
        "import { connect } from '@t/database'\nexport const serve = connect\n",
    );
    let change = rx
        .recv_timeout(Duration::from_secs(1))
        .expect("a graph within 1 s")
        .change
        .expect("what changed");
    assert_eq!(change.files, ["apps/api/src/routes.ts"]);
    assert!(change.at > 0);
    assert_eq!(change.added, []);
    assert!(
        change
            .removed
            .contains(&("apps/api/src".to_string(), "packages/kernel".to_string())),
        "{:?}",
        change.removed
    );
    assert_eq!(change.breaches[0].rule, "only-from");
    assert_eq!(change.fixed, []);

    tree.write(
        "apps/api/src/routes.ts",
        "export function serve(x: unknown): void {}\n",
    );
    let change = rx
        .recv_timeout(Duration::from_secs(1))
        .expect("a graph within 1 s")
        .change
        .expect("what changed");
    assert_eq!(change.fixed[0].rule, "only-from");
    assert_eq!(change.breaches, []);
}

#[test]
fn c67_a_body_change_pushes_nothing() {
    let tree = Tree::valid();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    pushed(&rx, Duration::from_secs(5)).expect("the first graph");
    tree.write(
        "packages/back/src/flows/seed/index.ts",
        "export function seed(): void { console.log('changed') }\n",
    );
    assert!(pushed(&rx, Duration::from_millis(700)).is_none());
}

#[test]
fn a_new_directory_and_a_removed_file_are_followed() {
    let tree = Tree::valid();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    pushed(&rx, Duration::from_secs(5)).expect("the first graph");
    tree.write(
        "packages/back/src/flows/new-one/index.ts",
        "import '../seed/index.ts'\n",
    );
    let next = pushed(&rx, Duration::from_secs(2)).expect("a graph for the new directory");
    assert_eq!(next["violations"][0]["rule"], "isolated");
    tree.remove("packages/back/src/flows/new-one/index.ts");
    let next = pushed(&rx, Duration::from_secs(2)).expect("a graph once the file is gone");
    assert_eq!(next["violations"], serde_json::json!([]));
}

#[test]
fn a_rules_change_is_pushed() {
    let tree = Tree::valid();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    pushed(&rx, Duration::from_secs(5)).expect("the first graph");
    tree.write(
        "architecture.rules.json",
        &support::RULES.replace("\"mayImport\": [\"kernel\"]", "\"mayImport\": []"),
    );
    let next = pushed(&rx, Duration::from_secs(2)).expect("a graph for the new rules");
    assert_eq!(next["violations"][0]["rule"], "tier");
}

#[cfg(target_os = "linux")]
#[test]
fn c74_an_idle_watch_on_the_repository_uses_no_cpu_and_little_memory() {
    use std::io::{BufRead, BufReader};
    let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .unwrap();
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_architecture-analyzer"))
        .args(["watch", "--port", "0"])
        .current_dir(&repository)
        .stdout(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let mut ready = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut ready)
        .unwrap();
    assert!(ready.contains("http://127.0.0.1:"), "{ready}");
    let proc = format!("/proc/{}", child.id());
    let cpu = || {
        let stat = std::fs::read_to_string(format!("{proc}/stat")).unwrap();
        let fields: Vec<u64> = stat
            .rsplit(')')
            .next()
            .unwrap()
            .split_whitespace()
            .skip(11)
            .take(2)
            .map(|f| f.parse().unwrap())
            .collect();
        fields[0] + fields[1]
    };
    std::thread::sleep(Duration::from_secs(1));
    let before = cpu();
    std::thread::sleep(Duration::from_secs(10));
    let used = cpu() - before;
    let status = std::fs::read_to_string(format!("{proc}/status")).unwrap();
    let rss_kb: u64 = status
        .lines()
        .find(|l| l.starts_with("VmRSS"))
        .unwrap()
        .split_whitespace()
        .nth(1)
        .unwrap()
        .parse()
        .unwrap();
    child.kill().unwrap();
    child.wait().unwrap();
    assert_eq!(used, 0, "clock ticks used while idle");
    assert!(rss_kb < 20 * 1024, "resident memory {rss_kb} KB");
}
