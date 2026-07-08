//! Hunk-level staging (SPEC §6.3): split a file's diff into hunks and stage /
//! unstage individual hunks via `git apply --cached [--reverse]`.

use std::io::Write;
use std::process::{Command, Stdio};
use crate::git::cmd::HideConsole;

use crate::error::{AppError, AppResult};
use crate::model::Hunk;

/// Hunks of a file's diff. `staged=false` → worktree-vs-index (stageable);
/// `staged=true` → index-vs-HEAD (unstageable). Untracked files yield none.
pub fn file_hunks(path: &str, file: &str, staged: bool) -> AppResult<Vec<Hunk>> {
    let mut args = vec!["-c", "core.quotePath=false", "diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    args.push("--");
    args.push(file);

    let out = Command::new("git").hide_console()
        .current_dir(path)
        .args(&args)
        .output()
        .map_err(|e| AppError::Git(format!("git diff: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(parse_hunks(&String::from_utf8_lossy(&out.stdout)))
}

fn parse_hunks(diff: &str) -> Vec<Hunk> {
    let lines: Vec<&str> = diff.lines().collect();
    let Some(first) = lines.iter().position(|l| l.starts_with("@@")) else {
        return vec![];
    };
    let header = lines[..first].join("\n");

    let mut hunks = Vec::new();
    let mut i = first;
    while i < lines.len() {
        if !lines[i].starts_with("@@") {
            i += 1;
            continue;
        }
        let start = i;
        i += 1;
        while i < lines.len() && !lines[i].starts_with("@@") {
            i += 1;
        }
        let body = &lines[start..i];
        hunks.push(Hunk {
            header: lines[start].to_string(),
            lines: lines[start + 1..i].iter().map(|s| s.to_string()).collect(),
            // file header + this hunk, newline-terminated so `git apply` is happy
            patch: format!("{}\n{}\n", header, body.join("\n")),
        });
    }
    hunks
}

/// Apply one hunk patch to the index. `reverse=true` unstages it.
pub fn apply_hunk(path: &str, patch: &str, reverse: bool) -> AppResult<()> {
    let mut args = vec!["apply", "--cached"];
    if reverse {
        args.push("--reverse");
    }
    args.push("-");

    let mut child = Command::new("git").hide_console()
        .current_dir(path)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Git(format!("git apply: {e}")))?;

    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Git("no stdin for git apply".into()))?;
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| AppError::Git(format!("write patch: {e}")))?;
    } // stdin dropped (closed) here

    let out = child
        .wait_with_output()
        .map_err(|e| AppError::Git(format!("git apply: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(())
}
