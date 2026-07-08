//! Remote management (SPEC §6.4): list / add / rename / remove / set-url.
//! Pure local git config edits — no network.

use std::process::Command;
use crate::git::cmd::HideConsole;

use crate::error::{AppError, AppResult};
use crate::model::Remote;

fn run(path: &str, args: &[&str]) -> AppResult<()> {
    let out = Command::new("git").hide_console()
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

/// Configured remotes with their fetch URL (`git remote -v`).
pub fn remote_list(path: &str) -> AppResult<Vec<Remote>> {
    let out = Command::new("git").hide_console()
        .current_dir(path)
        .args(["remote", "-v"])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut remotes: Vec<Remote> = Vec::new();
    for line in text.lines() {
        // "<name>\t<url> (fetch|push)"
        if !line.ends_with("(fetch)") {
            continue;
        }
        let mut it = line.split_whitespace();
        let name = it.next().unwrap_or("").to_string();
        let url = it.next().unwrap_or("").to_string();
        if !name.is_empty() {
            remotes.push(Remote { name, url });
        }
    }
    Ok(remotes)
}

pub fn remote_add(path: &str, name: &str, url: &str) -> AppResult<()> {
    if name.is_empty() || url.is_empty() {
        return Err(AppError::Msg("remote name and URL are required".into()));
    }
    run(path, &["remote", "add", name, url])
}

pub fn remote_remove(path: &str, name: &str) -> AppResult<()> {
    run(path, &["remote", "remove", name])
}

pub fn remote_rename(path: &str, old: &str, new: &str) -> AppResult<()> {
    run(path, &["remote", "rename", old, new])
}

pub fn remote_set_url(path: &str, name: &str, url: &str) -> AppResult<()> {
    run(path, &["remote", "set-url", name, url])
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
    fn add_list_rename_seturl_remove() {
        let dir = std::env::temp_dir().join(format!("gitmage-remote-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q"]);

        assert!(remote_list(p).unwrap().is_empty(), "no remotes initially");

        remote_add(p, "origin", "https://example.com/a.git").unwrap();
        let list = remote_list(p).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "origin");
        assert_eq!(list[0].url, "https://example.com/a.git");

        remote_set_url(p, "origin", "https://example.com/b.git").unwrap();
        assert_eq!(remote_list(p).unwrap()[0].url, "https://example.com/b.git");

        remote_rename(p, "origin", "upstream").unwrap();
        assert_eq!(remote_list(p).unwrap()[0].name, "upstream");

        remote_remove(p, "upstream").unwrap();
        assert!(remote_list(p).unwrap().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
