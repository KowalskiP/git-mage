//! Working-directory mutations: staging and committing (SPEC §6.3).

use std::process::Command;

use crate::error::{AppError, AppResult};

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

pub fn stage(path: &str, files: &[String]) -> AppResult<()> {
    let mut args = vec!["add", "--"];
    args.extend(files.iter().map(String::as_str));
    run(path, &args)
}

pub fn unstage(path: &str, files: &[String]) -> AppResult<()> {
    let mut args = vec!["reset", "-q", "HEAD", "--"];
    args.extend(files.iter().map(String::as_str));
    run(path, &args)
}

pub fn stage_all(path: &str) -> AppResult<()> {
    run(path, &["add", "-A"])
}

pub fn unstage_all(path: &str) -> AppResult<()> {
    run(path, &["reset", "-q"])
}

pub fn commit(path: &str, message: &str, amend: bool) -> AppResult<()> {
    let msg = message.trim();
    if msg.is_empty() {
        if amend {
            // Amend with no new message keeps the existing one.
            return run(path, &["commit", "--amend", "--no-edit"]);
        }
        return Err(AppError::Msg("Commit message is empty".into()));
    }
    let mut args = vec!["commit", "-m", msg];
    if amend {
        args.insert(1, "--amend");
    }
    run(path, &args)
}
