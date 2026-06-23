use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::{FileEntry, RepoStatus};

/// Working-tree status.
///
/// M0: parses `git status --porcelain=v1 --branch` (quotePath disabled so UTF-8
/// paths are not escaped). M1 migrates this to `gix::status` per SPEC §5.2.
pub fn status(path: &str) -> AppResult<RepoStatus> {
    let out = Command::new("git")
        .current_dir(path)
        .args([
            "-c",
            "core.quotePath=false",
            "status",
            "--porcelain=v1",
            "--branch",
        ])
        .output()
        .map_err(|e| AppError::Git(format!("failed to run git: {e}")))?;

    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut st = RepoStatus::default();

    for line in text.lines() {
        if let Some(branch_line) = line.strip_prefix("## ") {
            let (branch, upstream) = parse_branch_line(branch_line);
            st.branch = branch;
            st.upstream = upstream;
        } else if !line.is_empty() {
            classify(line, &mut st);
        }
    }

    // Prefer gix for the branch name (SPEC: reads via gix); fall back to porcelain.
    if let Some(b) = super::current_branch(path) {
        st.branch = Some(b);
    }

    Ok(st)
}

/// Parse the `## ` branch header (already stripped of the prefix).
fn parse_branch_line(rest: &str) -> (Option<String>, Option<String>) {
    if rest.starts_with("HEAD (no branch)") {
        return (Some("HEAD (detached)".into()), None);
    }
    if let Some(name) = rest.strip_prefix("No commits yet on ") {
        return (Some(name.trim().to_string()), None);
    }
    let mut parts = rest.splitn(2, "...");
    let branch = parts.next().unwrap_or("").trim().to_string();
    let upstream = parts.next().map(|u| {
        // Drop a trailing " [ahead N, behind M]" segment.
        u.split(" [").next().unwrap_or(u).trim().to_string()
    });
    (Some(branch), upstream)
}

/// Classify one porcelain v1 entry line into the status buckets.
fn classify(line: &str, st: &mut RepoStatus) {
    if line.len() < 3 {
        return;
    }
    let bytes = line.as_bytes();
    let index = bytes[0] as char; // staged column
    let worktree = bytes[1] as char; // unstaged column
    let mut path = line[3..].to_string();

    if index == '?' && worktree == '?' {
        st.untracked.push(FileEntry {
            path,
            status: "??".into(),
            staged: false,
        });
        return;
    }
    if index == '!' && worktree == '!' {
        return; // ignored
    }

    // Renames/copies are reported as "orig -> new"; keep the new path.
    if let Some(idx) = path.find(" -> ") {
        path = path[idx + 4..].to_string();
    }

    if index != ' ' {
        st.staged.push(FileEntry {
            path: path.clone(),
            status: index.to_string(),
            staged: true,
        });
    }
    if worktree != ' ' {
        st.unstaged.push(FileEntry {
            path,
            status: worktree.to_string(),
            staged: false,
        });
    }
}
