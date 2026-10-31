//! The view's server: static files, the current report, and reports pushed as events.

mod support;

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::sync::mpsc;
use std::time::Duration;

use architecture_analyzer::{Change, Module, Report, Update, Violation, serve};
use support::Tree;

fn get(address: &str, path: &str) -> (u16, String, BufReader<TcpStream>) {
    get_as(address, path, address.trim_start_matches("http://"))
}

/// A request addressed to `host`, wherever it is sent.
fn get_as(address: &str, path: &str, host: &str) -> (u16, String, BufReader<TcpStream>) {
    let mut stream = TcpStream::connect(address.trim_start_matches("http://")).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut reader = BufReader::new(stream);
    let mut status = String::new();
    reader.read_line(&mut status).unwrap();
    let mut headers = String::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if line == "\r\n" {
            break;
        }
        headers.push_str(&line);
    }
    (
        status.split(' ').nth(1).unwrap().parse().unwrap(),
        headers,
        reader,
    )
}

fn body(address: &str, path: &str) -> (u16, String) {
    let (status, _, mut stream) = get(address, path);
    let mut body = String::new();
    let _ = stream.read_to_string(&mut body);
    (status, body)
}

fn report(modules: &[(&str, &[&str])]) -> Report {
    Report {
        name: None,
        tiers: vec![],
        modules: modules
            .iter()
            .map(|(id, files)| Module {
                id: (*id).to_string(),
                tier: "t".to_string(),
                package: "p".to_string(),
                files: files.iter().map(|f| (*f).to_string()).collect(),
            })
            .collect(),
        edges: vec![],
        technologies: vec![],
        violations: vec![],
        base: None,
    }
}

fn update(report: Report) -> Update {
    Update {
        report,
        change: None,
    }
}

fn read_event(events: &mut BufReader<TcpStream>) -> String {
    let mut lines = vec![];
    loop {
        let mut line = String::new();
        events.read_line(&mut line).unwrap();
        if line.trim().is_empty() && !lines.is_empty() {
            return lines.join("");
        }
        if !line.trim().is_empty() {
            lines.push(line);
        }
    }
}

#[test]
fn serves_the_view_the_report_and_its_updates() {
    let ui = Tree::empty();
    ui.write("index.html", "<h1>view</h1>")
        .write("assets/app.js", "1");
    let (tx, rx) = mpsc::channel();
    let address = serve(
        0,
        Some(ui.path().to_path_buf()),
        ui.path().to_path_buf(),
        None,
        rx,
    )
    .unwrap();
    tx.send(update(report(&[("a", &[])]))).unwrap();
    std::thread::sleep(Duration::from_millis(100));

    assert_eq!(body(&address, "/"), (200, "<h1>view</h1>".to_string()));
    // A rebuilt view is read at the next load, never from the browser's cache.
    let (_, headers, _) = get(&address, "/");
    assert!(
        headers.to_lowercase().contains("cache-control: no-cache"),
        "{headers}"
    );
    let (status, headers, _) = get(&address, "/assets/app.js");
    assert_eq!(status, 200);
    assert!(
        headers.to_lowercase().contains("text/javascript"),
        "{headers}"
    );
    let (status, json) = body(&address, "/graph.json?x=1");
    assert_eq!(status, 200);
    assert!(json.contains(r#""id":"a""#), "{json}");
    // The identity of the sources it was built from, for the view to compare
    // with its own.
    let (status, identity) = body(&address, "/version.json");
    assert_eq!(status, 200);
    assert_eq!(identity, architecture_analyzer::IDENTITY);
    assert!(identity.contains(r#""fingerprint":""#), "{identity}");
    // The format of what it sends, for the view to compare with the one it reads.
    let (status, format) = body(&address, "/report.schema.json");
    assert_eq!(status, 200);
    assert_eq!(format, architecture_analyzer::report_schema());
    assert_eq!(body(&address, "/../secret").0, 404);
    assert_eq!(body(&address, "/missing.css").0, 404);

    let (status, headers, mut events) = get(&address, "/events");
    assert_eq!(status, 200);
    assert!(
        headers.to_lowercase().contains("text/event-stream"),
        "{headers}"
    );
    let first = read_event(&mut events);
    assert!(first.starts_with("event: graph\n"), "{first}");
    assert!(first.contains(r#""id":"a""#), "{first}");
    tx.send(update(report(&[("b", &[])]))).unwrap();
    assert!(read_event(&mut events).contains(r#""id":"b""#));
}

#[test]
fn never_serves_a_file_outside_the_view() {
    let tree = Tree::empty();
    tree.write("view/index.html", "<h1>view</h1>")
        .write("secret.txt", "outside the view");
    let (_tx, rx) = mpsc::channel();
    let address = serve(
        0,
        Some(tree.path().join("view")),
        tree.path().to_path_buf(),
        None,
        rx,
    )
    .unwrap();
    assert_eq!(body(&address, "/index.html").0, 200);
    for path in [
        "/../secret.txt",
        "/assets/../../secret.txt",
        "/%2e%2e/secret.txt",
        "//secret.txt",
    ] {
        assert_eq!(body(&address, path).0, 404, "{path}");
    }
}

#[test]
fn serves_an_analyzed_file_and_nothing_else() {
    let tree = Tree::empty();
    tree.write("src/a.ts", "export const a = 1\n")
        .write("src/b c.ts", "export const b = 2\n")
        .write("secret.txt", "not analyzed");
    let (tx, rx) = mpsc::channel();
    let address = serve(0, None, tree.path().to_path_buf(), None, rx).unwrap();
    tx.send(update(report(&[("src", &["src/a.ts", "src/b c.ts"])])))
        .unwrap();
    std::thread::sleep(Duration::from_millis(100));

    assert_eq!(
        body(&address, "/source/src/a.ts"),
        (200, "export const a = 1\n".to_string())
    );
    assert_eq!(
        body(&address, "/source/src/b%20c.ts"),
        (200, "export const b = 2\n".to_string())
    );
    assert_eq!(body(&address, "/source/secret.txt").0, 404);
    assert_eq!(body(&address, "/source/src/../secret.txt").0, 404);
    assert_eq!(body(&address, "/source/src/missing.ts").0, 404);
    assert_eq!(body(&address, "/source/src/a%zz.ts").0, 404);
    assert_eq!(body(&address, "/source/src/a%2").0, 404);
    assert_eq!(body(&address, "/source/src/%ff.ts").0, 404);
}

#[test]
fn keeps_the_session_history_and_pushes_each_change() {
    let (tx, rx) = mpsc::channel();
    let address = serve(0, None, std::env::temp_dir(), None, rx).unwrap();
    tx.send(update(report(&[]))).unwrap();
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(body(&address, "/history.json"), (200, "[]".to_string()));

    let (_, _, mut events) = get(&address, "/events");
    read_event(&mut events);
    let breach = Violation {
        rule: "tier".to_string(),
        file: "a/x.ts".to_string(),
        line: 3,
        message: "m".to_string(),
        fix: "f".to_string(),
    };
    tx.send(Update {
        report: report(&[]),
        change: Some(Change {
            at: 1_000,
            files: vec!["a/x.ts".to_string()],
            added: vec![("a".to_string(), "b".to_string())],
            removed: vec![],
            breaches: vec![breach],
            fixed: vec![],
        }),
    })
    .unwrap();
    let change = read_event(&mut events);
    assert!(change.starts_with("event: change\n"), "{change}");
    assert!(change.contains(r#""files":["a/x.ts"]"#), "{change}");
    assert!(read_event(&mut events).starts_with("event: graph\n"));

    let (status, history) = body(&address, "/history.json");
    assert_eq!(status, 200);
    let history: serde_json::Value = serde_json::from_str(&history).unwrap();
    assert_eq!(history[0]["at"], 1_000);
    assert_eq!(history[0]["added"][0], serde_json::json!(["a", "b"]));
    assert_eq!(history[0]["breaches"][0]["rule"], "tier");
}

#[test]
fn a_client_connecting_before_the_first_analysis_waits_for_it() {
    let (tx, rx) = mpsc::channel();
    let address = serve(0, None, std::env::temp_dir(), None, rx).unwrap();
    let (status, _, mut events) = get(&address, "/events");
    assert_eq!(status, 200);
    tx.send(update(report(&[("a", &[])]))).unwrap();
    let first = read_event(&mut events);
    assert!(first.starts_with("event: graph\n"), "{first}");
    assert!(first.contains(r#""id":"a""#), "{first}");
}

#[test]
fn without_a_view_only_the_report_is_served() {
    let (_tx, rx) = mpsc::channel();
    let address = serve(0, None, std::env::temp_dir(), None, rx).unwrap();
    assert_eq!(body(&address, "/").0, 404);
    assert_eq!(body(&address, "/graph.json").0, 200);
}

#[test]
fn answers_only_requests_addressed_to_its_loopback_address_or_its_host() {
    let tree = Tree::empty();
    tree.write("index.html", "<h1>view</h1>")
        .write("src/a.ts", "export const a = 1\n");
    let (tx, rx) = mpsc::channel();
    let address = serve(
        0,
        Some(tree.path().to_path_buf()),
        tree.path().to_path_buf(),
        Some("arch.x.polly.localhost".to_string()),
        rx,
    )
    .unwrap();
    tx.send(update(report(&[("src", &["src/a.ts"])]))).unwrap();
    std::thread::sleep(Duration::from_millis(100));
    let loopback = address.trim_start_matches("http://");
    let port = loopback.rsplit(':').next().unwrap();
    for path in [
        "/",
        "/graph.json",
        "/history.json",
        "/source/src/a.ts",
        "/events",
    ] {
        for host in [
            loopback,
            "arch.x.polly.localhost",
            "ARCH.x.polly.localhost:443",
        ] {
            assert_eq!(get_as(&address, path, host).0, 200, "{host}{path}");
        }
        for host in [
            "evil.example",
            &format!("evil.example:{port}"),
            &format!("localhost:{port}"),
            "arch.x.polly.localhost.evil.example",
            "arch.y.polly.localhost",
            "127.0.0.1",
            "",
        ] {
            assert_eq!(get_as(&address, path, host).0, 403, "{host}{path}");
        }
    }
}

#[test]
fn without_its_host_answers_its_loopback_address_only() {
    let (_tx, rx) = mpsc::channel();
    let address = serve(0, None, std::env::temp_dir(), None, rx).unwrap();
    let loopback = address.trim_start_matches("http://");
    assert_eq!(get_as(&address, "/graph.json", loopback).0, 200);
    assert_eq!(
        get_as(&address, "/graph.json", "arch.x.polly.localhost").0,
        403
    );
}

#[test]
fn watch_answers_the_host_it_is_given() {
    let tree = Tree::valid();
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_architecture-analyzer"))
        .args([
            "watch",
            "--port",
            "0",
            "--allow-host",
            "arch.x.polly.localhost",
        ])
        .current_dir(tree.path())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let mut address = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut address)
        .unwrap();
    let address = address.trim().to_string();
    let allowed = address.starts_with("http://")
        && get_as(&address, "/graph.json", "arch.x.polly.localhost").0 == 200;
    let refused =
        address.starts_with("http://") && get_as(&address, "/graph.json", "evil.example").0 == 403;
    child.kill().unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        allowed && refused,
        "{address}{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn a_port_in_use_is_refused() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (_tx, rx) = mpsc::channel();
    assert!(
        serve(port, None, std::env::temp_dir(), None, rx)
            .unwrap_err()
            .contains(&port.to_string())
    );
}
