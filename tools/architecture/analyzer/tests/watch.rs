//! The watch mode: a graph pushed when the architecture or a use of an imported name
//! changes only (C66, C67), and an analyzer that costs nothing while nothing changes (C74).

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
    let violation = &next["violations"][0];
    assert_eq!(violation["rule"], "only-from");
    assert_eq!(violation["file"], "apps/api/src/routes.ts");
    assert_eq!(violation["line"], 1);
    assert_eq!(violation["fix"], "Only main.ts imports an adapter.");
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

const START_LESSON: &str = "packages/back/src/flows/start-lesson/index.ts";
const START_LESSON_IMPORTS: &str = "import type { Code } from '@t/kernel'\nimport { bind, type EventCodes } from '../../domains/event-codes/index.ts'\n";

#[test]
fn c67_a_body_change_that_moves_no_use_pushes_nothing() {
    let tree = Tree::valid();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    pushed(&rx, Duration::from_secs(5)).expect("the first graph");
    tree.write(
        START_LESSON,
        &format!(
            "{START_LESSON_IMPORTS}export function startLesson(store: EventCodes) {{ return (code: Code) => bind(store, code) }}\nconsole.log('changed')\n"
        ),
    );
    assert!(pushed(&rx, Duration::from_millis(700)).is_none());
}

#[test]
fn c67_a_body_change_that_moves_a_use_pushes_the_graph_and_no_change() {
    let tree = Tree::valid();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    pushed(&rx, Duration::from_secs(5)).expect("the first graph");
    tree.write(
        START_LESSON,
        &format!(
            "{START_LESSON_IMPORTS}export function startLesson(store: EventCodes) {{\n  return (code: Code) => bind(store, code)\n}}\n"
        ),
    );
    let update = rx
        .recv_timeout(Duration::from_secs(1))
        .expect("a graph within 1 s");
    // No pair and no rule changed: nothing for the session's history.
    assert!(update.change.is_none());
    let report = serde_json::to_value(&update.report).unwrap();
    let edge = report["edges"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["file"] == START_LESSON && e["to"] == "packages/back/src/domains/event-codes")
        .expect("the import of the domain");
    let lines: Vec<_> = edge["uses"]
        .as_array()
        .unwrap()
        .iter()
        .map(|u| u["line"].as_u64().unwrap())
        .collect();
    assert_eq!(lines, [3, 4]);
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

fn modules(report: &serde_json::Value) -> Vec<String> {
    report["modules"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["id"].as_str().unwrap().to_string())
        .collect()
}

#[test]
fn a_moved_directory_s_modules_move_with_it_and_its_files_are_followed_there() {
    let tree = Tree::valid();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    rx.recv_timeout(Duration::from_secs(5))
        .expect("the first graph");
    std::fs::rename(
        tree.path().join("packages/back/src/flows/seed"),
        tree.path().join("packages/back/src/flows/sown"),
    )
    .unwrap();
    let moved = pushed(&rx, Duration::from_secs(2)).expect("a graph once the directory moved");
    let ids = modules(&moved);
    assert!(
        ids.contains(&"packages/back/src/flows/sown".to_string()),
        "{ids:?}"
    );
    assert!(
        !ids.contains(&"packages/back/src/flows/seed".to_string()),
        "{ids:?}"
    );
    tree.write(
        "packages/back/src/flows/sown/index.ts",
        "import '../start-lesson/index.ts'\n",
    );
    let change = rx
        .recv_timeout(Duration::from_secs(2))
        .expect("a graph for a file of the moved directory")
        .change
        .expect("what changed");
    assert_eq!(change.files, ["packages/back/src/flows/sown/index.ts"]);
}

#[test]
fn a_directory_moved_out_of_the_tree_or_removed_leaves_the_graph() {
    let tree = Tree::valid();
    let outside = Tree::empty();
    let (tx, rx) = mpsc::channel();
    watch(tree.path(), None, tx).unwrap();
    pushed(&rx, Duration::from_secs(5)).expect("the first graph");
    std::fs::rename(
        tree.path().join("packages/back/src/flows/seed"),
        outside.path().join("seed"),
    )
    .unwrap();
    let next = pushed(&rx, Duration::from_secs(2)).expect("a graph once the directory left");
    let ids = modules(&next);
    assert!(
        !ids.contains(&"packages/back/src/flows/seed".to_string()),
        "{ids:?}"
    );
    // Its old watch no longer speaks for the tree.
    outside.write("seed/index.ts", "import '../start-lesson/index.ts'\n");
    assert!(pushed(&rx, Duration::from_millis(700)).is_none());

    std::fs::remove_dir_all(tree.path().join("packages/back/src/domains/event-codes")).unwrap();
    let next = pushed(&rx, Duration::from_secs(2)).expect("a graph once the directory is gone");
    let ids = modules(&next);
    assert!(
        !ids.contains(&"packages/back/src/domains/event-codes".to_string()),
        "{ids:?}"
    );
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

/// The CPU time a process has used, in hundredths of a second, and its resident
/// memory, in KB: from /proc on Linux.
#[cfg(target_os = "linux")]
fn usage(pid: u32) -> (u64, u64) {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).unwrap();
    let ticks: u64 = stat
        .rsplit(')')
        .next()
        .unwrap()
        .split_whitespace()
        .skip(11)
        .take(2)
        .map(|f| f.parse::<u64>().unwrap())
        .sum();
    let status = std::fs::read_to_string(format!("/proc/{pid}/status")).unwrap();
    let rss_kb = status
        .lines()
        .find(|l| l.starts_with("VmRSS"))
        .unwrap()
        .split_whitespace()
        .nth(1)
        .unwrap()
        .parse()
        .unwrap();
    // Clock ticks, at 100 per second.
    (ticks, rss_kb)
}

/// The same from ps on macOS, whose time reads `[[dd-]hh:]mm:ss.cc`.
#[cfg(target_os = "macos")]
fn usage(pid: u32) -> (u64, u64) {
    let output = std::process::Command::new("ps")
        .args(["-o", "time=,rss=", "-p", &pid.to_string()])
        .output()
        .unwrap();
    let text = String::from_utf8(output.stdout).unwrap();
    let mut fields = text.split_whitespace();
    let time = fields.next().unwrap();
    let rss_kb = fields.next().unwrap().parse().unwrap();
    let (whole, hundredths) = time.split_once('.').unwrap_or((time, "0"));
    let seconds = whole
        .split([':', '-'])
        .fold(0, |total, part| total * 60 + part.parse::<u64>().unwrap());
    (seconds * 100 + hundredths.parse::<u64>().unwrap(), rss_kb)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
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
    std::thread::sleep(Duration::from_secs(1));
    let (before, _) = usage(child.id());
    std::thread::sleep(Duration::from_secs(10));
    let (after, rss_kb) = usage(child.id());
    child.kill().unwrap();
    child.wait().unwrap();
    assert_eq!(
        after - before,
        0,
        "hundredths of a second of CPU used while idle"
    );
    assert!(rss_kb < 20 * 1024, "resident memory {rss_kb} KB");
}
