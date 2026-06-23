//! Commit detail + file diffs for the detail sidebar (SPEC §6.9).
//! M1: sourced from system `git`. Diffs are returned as unified-diff text.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::{CommitDetail, FileEntry};

const US: char = '\u{1f}';

fn run(path: &str, args: &[&str]) -> AppResult<std::process::Output> {
    Command::new("git")
        .current_dir(path)
        .args(args)
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))
}

/// Metadata + changed files for a commit.
pub fn commit_detail(path: &str, sha: &str) -> AppResult<CommitDetail> {
    let fmt = format!("%H{US}%s{US}%b{US}%an{US}%ae{US}%at{US}%P");
    let meta = run(path, &["show", "-s", &format!("--format={fmt}"), sha])?;
    if !meta.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&meta.stderr).trim().to_string(),
        ));
    }
    let text = String::from_utf8_lossy(&meta.stdout);
    let f: Vec<&str> = text.trim_end().split(US).collect();

    let files = commit_files(path, sha)?;

    Ok(CommitDetail {
        sha: f.first().unwrap_or(&"").to_string(),
        summary: f.get(1).unwrap_or(&"").to_string(),
        body: f.get(2).unwrap_or(&"").trim().to_string(),
        author: f.get(3).unwrap_or(&"").to_string(),
        email: f.get(4).unwrap_or(&"").to_string(),
        time: f.get(5).and_then(|s| s.trim().parse().ok()).unwrap_or(0),
        parents: f
            .get(6)
            .map(|p| p.split_whitespace().map(str::to_string).collect())
            .unwrap_or_default(),
        files,
    })
}

/// Files changed by a commit (`--root` so the first commit lists its files).
fn commit_files(path: &str, sha: &str) -> AppResult<Vec<FileEntry>> {
    let out = run(
        path,
        &[
            "-c",
            "core.quotePath=false",
            "diff-tree",
            "--no-commit-id",
            "--name-status",
            "-r",
            "-z",
            "--root",
            sha,
        ],
    )?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let parts: Vec<&str> = stdout.split('\0').filter(|s| !s.is_empty()).collect();

    let mut files = Vec::new();
    let mut i = 0;
    while i < parts.len() {
        let code = parts[i].chars().next().unwrap_or('?');
        // Renames/copies are STATUS, OLD, NEW; everything else STATUS, PATH.
        if code == 'R' || code == 'C' {
            if let Some(newp) = parts.get(i + 2) {
                files.push(FileEntry {
                    path: newp.to_string(),
                    status: code.to_string(),
                    staged: false,
                });
            }
            i += 3;
        } else {
            if let Some(p) = parts.get(i + 1) {
                files.push(FileEntry {
                    path: p.to_string(),
                    status: code.to_string(),
                    staged: false,
                });
            }
            i += 2;
        }
    }
    Ok(files)
}

/// Unified diff for one file as introduced by `sha`.
pub fn commit_diff(path: &str, sha: &str, file: &str) -> AppResult<String> {
    let out = run(
        path,
        &[
            "-c",
            "core.quotePath=false",
            "show",
            "--format=",
            "--no-color",
            sha,
            "--",
            file,
        ],
    )?;
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Unified diff for one working-directory file against HEAD.
/// Falls back to a no-index diff for untracked files.
pub fn wip_diff(path: &str, file: &str) -> AppResult<String> {
    let tracked = run(
        path,
        &["-c", "core.quotePath=false", "diff", "--no-color", "HEAD", "--", file],
    )?;
    let text = String::from_utf8_lossy(&tracked.stdout).to_string();
    if !text.trim().is_empty() {
        return Ok(text);
    }
    // Untracked file: diff against /dev/null (exit code is non-zero but valid).
    let untracked = run(
        path,
        &["-c", "core.quotePath=false", "diff", "--no-color", "--no-index", "--", "/dev/null", file],
    )?;
    Ok(String::from_utf8_lossy(&untracked.stdout).to_string())
}
