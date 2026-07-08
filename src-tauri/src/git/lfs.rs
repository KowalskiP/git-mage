//! Git LFS operations (SPEC §M5): detect git-lfs, list tracked patterns and
//! files with download/lock state, pull objects, track new patterns, and
//! lock/unlock files.
//!
//! All shelling out to `git lfs` — LFS has no gitoxide equivalent. Locks need a
//! configured remote LFS server; without one `git lfs locks` errors, which we
//! treat as "no locks" rather than failing the whole status.

use std::collections::HashMap;
use std::process::Command;
use crate::git::cmd::HideConsole;

use crate::error::{AppError, AppResult};
use crate::model::{LfsFile, LfsStatus};

fn output(path: &str, args: &[&str]) -> std::io::Result<std::process::Output> {
    Command::new("git").hide_console().current_dir(path).args(args).output()
}

/// Aggregate LFS state for the repo. Never errors on a healthy repo — if
/// git-lfs is missing it returns `installed: false` and empty collections.
pub fn lfs_status(path: &str) -> AppResult<LfsStatus> {
    let ver = output(path, &["lfs", "version"]);
    let (installed, version) = match ver {
        Ok(o) if o.status.success() => {
            (true, String::from_utf8_lossy(&o.stdout).trim().to_string())
        }
        _ => (false, String::new()),
    };
    if !installed {
        return Ok(LfsStatus {
            installed: false,
            version: String::new(),
            used: false,
            patterns: vec![],
            files: vec![],
        });
    }

    let patterns = tracked_patterns(path);
    let locks = locks_map(path);
    let files = ls_files(path, &locks);
    let used = !patterns.is_empty() || !files.is_empty();

    Ok(LfsStatus { installed: true, version, used, patterns, files })
}

/// Patterns from `git lfs track` (the "Listing tracked patterns" section).
fn tracked_patterns(path: &str) -> Vec<String> {
    let out = match output(path, &["lfs", "track"]) {
        Ok(o) if o.status.success() => o,
        _ => return vec![],
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut patterns = Vec::new();
    let mut in_tracked = false;
    for line in text.lines() {
        let t = line.trim_start();
        if line.starts_with("Listing tracked") {
            in_tracked = true;
            continue;
        }
        if line.starts_with("Listing excluded") {
            in_tracked = false;
            continue;
        }
        if in_tracked && line.starts_with(' ') && !t.is_empty() {
            // "    *.psd (.gitattributes)" → "*.psd"
            let pat = t.split(" (").next().unwrap_or(t).trim();
            if !pat.is_empty() {
                patterns.push(pat.to_string());
            }
        }
    }
    patterns
}

/// Files from `git lfs ls-files`: `<oid> <*|-> <path>`.
fn ls_files(path: &str, locks: &HashMap<String, String>) -> Vec<LfsFile> {
    let out = match output(path, &["lfs", "ls-files"]) {
        Ok(o) if o.status.success() => o,
        _ => return vec![],
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut files = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let mut parts = line.splitn(3, ' ');
        let oid = parts.next().unwrap_or("").to_string();
        let marker = parts.next().unwrap_or("");
        let p = parts.next().unwrap_or("").trim().to_string();
        if p.is_empty() {
            continue;
        }
        files.push(LfsFile {
            lock_owner: locks.get(&p).cloned().unwrap_or_default(),
            path: p,
            oid,
            downloaded: marker == "*",
        });
    }
    files
}

/// Map of locked path → owner name, via `git lfs locks --json`. Empty when no
/// remote LFS server is configured (the common offline case).
fn locks_map(path: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let out = match output(path, &["lfs", "locks", "--json"]) {
        Ok(o) if o.status.success() => o,
        _ => return map,
    };
    if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
        if let Some(arr) = val.as_array() {
            for lock in arr {
                let p = lock.get("path").and_then(|v| v.as_str()).unwrap_or("");
                let owner = lock
                    .get("owner")
                    .and_then(|o| o.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !p.is_empty() {
                    map.insert(p.to_string(), owner.to_string());
                }
            }
        }
    }
    map
}

fn run(path: &str, args: &[&str], network: bool) -> AppResult<()> {
    let mut cmd = Command::new("git");
    cmd.hide_console();
    cmd.current_dir(path).args(args);
    if network {
        cmd.env("GIT_TERMINAL_PROMPT", "0");
    }
    let out = cmd.output().map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let outp = String::from_utf8_lossy(&out.stdout);
        return Err(AppError::Git(
            format!("{}\n{}", err.trim(), outp.trim()).trim().to_string(),
        ));
    }
    Ok(())
}

/// Download all LFS objects for the current ref (`git lfs pull`).
pub fn lfs_pull(path: &str) -> AppResult<()> {
    run(path, &["lfs", "pull"], true)
}

/// Track a new pattern, writing it into `.gitattributes`.
pub fn lfs_track(path: &str, pattern: &str) -> AppResult<()> {
    run(path, &["lfs", "track", pattern], false)
}

/// Lock a file on the remote (`git lfs lock`).
pub fn lfs_lock(path: &str, file: &str) -> AppResult<()> {
    run(path, &["lfs", "lock", file], true)
}

/// Release a lock (`git lfs unlock`).
pub fn lfs_unlock(path: &str, file: &str) -> AppResult<()> {
    run(path, &["lfs", "unlock", file], true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn g(dir: &Path, args: &[&str]) {
        assert!(
            Command::new("git").hide_console().current_dir(dir).args(args).output().unwrap().status.success(),
            "git {args:?}"
        );
    }

    fn lfs_available() -> bool {
        Command::new("git").hide_console()
            .args(["lfs", "version"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn status_lists_patterns_and_files() {
        if !lfs_available() {
            eprintln!("git-lfs not installed; skipping");
            return;
        }
        let dir = std::env::temp_dir().join(format!("gitmage-lfs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        g(&dir, &["lfs", "install", "--local"]);
        g(&dir, &["lfs", "track", "*.bin"]);
        std::fs::write(dir.join("data.bin"), vec![0u8; 1024]).unwrap();
        std::fs::write(dir.join("readme.txt"), "plain\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "lfs"]);

        let st = lfs_status(p).unwrap();
        assert!(st.installed);
        assert!(st.used, "repo uses LFS");
        assert!(st.patterns.iter().any(|p| p == "*.bin"), "patterns: {:?}", st.patterns);
        assert_eq!(st.files.len(), 1, "one tracked file");
        assert_eq!(st.files[0].path, "data.bin");
        assert!(st.files[0].downloaded, "object present locally");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn non_lfs_repo_reports_unused() {
        if !lfs_available() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("gitmage-lfs-none-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        g(&dir, &["init", "-q"]);
        let st = lfs_status(dir.to_str().unwrap()).unwrap();
        assert!(st.installed);
        assert!(!st.used);
        assert!(st.files.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
