//! The view's server: its static files, the current report, and each new report pushed
//! as a server-sent event.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};

use tiny_http::{Header, Response, Server};

/// The latest report and the open event streams.
#[derive(Default)]
struct State {
    report: String,
    streams: Vec<Sender<String>>,
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

/// Serves `ui` and the reports on 127.0.0.1:`port` (0 for any free port); returns the
/// address once listening.
///
/// # Errors
/// When the port cannot be bound.
pub fn serve(port: u16, ui: Option<PathBuf>, reports: Receiver<String>) -> Result<String, String> {
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
        for report in reports {
            if let Ok(mut state) = fan_out.lock() {
                state.streams.retain(|s| s.send(report.clone()).is_ok());
                state.report = report;
            }
        }
    });
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let state = Arc::clone(&state);
            let ui = ui.clone();
            std::thread::spawn(move || answer(request, &state, ui.as_deref()));
        }
    });
    Ok(address)
}

fn answer(request: tiny_http::Request, state: &Mutex<State>, ui: Option<&Path>) {
    let url = request.url().split('?').next().unwrap_or("/").to_string();
    let _ = match url.as_str() {
        "/graph.json" => {
            let report = state.lock().map(|s| s.report.clone()).unwrap_or_default();
            request.respond(
                Response::from_string(report)
                    .with_header(header("Content-Type", "application/json")),
            )
        }
        "/events" => {
            // Written by hand: tiny_http buffers a streamed body until 8 KB.
            let (tx, rx) = mpsc::channel();
            if let Ok(mut state) = state.lock() {
                let _ = tx.send(state.report.clone());
                state.streams.push(tx);
            }
            let mut writer = request.into_writer();
            let head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
            if writer.write_all(head.as_bytes()).is_ok() {
                for report in rx {
                    let event = format!("event: graph\ndata: {report}\n\n");
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
                        .with_header(header("Content-Type", content_type(&path))),
                ),
                None => request.respond(Response::from_string("not found").with_status_code(404)),
            }
        }
    };
}
