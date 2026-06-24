//! Commit detail + file diffs for the detail sidebar (SPEC §6.9).
//! M1: sourced from system `git`. Diffs are returned as unified-diff text.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::{CommitDetail, DiffSides, FileEntry};

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

    let parents: Vec<String> = f
        .get(6)
        .map(|p| p.split_whitespace().map(str::to_string).collect())
        .unwrap_or_default();
    let files = commit_files(path, sha, parents.len() >= 2)?;

    Ok(CommitDetail {
        sha: f.first().unwrap_or(&"").to_string(),
        summary: f.get(1).unwrap_or(&"").to_string(),
        body: f.get(2).unwrap_or(&"").trim().to_string(),
        author: f.get(3).unwrap_or(&"").to_string(),
        email: f.get(4).unwrap_or(&"").to_string(),
        time: f.get(5).and_then(|s| s.trim().parse().ok()).unwrap_or(0),
        parents,
        files,
    })
}

/// Files changed by a commit. `--root` makes the first commit list its files;
/// merges show nothing via plain diff-tree, so diff against the first parent
/// to list what the merge introduced on the first-parent line.
fn commit_files(path: &str, sha: &str, is_merge: bool) -> AppResult<Vec<FileEntry>> {
    let parent = format!("{sha}^1");
    let out = if is_merge {
        run(
            path,
            &[
                "-c",
                "core.quotePath=false",
                "diff",
                "--name-status",
                "-r",
                "-z",
                &parent,
                sha,
            ],
        )?
    } else {
        run(
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
        )?
    };
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

/// Old + new contents of a file for a side-by-side diff. For the WIP node the
/// "old" side is HEAD and the "new" side is the working-tree file.
pub fn diff_sides(path: &str, sha: &str, file: &str) -> AppResult<DiffSides> {
    let (old, old_bin, new, new_bin) = if sha == super::graph::WIP_SHA {
        let (o, ob) = show_side(path, &format!("HEAD:{file}"));
        let (n, nb) = read_working(path, file);
        (o, ob, n, nb)
    } else {
        let (o, ob) = show_side(path, &format!("{sha}^:{file}"));
        let (n, nb) = show_side(path, &format!("{sha}:{file}"));
        (o, ob, n, nb)
    };
    let binary = old_bin || new_bin;
    Ok(DiffSides {
        old_text: if binary { String::new() } else { old },
        new_text: if binary { String::new() } else { new },
        binary,
    })
}

/// Contents of `<rev>` (e.g. "HEAD:path" or "sha^:path"); empty if it doesn't exist.
fn show_side(path: &str, rev: &str) -> (String, bool) {
    match Command::new("git")
        .current_dir(path)
        .args(["-c", "core.quotePath=false", "show", rev])
        .output()
    {
        Ok(out) if out.status.success() => bytes_to_text(&out.stdout),
        _ => (String::new(), false),
    }
}

/// Working-tree file contents; empty if missing (deleted).
fn read_working(path: &str, file: &str) -> (String, bool) {
    match std::fs::read(std::path::Path::new(path).join(file)) {
        Ok(bytes) => bytes_to_text(&bytes),
        Err(_) => (String::new(), false),
    }
}

/// (text, is_binary). Treats any NUL byte as binary.
fn bytes_to_text(bytes: &[u8]) -> (String, bool) {
    if bytes.contains(&0) {
        (String::new(), true)
    } else {
        (String::from_utf8_lossy(bytes).into_owned(), false)
    }
}
