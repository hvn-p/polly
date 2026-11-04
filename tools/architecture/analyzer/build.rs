//! Embeds the identity of the sources the analyzer is built from (see
//! identity.mjs), which its server gives the view at `/version.json`. A build
//! outside the checkout, in a container, is given it as `ANALYZER_IDENTITY`.
//! Without it, without Node or outside a git checkout, the identity is `null`,
//! and the view says the analyzer reports none.

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
    println!("cargo:rerun-if-env-changed=ANALYZER_IDENTITY");
    if let Ok(identity) = std::env::var("ANALYZER_IDENTITY") {
        println!("cargo:rustc-env=ANALYZER_IDENTITY={identity}");
        return;
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
