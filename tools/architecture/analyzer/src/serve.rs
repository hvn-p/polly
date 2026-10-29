//! The view's server: its static files, the current report, the session's history of
//! changes, the analyzed files' content, and each change pushed as server-sent events.

use std::collections::BTreeSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};

use tiny_http::{Header, Response, Server};

use crate::{Change, Update};

/// The latest report, the files it was drawn from, the changes since the start, and the
/// open event streams.
#[derive(Default)]
struct State {
    report: String,
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
        self.report = serde_json::to_string(report).unwrap_or_default();
        let mut events = vec![];
        if let Some(change) = update.change {
            events.push(event(
                "change",
                &serde_json::to_string(&change).unwrap_or_default(),
            ));
            self.history.push(change);
        }
        events.push(event("graph", &self.report));
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
/// 127.0.0.1:`port` (0 for any free port); returns the address once listening.
///
/// # Errors
/// When the port cannot be bound.
pub fn serve(
    port: u16,
    ui: Option<PathBuf>,
    root: PathBuf,
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
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let state = Arc::clone(&state);
            let ui = ui.clone();
            let root = Arc::clone(&root);
            std::thread::spawn(move || answer(request, &state, ui.as_deref(), &root));
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

fn answer(request: tiny_http::Request, state: &Mutex<State>, ui: Option<&Path>, root: &Path) {
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
            let report = state.lock().map(|s| s.report.clone()).unwrap_or_default();
            request.respond(json(report))
        }
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
                let _ = tx.send(event("graph", &state.report));
                state.streams.push(tx);
            }
            let mut writer = request.into_writer();
            let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
            if writer.write_all(head.as_bytes()).is_ok() {
                for event in rx {
                    if writer
                        .write_all(event.as_bytes())
                        .and_then(|()| writer.flush())
                        .is_err()
                    {
                        break;
                    }
                }
            }
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
