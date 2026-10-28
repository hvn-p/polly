//! The view's server: static files, the current report, and reports pushed as events.

mod support;

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::sync::mpsc;
use std::time::Duration;

use architecture_analyzer::serve;
use support::Tree;

fn get(address: &str, path: &str) -> (u16, String, BufReader<TcpStream>) {
    let mut stream = TcpStream::connect(address.trim_start_matches("http://")).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"
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

#[test]
fn serves_the_view_the_report_and_its_updates() {
    let ui = Tree::empty();
    ui.write("index.html", "<h1>view</h1>")
        .write("assets/app.js", "1");
    let (tx, rx) = mpsc::channel();
    let address = serve(0, Some(ui.path().to_path_buf()), rx).unwrap();
    tx.send(r#"{"n":1}"#.to_string()).unwrap();
    std::thread::sleep(Duration::from_millis(100));

    assert_eq!(body(&address, "/"), (200, "<h1>view</h1>".to_string()));
    let (status, headers, _) = get(&address, "/assets/app.js");
    assert_eq!(status, 200);
    assert!(
        headers.to_lowercase().contains("text/javascript"),
        "{headers}"
    );
    assert_eq!(
        body(&address, "/graph.json?x=1"),
        (200, r#"{"n":1}"#.to_string())
    );
    assert_eq!(body(&address, "/../secret").0, 404);
    assert_eq!(body(&address, "/missing.css").0, 404);

    let (status, headers, mut events) = get(&address, "/events");
    assert_eq!(status, 200);
    assert!(
        headers.to_lowercase().contains("text/event-stream"),
        "{headers}"
    );
    let mut read_event = || {
        let mut lines = vec![];
        loop {
            let mut line = String::new();
            events.read_line(&mut line).unwrap();
            if line.trim().is_empty() && !lines.is_empty() {
                return lines.join("");
            }
            if !line.trim().is_empty()
                && !line
                    .chars()
                    .all(|c| c.is_ascii_hexdigit() || c.is_whitespace())
            {
                lines.push(line);
            }
        }
    };
    assert_eq!(
        read_event(),
        "event: graph\r\ndata: {\"n\":1}\r\n".replace("\r\n", "\n")
    );
    tx.send(r#"{"n":2}"#.to_string()).unwrap();
    assert!(read_event().contains(r#"{"n":2}"#));
}

#[test]
fn without_a_view_only_the_report_is_served() {
    let (_tx, rx) = mpsc::channel();
    let address = serve(0, None, rx).unwrap();
    assert_eq!(body(&address, "/").0, 404);
    assert_eq!(body(&address, "/graph.json").0, 200);
}

#[test]
fn a_port_in_use_is_refused() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (_tx, rx) = mpsc::channel();
    assert!(
        serve(port, None, rx)
            .unwrap_err()
            .contains(&port.to_string())
    );
}
