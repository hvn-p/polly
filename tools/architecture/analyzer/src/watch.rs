//! Watch mode: the graph held in memory, one file reread per change, a new report sent
//! only when the architecture or a use of an imported name changed.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use schemars::JsonSchema;
use serde::Serialize;

use crate::{Base, RULES_FILE, Report, Tree, Violation, base_pairs, graph, pairs, read, workspace};

/// A report the watch sends, with what changed since the one before.
#[derive(Debug, Clone)]
pub struct Update {
    /// The analysis now.
    pub report: Report,
    /// What changed since the previous report; none for the first, nor when no module
    /// pair and no rule changed (an import's line, or a use of its names, moved).
    pub change: Option<Change>,
}

/// One change to the architecture, as the session's history keeps it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, JsonSchema)]
pub struct Change {
    /// When, in milliseconds since the Unix epoch.
    pub at: u64,
    /// The files whose change caused it, relative to the root.
    pub files: Vec<String>,
    /// Module pairs imported now and not before.
    pub added: Vec<(String, String)>,
    /// Module pairs imported before and not now.
    pub removed: Vec<(String, String)>,
    /// Rules broken now and not before.
    pub breaches: Vec<Violation>,
    /// Rules broken before and not now.
    pub fixed: Vec<Violation>,
}

impl Change {
    fn between(before: &Report, after: &Report, files: Vec<String>) -> Self {
        let (was, now) = (pairs(&before.edges), pairs(&after.edges));
        let was_broken: BTreeSet<&Violation> = before.violations.iter().collect();
        let now_broken: BTreeSet<&Violation> = after.violations.iter().collect();
        Self {
            at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX)),
            files,
            added: now.difference(&was).cloned().collect(),
            removed: was.difference(&now).cloned().collect(),
            breaches: now_broken
                .difference(&was_broken)
                .map(|v| (*v).clone())
                .collect(),
            fixed: was_broken
                .difference(&now_broken)
                .map(|v| (*v).clone())
                .collect(),
        }
    }

    fn is_empty(&self) -> bool {
        self.added.is_empty()
            && self.removed.is_empty()
            && self.breaches.is_empty()
            && self.fixed.is_empty()
    }
}

/// Files whose change reloads everything.
const RELOADS: [&str; 3] = [RULES_FILE, "package.json", "pnpm-workspace.yaml"];

/// The operating system's notifications of written, created, moved and deleted files.
/// Reading a file notifies nothing, so a watch costs nothing while nothing is written.
struct Source {
    add: AddDir,
    forget: ForgetDir,
}

/// Starts watching one directory.
type AddDir = Box<dyn FnMut(&Path) -> Result<(), String> + Send>;

/// Stops watching a directory and every directory under it, once moved away or removed.
type ForgetDir = Box<dyn FnMut(&Path) + Send>;

/// Linux: inotify, subscribed to writes only (notify also subscribes to every open).
#[cfg(target_os = "linux")]
fn source(changed: Sender<PathBuf>) -> Result<Source, String> {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use inotify::{Inotify, WatchMask};

    let mut inotify = Inotify::init().map_err(|e| format!("inotify: {e}"))?;
    let mut watches = inotify.watches();
    let mut forgotten = inotify.watches();
    let dirs: Arc<Mutex<HashMap<inotify::WatchDescriptor, PathBuf>>> = Arc::default();
    let reader_dirs = Arc::clone(&dirs);
    let forget_dirs = Arc::clone(&dirs);
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
        // A directory moved within the tree keeps its watch, which inotify ties to the
        // directory itself: adding its new path maps that watch there.
        add: Box::new(move |dir| {
            let wd = watches
                .add(dir, mask)
                .map_err(|e| format!("{}: {e}", dir.display()))?;
            dirs.lock()
                .map_err(|e| e.to_string())?
                .insert(wd, dir.to_path_buf());
            Ok(())
        }),
        // Whatever is still mapped under the old path was not watched again elsewhere.
        forget: Box::new(move |gone| {
            let Ok(mut dirs) = forget_dirs.lock() else {
                return;
            };
            dirs.retain(|wd, dir| {
                let keep = !dir.starts_with(gone);
                if !keep {
                    // Fails for a removed directory, whose watch went with it.
                    let _ = forgotten.remove(wd.clone());
                }
                keep
            });
        }),
    })
}

/// macOS and the others: notify (FSEvents), which reports no read.
#[cfg(not(target_os = "linux"))]
fn source(changed: Sender<PathBuf>) -> Result<Source, String> {
    use std::collections::BTreeSet;
    use std::sync::{Arc, Mutex};

    use notify::{EventKind, RecursiveMode, Watcher};

    let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
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
    // The watcher, and the directories it watches.
    let shared: Arc<Mutex<(_, BTreeSet<PathBuf>)>> =
        Arc::new(Mutex::new((watcher, BTreeSet::new())));
    let forget_shared = Arc::clone(&shared);
    Ok(Source {
        add: Box::new(move |dir| {
            let mut held = shared.lock().map_err(|e| e.to_string())?;
            held.0
                .watch(dir, RecursiveMode::NonRecursive)
                .map_err(|e| format!("{}: {e}", dir.display()))?;
            held.1.insert(dir.to_path_buf());
            Ok(())
        }),
        forget: Box::new(move |gone| {
            let Ok(mut held) = forget_shared.lock() else {
                return;
            };
            let (watcher, dirs) = &mut *held;
            dirs.retain(|dir| {
                let keep = !dir.starts_with(gone);
                if !keep {
                    let _ = watcher.unwatch(dir);
                }
                keep
            });
        }),
    })
}

/// Watches the tree at `root`, sending a report at start and after every change to the
/// architecture, until `reports` is dropped.
///
/// # Errors
/// When the tree cannot be read or watched.
pub fn watch(root: &Path, base: Option<&str>, reports: Sender<Update>) -> Result<(), String> {
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
    let depth = dir.split('/').count();
    tree.packages.iter().any(|p| {
        p.dir == dir
            || dir.starts_with(&format!("{}/", p.dir))
            || p.dir.starts_with(&format!("{dir}/"))
    }) || tree.globs.iter().any(|g| {
        g.split('/').count() >= depth
            && crate::glob::matches(&g.split('/').take(depth).collect::<Vec<_>>().join("/"), dir)
    })
}

fn run(
    mut tree: Tree,
    base: Option<&Base>,
    changed: &Receiver<PathBuf>,
    mut source: Source,
    reports: &Sender<Update>,
) {
    let resolver = graph::resolver();
    let mut last = tree.report(&resolver, base);
    let mut last_json = serde_json::to_string(&last).unwrap_or_default();
    let first = Update {
        report: last.clone(),
        change: None,
    };
    if reports.send(first).is_err() {
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
        let files = apply(&mut tree, &paths, &mut source);
        if files.is_empty() {
            continue;
        }
        resolver.clear_cache();
        let report = tree.report(&resolver, base);
        let json = serde_json::to_string(&report).unwrap_or_default();
        if json != last_json {
            let change = Change::between(&last, &report, files);
            last_json = json;
            last = report;
            let update = Update {
                report: last.clone(),
                change: (!change.is_empty()).then_some(change),
            };
            if reports.send(update).is_err() {
                return;
            }
        }
    }
}

/// Applies the changed paths to the tree; the files whose imports, exports or uses of
/// imported names changed.
fn apply(tree: &mut Tree, paths: &BTreeSet<PathBuf>, source: &mut Source) -> Vec<String> {
    let mut changed = vec![];
    for path in paths {
        let Ok(relative) = path.strip_prefix(&tree.root) else {
            continue;
        };
        let file = relative.to_string_lossy().replace('\\', "/");
        let name = file.rsplit('/').next().unwrap_or(&file).to_string();
        if RELOADS.contains(&name.as_str()) {
            if let Ok(reloaded) = Tree::load(&tree.root) {
                *tree = reloaded;
                return vec![file];
            }
            continue;
        }
        if !path.exists() {
            // A directory moved away or removed: its files leave the graph, and its
            // watches the source. A file only finds nothing under it.
            (source.forget)(path);
            let under = format!("{file}/");
            let gone: Vec<String> = tree
                .parsed
                .range(under.clone()..)
                .take_while(|(f, _)| f.starts_with(&under))
                .map(|(f, _)| f.clone())
                .collect();
            for f in gone {
                tree.parsed.remove(&f);
                changed.push(f);
            }
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
                    tree.parsed.insert(added.clone(), parsed);
                    changed.push(added);
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
                Some(p) => tree.parsed.insert(file.clone(), p),
                None => tree.parsed.remove(&file),
            };
            changed.push(file);
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn which_directories_may_hold_sources_comes_from_the_globs_read_at_load() {
        // No file on disk: the globs are the ones the tree was loaded with.
        let tree = Tree {
            root: PathBuf::from("/nonexistent"),
            rules: crate::Rules::parse(r#"{ "tiers": [] }"#).unwrap(),
            globs: vec!["apps/*".to_string()],
            packages: vec![],
            parsed: std::collections::BTreeMap::new(),
            root_manifest: None,
        };
        assert!(may_hold_sources(&tree, "apps"));
        assert!(may_hold_sources(&tree, "apps/api"));
        assert!(!may_hold_sources(&tree, "apps/api/src/deep/er"));
        assert!(!may_hold_sources(&tree, "docs"));
    }
}
