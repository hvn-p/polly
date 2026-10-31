//! Embeds the identity of the sources the analyzer is built from (see
//! identity.mjs), which its server gives the view at `/version.json`. Without
//! Node or outside a git checkout, the identity is `null`, and the view says
//! the analyzer reports none.

use std::process::Command;

fn main() {
    for input in [
        "src",
        "Cargo.toml",
        "Cargo.lock",
        "rust-toolchain.toml",
        "build.rs",
        "identity.mjs",
    ] {
        println!("cargo:rerun-if-changed={input}");
    }
    let identity = Command::new("node")
        .arg("identity.mjs")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map_or_else(|| "null".to_string(), |text| text.trim().to_string());
    println!("cargo:rustc-env=ANALYZER_IDENTITY={identity}");
}
