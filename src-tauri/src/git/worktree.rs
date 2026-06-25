//! Worktree management (SPEC §6.7) — the base unit for agent sessions (§10).

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::Worktree;

fn run(path: &str, args: &[&str]) -> AppResult<()> {
    let out = Command::new("git")
        .current_dir(path)
        .args(args)
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

/// All worktrees of the repo; the first one is the primary worktree.
pub fn worktree_list(path: &str) -> AppResult<Vec<Worktree>> {
    let out = Command::new("git")
        .current_dir(path)
        .args(["worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);

    let mut list = Vec::new();
    let mut cur: Option<Worktree> = None;
    for line in text.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            if let Some(w) = cur.take() {
                list.push(w);
            }
            cur = Some(Worktree {
                path: p.to_string(),
                branch: None,
                head: String::new(),
                locked: false,
                is_main: list.is_empty(),
                ahead: 0,
                behind: 0,
                changes: 0,
            });
        } else if let Some(h) = line.strip_prefix("HEAD ") {
            if let Some(w) = cur.as_mut() {
                w.head = h.to_string();
            }
        } else if let Some(b) = line.strip_prefix("branch ") {
            if let Some(w) = cur.as_mut() {
                w.branch = Some(b.trim_start_matches("refs/heads/").to_string());
            }
        } else if line == "locked" || line.starts_with("locked ") {
            if let Some(w) = cur.as_mut() {
                w.locked = true;
            }
        }
    }
    if let Some(w) = cur.take() {
        list.push(w);
    }
    for w in list.iter_mut() {
        let (a, b, c) = worktree_summary(&w.path);
        w.ahead = a;
        w.behind = b;
        w.changes = c;
    }
    Ok(list)
}

/// (ahead, behind, uncommitted-change-count) for a worktree, via one `git status`.
fn worktree_summary(wt: &str) -> (u32, u32, u32) {
    let Ok(out) = Command::new("git")
        .current_dir(wt)
        .args(["status", "--porcelain=v1", "--branch"])
        .output()
    else {
        return (0, 0, 0);
    };
    if !out.status.success() {
        return (0, 0, 0);
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let (mut ahead, mut behind, mut changes) = (0u32, 0u32, 0u32);
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("## ") {
            if let Some((_, bracket)) = rest.split_once('[') {
                for tok in bracket.trim_end_matches(']').split(", ") {
                    if let Some(n) = tok.strip_prefix("ahead ") {
                        ahead = n.trim().parse().unwrap_or(0);
                    } else if let Some(n) = tok.strip_prefix("behind ") {
                        behind = n.trim().parse().unwrap_or(0);
                    }
                }
            }
        } else if !line.is_empty() {
            changes += 1;
        }
    }
    (ahead, behind, changes)
}

/// Sibling directory name for a worktree of `name` (slashes flattened).
fn worktree_path(repo: &str, name: &str) -> AppResult<PathBuf> {
    let repo = Path::new(repo);
    let parent = repo
        .parent()
        .ok_or_else(|| AppError::Git("repo has no parent dir".into()))?;
    let base = repo
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("repo");
    Ok(parent.join(format!("{base}--{}", name.replace('/', "-"))))
}

/// Add a worktree. `create` makes a new branch `name`; otherwise checks out the
/// existing branch `name`. Returns the new worktree path.
pub fn worktree_add(path: &str, name: &str, create: bool) -> AppResult<String> {
    let wt = worktree_path(path, name)?;
    let wt_str = wt.to_str().ok_or_else(|| AppError::Git("bad path".into()))?;
    if create {
        run(path, &["worktree", "add", "-b", name, wt_str])?;
    } else {
        run(path, &["worktree", "add", wt_str, name])?;
    }
    Ok(wt_str.to_string())
}

pub fn worktree_remove(path: &str, wt_path: &str, force: bool) -> AppResult<()> {
    if force {
        run(path, &["worktree", "remove", "--force", wt_path])
    } else {
        run(path, &["worktree", "remove", wt_path])
    }
}

pub fn worktree_lock(path: &str, wt_path: &str, lock: bool) -> AppResult<()> {
    run(path, &["worktree", if lock { "lock" } else { "unlock" }, wt_path])
}

pub fn worktree_prune(path: &str) -> AppResult<()> {
    run(path, &["worktree", "prune"])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn g(dir: &Path, args: &[&str]) {
        assert!(
            Command::new("git").current_dir(dir).args(args).output().unwrap().status.success(),
            "git {args:?}"
        );
    }

    #[test]
    fn worktree_add_list_remove() {
        let dir = std::env::temp_dir().join(format!("gitmage-wt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("a.txt"), "x\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "base"]);

        assert_eq!(worktree_list(p).unwrap().len(), 1, "only main initially");

        let wt = worktree_add(p, "agent/test", true).unwrap();
        let list = worktree_list(p).unwrap();
        assert_eq!(list.len(), 2, "main + new worktree");
        assert!(list[0].is_main);
        assert!(list.iter().any(|w| w.branch.as_deref() == Some("agent/test")));
        assert!(std::path::Path::new(&wt).exists());

        worktree_remove(p, &wt, true).unwrap();
        assert_eq!(worktree_list(p).unwrap().len(), 1, "back to main only");

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&wt);
    }
}
