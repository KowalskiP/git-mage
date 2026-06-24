//! Stash operations (SPEC §6.4): save / list / apply / pop / drop.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::StashEntry;

const US: char = '\u{1f}';

fn run(path: &str, args: &[&str]) -> AppResult<()> {
    let out = Command::new("git")
        .current_dir(path)
        .args(args)
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let outp = String::from_utf8_lossy(&out.stdout);
        return Err(AppError::Git(
            format!("{}\n{}", err.trim(), outp.trim()).trim().to_string(),
        ));
    }
    Ok(())
}

pub fn stash_list(path: &str) -> AppResult<Vec<StashEntry>> {
    let out = Command::new("git")
        .current_dir(path)
        .args(["stash", "list", &format!("--format=%gd{US}%s")])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(text
        .lines()
        .filter_map(|line| {
            let (id, message) = line.split_once(US)?;
            Some(StashEntry {
                id: id.trim().to_string(),
                message: message.trim().to_string(),
            })
        })
        .collect())
}

pub fn stash_save(path: &str, message: Option<&str>, untracked: bool) -> AppResult<()> {
    let mut args = vec!["stash", "push"];
    if untracked {
        args.push("-u");
    }
    let msg = message.map(str::trim).unwrap_or("");
    if !msg.is_empty() {
        args.push("-m");
        args.push(msg);
    }
    run(path, &args)
}

pub fn stash_apply(path: &str, id: &str) -> AppResult<()> {
    run(path, &["stash", "apply", id])
}

pub fn stash_pop(path: &str, id: &str) -> AppResult<()> {
    run(path, &["stash", "pop", id])
}

pub fn stash_drop(path: &str, id: &str) -> AppResult<()> {
    run(path, &["stash", "drop", id])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn git(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .unwrap()
            .status
            .success();
        assert!(ok, "git {args:?} failed");
    }

    #[test]
    fn stash_round_trip() {
        let dir = std::env::temp_dir().join(format!("gitmage-stash-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();

        git(&dir, &["init", "-q"]);
        git(&dir, &["config", "user.email", "t@t"]);
        git(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("a.txt"), "one\n").unwrap();
        git(&dir, &["add", "."]);
        git(&dir, &["commit", "-q", "-m", "init"]);

        // Modify, then stash.
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        stash_save(p, Some("test stash"), false).unwrap();

        let list = stash_list(p).unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].message.contains("test stash"), "msg: {}", list[0].message);
        // Stashing restored the committed content.
        assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "one\n");

        // Pop brings the change back and empties the stash list.
        stash_pop(p, &list[0].id).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "two\n");
        assert!(stash_list(p).unwrap().is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
