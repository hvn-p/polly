//! The view's server: its static files, the current report, the session's history of
//! changes, the analyzed files' content, and each change pushed as server-sent events.

use std::collections::BTreeSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tiny_http::{Header, Response, Server};

use crate::{Change, Update};

/// The latest report, none before the first analysis; the files it was drawn from; the
/// changes since the start; and the open event streams.
#[derive(Default)]
struct State {
    report: Option<String>,
    sources: BTreeSet<String>,
    history: Vec<Change>,
    streams: Vec<Sender<String>>,
}

impl State {
    fn apply(&mut self, update: Update) {
        let report = &update.report;
        self.sources = report
            .modules
            .iter()
            .flat_map(|m| m.files.iter().cloned())
            .chain(report.edges.iter().map(|e| e.file.clone()))
            .chain(report.technologies.iter().map(|t| t.file.clone()))
            .chain(report.violations.iter().map(|v| v.file.clone()))
            .collect();
        let report = serde_json::to_string(report).unwrap_or_default();
        let mut events = vec![];
        if let Some(change) = update.change {
            events.push(event(
                "change",
                &serde_json::to_string(&change).unwrap_or_default(),
            ));
            self.history.push(change);
        }
        events.push(event("graph", &report));
        self.report = Some(report);
        self.streams
            .retain(|s| events.iter().all(|e| s.send(e.clone()).is_ok()));
    }
}

fn event(name: &str, data: &str) -> String {
    format!("event: {name}\ndata: {data}\n\n")
}

/// A URL path's percent-escapes decoded; none for an invalid escape or text.
fn decode(path: &str) -> Option<String> {
    let bytes = path.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes())
        .unwrap_or_else(|()| unreachable!("static header"))
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// Serves `ui`, the reports and the analyzed files of the tree at `root` on
/// 127.0.0.1:`port` (0 for any free port), to requests addressed to that address or to
/// `host`, the name a proxy routes to it; returns the address once listening.
///
/// # Errors
/// When the port cannot be bound.
pub fn serve(
    port: u16,
    ui: Option<PathBuf>,
    root: PathBuf,
    host: Option<String>,
    updates: Receiver<Update>,
) -> Result<String, String> {
    let server =
        Arc::new(Server::http(("127.0.0.1", port)).map_err(|e| format!("127.0.0.1:{port}: {e}"))?);
    let address = format!(
        "http://{}",
        server
            .server_addr()
            .to_ip()
            .map_or_else(|| "?".to_string(), |a| a.to_string())
    );
    let state = Arc::new(Mutex::new(State::default()));
    let fan_out = Arc::clone(&state);
    std::thread::spawn(move || {
        for update in updates {
            if let Ok(mut state) = fan_out.lock() {
                state.apply(update);
            }
        }
    });
    let root = Arc::new(root);
    let hosts = Arc::new(Hosts {
        loopback: address.trim_start_matches("http://").to_string(),
        name: host.map(|h| h.to_ascii_lowercase()),
    });
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let state = Arc::clone(&state);
            let ui = ui.clone();
            let hosts = Arc::clone(&hosts);
            let root = Arc::clone(&root);
            std::thread::spawn(move || answer(request, &state, ui.as_deref(), &root, &hosts));
        }
    });
    Ok(address)
}

fn json(body: String) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body).with_header(header("Content-Type", "application/json"))
}

fn not_found() -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string("not found").with_status_code(404)
}

/// An analyzed file's content; none for any other path.
fn source(state: &Mutex<State>, root: &Path, path: &str) -> Option<Vec<u8>> {
    let file = decode(path)?;
    let analyzed = state.lock().ok()?.sources.contains(&file);
    analyzed.then(|| std::fs::read(root.join(&file)).ok())?
}

/// How long an event stream stays silent before a keepalive.
const KEEPALIVE: Duration = Duration::from_secs(15);

/// Writes an event stream's head, then each event, and a comment after `keepalive`
/// without one, until a write fails: a closed tab is noticed at the next keepalive, which
/// ends its thread and drops its stream.
fn stream(writer: &mut dyn Write, events: &Receiver<String>, keepalive: Duration) {
    let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
    let mut send = |text: &str| {
        writer
            .write_all(text.as_bytes())
            .and_then(|()| writer.flush())
            .is_ok()
    };
    if !send(head) {
        return;
    }
    loop {
        let written = match events.recv_timeout(keepalive) {
            Ok(event) => send(&event),
            Err(RecvTimeoutError::Timeout) => send(": keepalive\n\n"),
            Err(RecvTimeoutError::Disconnected) => false,
        };
        if !written {
            return;
        }
    }
}

/// The hosts a request may be addressed to: the server's loopback address, and the name a
/// proxy routes to it, on any port. Any other is refused, so a page whose own name
/// resolves to the loopback (DNS rebinding) reads nothing.
struct Hosts {
    loopback: String,
    name: Option<String>,
}

impl Hosts {
    fn allow(&self, host: &str) -> bool {
        let host = host.to_ascii_lowercase();
        host == self.loopback
            || self.name.as_deref().is_some_and(|name| {
                host.strip_prefix(name).is_some_and(|port| {
                    port.is_empty()
                        || port
                            .strip_prefix(':')
                            .is_some_and(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
                })
            })
    }
}

fn answer(
    request: tiny_http::Request,
    state: &Mutex<State>,
    ui: Option<&Path>,
    root: &Path,
    hosts: &Hosts,
) {
    let host = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Host"))
        .map(|h| h.value.as_str());
    if !host.is_some_and(|h| hosts.allow(h)) {
        let _ = request.respond(Response::from_string("forbidden host").with_status_code(403));
        return;
    }
    let url = request.url().split('?').next().unwrap_or("/").to_string();
    if let Some(path) = url.strip_prefix("/source/") {
        let _ = match source(state, root, path) {
            Some(bytes) => request.respond(
                Response::from_data(bytes)
                    .with_header(header("Content-Type", "text/plain; charset=utf-8")),
            ),
            None => request.respond(not_found()),
        };
        return;
    }
    let _ = match url.as_str() {
        "/graph.json" => {
            let report = state
                .lock()
                .ok()
                .and_then(|s| s.report.clone())
                .unwrap_or_default();
            request.respond(json(report))
        }
        "/version.json" => request.respond(json(crate::IDENTITY.to_string())),
        "/report.schema.json" => request.respond(json(crate::report_schema())),
        "/history.json" => {
            let history = state
                .lock()
                .map(|s| serde_json::to_string(&s.history).unwrap_or_default())
                .unwrap_or_default();
            request.respond(json(history))
        }
        "/events" => {
            // Written by hand: tiny_http buffers a streamed body until 8 KB.
            let (tx, rx) = mpsc::channel();
            if let Ok(mut state) = state.lock() {
                // Before the first analysis, the stream waits for it.
                if let Some(report) = &state.report {
                    let _ = tx.send(event("graph", report));
                }
                state.streams.push(tx);
            }
            stream(&mut request.into_writer(), &rx, KEEPALIVE);
            Ok(())
        }
        _ => {
            let file = ui.and_then(|dir| {
                let relative = if url == "/" {
                    "index.html"
                } else {
                    url.trim_start_matches('/')
                };
                (!relative
                    .split('/')
                    .any(|part| part == ".." || part.is_empty()))
                .then(|| dir.join(relative))
            });
            match file.and_then(|f| std::fs::read(&f).ok().map(|bytes| (f, bytes))) {
                Some((path, bytes)) => request.respond(
                    Response::from_data(bytes)
                        .with_header(header("Content-Type", content_type(&path)))
                        .with_header(header("Cache-Control", "no-cache")),
                ),
                None => request.respond(not_found()),
            }
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A browser tab that takes `open` writes, then is closed.
    struct Tab {
        written: String,
        open: usize,
    }

    impl Write for Tab {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            if self.open == 0 {
                return Err(std::io::ErrorKind::BrokenPipe.into());
            }
            self.open -= 1;
            self.written.push_str(&String::from_utf8_lossy(buf));
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn a_silent_stream_is_kept_alive_and_dropped_once_its_tab_is_closed() {
        let (events, rx) = mpsc::channel::<String>();
        let (done, ended) = mpsc::channel();
        std::thread::spawn(move || {
            let mut tab = Tab {
                written: String::new(),
                open: 2,
            };
            stream(&mut tab, &rx, Duration::from_millis(10));
            let _ = done.send(tab.written);
        });
        // No event comes, and the state still holds the stream's sender.
        let written = ended
            .recv_timeout(Duration::from_secs(2))
            .expect("the stream ends once a keepalive fails");
        assert!(written.ends_with("\r\n\r\n: keepalive\n\n"), "{written}");
        drop(events);
    }
}
