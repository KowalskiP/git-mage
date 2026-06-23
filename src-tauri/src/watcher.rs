//! Filesystem watcher (SPEC §5.1). Watches a repo's working tree and emits
//! `repo:fs-change` so the UI can refresh status live. One watcher per repo path.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};

#[derive(Default)]
pub struct Watchers(pub Mutex<HashMap<String, RecommendedWatcher>>);

pub fn watch(app: &AppHandle, watchers: &Watchers, path: &str) -> AppResult<()> {
    let mut map = watchers.0.lock().unwrap();
    if map.contains_key(path) {
        return Ok(());
    }

    let app = app.clone();
    let emit_path = path.to_string();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            // Frontend coalesces bursts; we just signal "something changed".
            let _ = app.emit("repo:fs-change", &emit_path);
        }
    })
    .map_err(|e| AppError::Msg(format!("watcher init: {e}")))?;

    watcher
        .watch(Path::new(path), RecursiveMode::Recursive)
        .map_err(|e| AppError::Msg(format!("watch: {e}")))?;

    map.insert(path.to_string(), watcher);
    Ok(())
}

pub fn unwatch(watchers: &Watchers, path: &str) {
    watchers.0.lock().unwrap().remove(path);
}
