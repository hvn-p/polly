//! The analyzer's command line.
//!
//! - `check`: prints every violation with its fix; exit 1 when any.
//! - `json [--base <ref>]`: prints the report.
//! - `schema`: prints the rules file's JSON Schema.
//! - `report-schema`: prints the JSON Schema of what `watch` sends its view.
//! - `watch [--port <n>] [--ui <dir>] [--base <ref>] [--allow-host <name>]`: serves the
//!   view, the analyzed files and the session's history, and pushes each change to the
//!   architecture; prints its address on its first line. It answers requests addressed
//!   to that address, or to the host name a proxy routes to it.
//!
//! Run from the repository root, or give it with `--root <dir>`.

use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::mpsc;

use architecture_analyzer::{analyze, render, report_schema, schema, serve, watch};

struct Options {
    command: String,
    root: PathBuf,
    base: Option<String>,
    port: u16,
    ui: Option<PathBuf>,
    host: Option<String>,
}

fn options(mut args: impl Iterator<Item = String>) -> Result<Options, String> {
    let command = args
        .next()
        .ok_or("usage: architecture-analyzer check|json|schema|report-schema|watch [options]")?;
    let mut options = Options {
        command,
        root: PathBuf::from("."),
        base: None,
        port: 0,
        ui: None,
        host: None,
    };
    while let Some(flag) = args.next() {
        let value = args.next().ok_or_else(|| format!("{flag} needs a value"))?;
        match flag.as_str() {
            "--root" => options.root = PathBuf::from(value),
            "--base" => options.base = Some(value),
            "--port" => {
                options.port = value
                    .parse()
                    .map_err(|_| format!("--port {value}: not a port"))?;
            }
            "--ui" => options.ui = Some(PathBuf::from(value)),
            "--allow-host" => options.host = Some(value),
            other => return Err(format!("unknown option {other}")),
        }
    }
    Ok(options)
}

fn run(options: Options) -> Result<ExitCode, String> {
    match options.command.as_str() {
        "check" => {
            let report = analyze(&options.root, None)?;
            print!("{}", render(&report.violations));
            Ok(if report.violations.is_empty() {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            })
        }
        "json" => {
            let report = analyze(&options.root, options.base.as_deref())?;
            println!(
                "{}",
                serde_json::to_string(&report).map_err(|e| e.to_string())?
            );
            Ok(ExitCode::SUCCESS)
        }
        "schema" => {
            print!("{}", schema());
            Ok(ExitCode::SUCCESS)
        }
        "report-schema" => {
            print!("{}", report_schema());
            Ok(ExitCode::SUCCESS)
        }
        "watch" => {
            let (tx, rx) = mpsc::channel();
            watch(&options.root, options.base.as_deref(), tx)?;
            let address = serve(
                options.port,
                options.ui,
                options.root.clone(),
                options.host,
                rx,
            )?;
            println!("{address}");
            loop {
                std::thread::park();
            }
        }
        other => Err(format!(
            "unknown command {other}; use check, json, schema, report-schema or watch"
        )),
    }
}

fn main() -> ExitCode {
    match options(std::env::args().skip(1)).and_then(run) {
        Ok(code) => code,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::from(2)
        }
    }
}
