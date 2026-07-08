//! Per-file history and blame (SPEC: file history / blame). Shells out to
//! `git log --follow` and `git blame --line-porcelain`; parsing is factored so
//! the porcelain reader can be unit-tested on sample output.

use std::process::Command;
use crate::git::cmd::HideConsole;

use crate::error::{AppError, AppResult};
use crate::model::{BlameLine, FileLog};

const US: char = '\u{1f}';

/// Commits that touched `file` (following renames), newest first. `rev` scopes
/// history up to a commit ("" = current branch).
pub fn file_history(path: &str, file: &str, rev: &str, limit: u32) -> AppResult<Vec<FileLog>> {
    let fmt = format!("--format=%H{US}%s{US}%an{US}%at");
    let limit_arg = format!("-n{limit}");
    let mut args = vec!["log", "--follow", &fmt, &limit_arg];
    if !rev.is_empty() {
        args.push(rev);
    }
    args.push("--");
    args.push(file);
    let out = Command::new("git").hide_console()
        .current_dir(path)
        .args(&args)
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(parse_log(&String::from_utf8_lossy(&out.stdout)))
}

fn parse_log(s: &str) -> Vec<FileLog> {
    s.lines()
        .filter(|l| !l.is_empty())
        .filter_map(|l| {
            let mut f = l.split(US);
            Some(FileLog {
                sha: f.next()?.to_string(),
                summary: f.next().unwrap_or("").to_string(),
                author: f.next().unwrap_or("").to_string(),
                time: f.next().unwrap_or("0").parse().unwrap_or(0),
            })
        })
        .collect()
}

/// Blame `file` at `rev` ("" = working tree), one entry per line in file order.
pub fn blame(path: &str, file: &str, rev: &str) -> AppResult<Vec<BlameLine>> {
    let mut args = vec!["blame", "--line-porcelain"];
    if !rev.is_empty() {
        args.push(rev);
    }
    args.push("--");
    args.push(file);
    let out = Command::new("git").hide_console()
        .current_dir(path)
        .args(&args)
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(parse_blame(&String::from_utf8_lossy(&out.stdout)))
}

/// Parse `git blame --line-porcelain`. Each line is a block: a header
/// (`<sha> <orig> <final> [group]`), repeated metadata (author, author-time…),
/// then a TAB-prefixed content line that closes the block.
fn parse_blame(s: &str) -> Vec<BlameLine> {
    let mut out = Vec::new();
    let mut sha = String::new();
    let mut author = String::new();
    let mut time: i64 = 0;
    let mut line_no: u32 = 0;

    for l in s.lines() {
        if let Some(rest) = l.strip_prefix('\t') {
            line_no += 1;
            out.push(BlameLine {
                line: line_no,
                sha: sha.chars().take(8).collect(),
                author: author.clone(),
                time,
                content: rest.to_string(),
            });
        } else if let Some(a) = l.strip_prefix("author-time ") {
            time = a.trim().parse().unwrap_or(0);
        } else if let Some(a) = l.strip_prefix("author ") {
            author = a.to_string();
        } else if is_header(l) {
            sha = l.split(' ').next().unwrap_or("").to_string();
        }
    }
    out
}

/// A blame block header starts with a 40-hex sha followed by a space + digits.
fn is_header(l: &str) -> bool {
    let mut parts = l.split(' ');
    match parts.next() {
        Some(first) => first.len() == 40 && first.bytes().all(|b| b.is_ascii_hexdigit()),
        None => false,
    }
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

    #[test]
    fn parses_log_records() {
        let raw = format!("abc123{US}fix bug{US}Ann{US}1700000000\ndef456{US}init{US}Bob{US}1600000000\n");
        let log = parse_log(&raw);
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].sha, "abc123");
        assert_eq!(log[0].summary, "fix bug");
        assert_eq!(log[0].author, "Ann");
        assert_eq!(log[0].time, 1_700_000_000);
    }

    #[test]
    fn parses_line_porcelain_blame() {
        let raw = "\
0123456789012345678901234567890123456789 1 1 1
author Ann
author-time 1700000000
author-tz +0000
summary first
	first line
0123456789012345678901234567890123456789 2 2
author Ann
author-time 1700000000
	second line
";
        let lines = parse_blame(raw);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].line, 1);
        assert_eq!(lines[0].sha, "01234567");
        assert_eq!(lines[0].author, "Ann");
        assert_eq!(lines[0].content, "first line");
        assert_eq!(lines[1].line, 2);
        assert_eq!(lines[1].content, "second line");
    }

    #[test]
    fn blame_and_history_on_a_real_repo() {
        let dir = std::env::temp_dir().join(format!("gitmage-hist-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "a@a"]);
        g(&dir, &["config", "user.name", "Ann"]);
        std::fs::write(dir.join("f.txt"), "one\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "first"]);
        std::fs::write(dir.join("f.txt"), "one\ntwo\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "second"]);

        let hist = file_history(p, "f.txt", "", 10).unwrap();
        assert_eq!(hist.len(), 2);
        assert_eq!(hist[0].summary, "second");
        assert_eq!(hist[1].summary, "first");

        let bl = blame(p, "f.txt", "").unwrap();
        assert_eq!(bl.len(), 2);
        assert_eq!(bl[0].content, "one");
        assert_eq!(bl[1].content, "two");
        assert_eq!(bl[0].author, "Ann");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
