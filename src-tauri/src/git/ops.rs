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
