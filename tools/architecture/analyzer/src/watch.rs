//! Watch mode: the graph held in memory, one file reread per change, a new report sent
//! only when the architecture changed.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::Duration;

use crate::{RULES_FILE, Tree, base_pairs, graph, read, workspace};

/// Files whose change reloads everything.
const RELOADS: [&str; 3] = [RULES_FILE, "package.json", "pnpm-workspace.yaml"];

/// The operating system's notifications of written, created, moved and deleted files.
/// Reading a file notifies nothing, so a watch costs nothing while nothing is written.
struct Source {
    add: AddDir,
}

/// Starts watching one directory.
type AddDir = Box<dyn FnMut(&Path) -> Result<(), String> + Send>;

/// Linux: inotify, subscribed to writes only (notify also subscribes to every open).
#[cfg(target_os = "linux")]
fn source(changed: Sender<PathBuf>) -> Result<Source, String> {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use inotify::{Inotify, WatchMask};

    let mut inotify = Inotify::init().map_err(|e| format!("inotify: {e}"))?;
    let mut watches = inotify.watches();
    let dirs: Arc<Mutex<HashMap<inotify::WatchDescriptor, PathBuf>>> = Arc::default();
    let reader_dirs = Arc::clone(&dirs);
    std::thread::spawn(move || {
        let mut buffer = [0; 16 * 1024];
        while let Ok(events) = inotify.read_events_blocking(&mut buffer) {
            for event in events {
                let dir = reader_dirs
                    .lock()
                    .ok()
                    .and_then(|d| d.get(&event.wd).cloned());
                if let (Some(dir), Some(name)) = (dir, event.name)
                    && changed.send(dir.join(name)).is_err()
                {
                    return;
                }
            }
        }
    });
    let mask = WatchMask::CREATE
        | WatchMask::DELETE
        | WatchMask::CLOSE_WRITE
        | WatchMask::MOVED_FROM
        | WatchMask::MOVED_TO;
    Ok(Source {
        add: Box::new(move |dir| {
            let wd = watches
                .add(dir, mask)
                .map_err(|e| format!("{}: {e}", dir.display()))?;
            dirs.lock()
                .map_err(|e| e.to_string())?
                .insert(wd, dir.to_path_buf());
            Ok(())
        }),
    })
}

/// macOS and the others: notify (FSEvents), which reports no read.
#[cfg(not(target_os = "linux"))]
fn source(changed: Sender<PathBuf>) -> Result<Source, String> {
    use notify::{EventKind, RecursiveMode, Watcher};

    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event
            && matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            )
        {
            for path in event.paths {
                let _ = changed.send(path);
            }
        }
    })
    .map_err(|e| e.to_string())?;
    Ok(Source {
        add: Box::new(move |dir| {
            watcher
                .watch(dir, RecursiveMode::NonRecursive)
                .map_err(|e| format!("{}: {e}", dir.display()))
        }),
    })
}

/// Watches the tree at `root`, sending a report as JSON at start and after every change
/// to the architecture, until `reports` is dropped.
///
/// # Errors
/// When the tree cannot be read or watched.
pub fn watch(root: &Path, base: Option<&str>, reports: Sender<String>) -> Result<(), String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("{}: {e}", root.display()))?;
    let tree = Tree::load(&root)?;
    let base = base
        .map(|reference| base_pairs(&root, reference))
        .transpose()?;
    let (changed, received) = mpsc::channel();
    let mut source = source(changed)?;
    watch_dirs(&mut source, &tree, "")?;
    std::thread::spawn(move || run(tree, base.as_ref(), &received, source, &reports));
    Ok(())
}

/// Watches a directory and every directory under it that may hold sources.
fn watch_dirs(source: &mut Source, tree: &Tree, dir: &str) -> Result<(), String> {
    (source.add)(&tree.root.join(dir))?;
    let Ok(entries) = std::fs::read_dir(tree.root.join(dir)) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = if dir.is_empty() {
            name.clone()
        } else {
            format!("{dir}/{name}")
        };
        if entry.file_type().is_ok_and(|t| t.is_dir())
            && !workspace::is_skipped(&name)
            && may_hold_sources(tree, &path)
        {
            watch_dirs(source, tree, &path)?;
        }
    }
    Ok(())
}

/// Whether a directory is a package, inside one, or on the way to one.
fn may_hold_sources(tree: &Tree, dir: &str) -> bool {
    let globs = std::fs::read_to_string(tree.root.join("pnpm-workspace.yaml"))
        .map(|y| workspace::package_globs(&y))
        .unwrap_or_default();
    let depth = dir.split('/').count();
    tree.packages.iter().any(|p| {
        p.dir == dir
            || dir.starts_with(&format!("{}/", p.dir))
            || p.dir.starts_with(&format!("{dir}/"))
    }) || globs.iter().any(|g| {
        g.split('/').count() >= depth
            && crate::glob::matches(&g.split('/').take(depth).collect::<Vec<_>>().join("/"), dir)
    })
}

fn run(
    mut tree: Tree,
    base: Option<&(String, BTreeSet<(String, String)>)>,
    changed: &Receiver<PathBuf>,
    mut source: Source,
    reports: &Sender<String>,
) {
    let resolver = graph::resolver();
    let mut last = serde_json::to_string(&tree.report(&resolver, base)).unwrap_or_default();
    if reports.send(last.clone()).is_err() {
        return;
    }
    while let Ok(first) = changed.recv() {
        // A save often arrives as several events: take them together.
        let mut paths = BTreeSet::from([first]);
        loop {
            match changed.recv_timeout(Duration::from_millis(30)) {
                Ok(path) => {
                    paths.insert(path);
                }
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        if !apply(&mut tree, &paths, &mut source) {
            continue;
        }
        resolver.clear_cache();
        let report = serde_json::to_string(&tree.report(&resolver, base)).unwrap_or_default();
        if report != last {
            last = report;
            if reports.send(last.clone()).is_err() {
                return;
            }
        }
    }
}

/// Applies the changed paths to the tree; whether its imports or exports changed.
fn apply(tree: &mut Tree, paths: &BTreeSet<PathBuf>, source: &mut Source) -> bool {
    let mut changed = false;
    for path in paths {
        let Ok(relative) = path.strip_prefix(&tree.root) else {
            continue;
        };
        let file = relative.to_string_lossy().replace('\\', "/");
        let name = file.rsplit('/').next().unwrap_or(&file).to_string();
        if RELOADS.contains(&name.as_str()) {
            if let Ok(reloaded) = Tree::load(&tree.root) {
                *tree = reloaded;
                return true;
            }
            continue;
        }
        if path.is_dir() {
            if workspace::is_skipped(&name) || !may_hold_sources(tree, &file) {
                continue;
            }
            // A new directory: watch it, and read what it already holds.
            let _ = watch_dirs(source, tree, &file);
            let mut found = vec![];
            workspace::walk(&tree.root, &file, &tree.rules.ignore, &mut found);
            for added in found {
                if let Some(parsed) = read(&tree.root, &added) {
                    tree.parsed.insert(added, parsed);
                    changed = true;
                }
            }
            continue;
        }
        if !tree.is_source(&file) {
            continue;
        }
        let parsed = read(&tree.root, &file);
        if tree.parsed.get(&file) != parsed.as_ref() {
            match parsed {
                Some(p) => tree.parsed.insert(file, p),
                None => tree.parsed.remove(&file),
            };
            changed = true;
        }
    }
    changed
}
