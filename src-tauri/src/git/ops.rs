//! Branch + remote operations (SPEC §6.4): checkout, create branch, fetch,
//! pull, push. Network ops rely on the system credential helper / SSH agent
//! and disable interactive prompts so they fail fast instead of hanging.

use std::process::Command;

use crate::error::{AppError, AppResult};

fn run(path: &str, args: &[&str], network: bool) -> AppResult<()> {
    let mut cmd = Command::new("git");
    cmd.current_dir(path).args(args);
    if network {
        // Never block on a TTY prompt or a merge editor in a headless process.
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        cmd.env("GIT_EDITOR", "true");
    }
    let out = cmd
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let outp = String::from_utf8_lossy(&out.stdout);
        let msg = format!("{}\n{}", err.trim(), outp.trim());
        return Err(AppError::Git(msg.trim().to_string()));
    }
    Ok(())
}

pub fn checkout(path: &str, refname: &str) -> AppResult<()> {
    run(path, &["checkout", refname], false)
}

pub fn create_branch(path: &str, name: &str, checkout: bool) -> AppResult<()> {
    if checkout {
        run(path, &["checkout", "-b", name], false)
    } else {
        run(path, &["branch", name], false)
    }
}

pub fn fetch(path: &str) -> AppResult<()> {
    run(path, &["fetch", "--all", "--prune"], true)
}

pub fn pull(path: &str) -> AppResult<()> {
    run(path, &["pull", "--no-edit"], true)
}

pub fn push(path: &str) -> AppResult<()> {
    run(path, &["push"], true)
}

/// Merge `refname` into the current branch (no editor; conflicts surface as an error).
pub fn merge(path: &str, refname: &str) -> AppResult<()> {
    run(path, &["merge", "--no-edit", refname], false)
}

/// Create a branch at `at` (a commit sha or ref), optionally checking it out.
pub fn create_branch_at(path: &str, name: &str, at: &str, checkout: bool) -> AppResult<()> {
    if checkout {
        run(path, &["checkout", "-b", name, at], false)
    } else {
        run(path, &["branch", name, at], false)
    }
}

pub fn branch_delete(path: &str, name: &str, force: bool) -> AppResult<()> {
    run(path, &["branch", if force { "-D" } else { "-d" }, name], false)
}

pub fn branch_rename(path: &str, old: &str, new: &str) -> AppResult<()> {
    run(path, &["branch", "-m", old, new], false)
}

pub fn tag_create(path: &str, name: &str, at: &str) -> AppResult<()> {
    run(path, &["tag", name, at], false)
}

pub fn tag_delete(path: &str, name: &str) -> AppResult<()> {
    run(path, &["tag", "-d", name], false)
}

/// Local branch short names.
pub fn list_branches(path: &str) -> AppResult<Vec<String>> {
    let out = Command::new("git")
        .current_dir(path)
        .args(["for-each-ref", "--format=%(refname:short)", "refs/heads"])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect())
}
