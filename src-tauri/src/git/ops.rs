//! Branch + remote operations (SPEC §6.4): checkout, create branch, fetch,
//! pull, push. Network ops rely on the system credential helper / SSH agent
//! and disable interactive prompts so they fail fast instead of hanging.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::RebaseCommit;

const US: char = '\u{1f}';

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

/// Resolve a conflicted file by taking one side, then mark it resolved (`git add`).
pub fn resolve_side(path: &str, file: &str, ours: bool) -> AppResult<()> {
    let side = if ours { "--ours" } else { "--theirs" };
    run(path, &["checkout", side, "--", file], false)?;
    run(path, &["add", "--", file], false)
}

/// Finish an in-progress merge (uses the prepared MERGE_MSG; fails if unresolved).
pub fn merge_continue(path: &str) -> AppResult<()> {
    run(path, &["commit", "--no-edit"], false)
}

pub fn merge_abort(path: &str) -> AppResult<()> {
    run(path, &["merge", "--abort"], false)
}

/// Rebase the current branch onto `onto` (conflicts surface as an error).
pub fn rebase(path: &str, onto: &str) -> AppResult<()> {
    // network=true sets GIT_EDITOR=true so a replay never blocks on an editor.
    run(path, &["rebase", onto], true)
}

pub fn rebase_continue(path: &str) -> AppResult<()> {
    run(path, &["rebase", "--continue"], true)
}

pub fn rebase_abort(path: &str) -> AppResult<()> {
    run(path, &["rebase", "--abort"], false)
}

/// Commits in `base..HEAD` (non-merge), oldest first — the interactive-rebase range.
pub fn rebase_todo_commits(path: &str, base: &str) -> AppResult<Vec<RebaseCommit>> {
    let out = Command::new("git")
        .current_dir(path)
        .args([
            "log",
            "--reverse",
            "--no-merges",
            &format!("--format=%H{US}%s"),
            &format!("{base}..HEAD"),
        ])
        .output()
        .map_err(|e| AppError::Git(format!("git log: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| {
            let (sha, subject) = l.split_once(US)?;
            Some(RebaseCommit {
                sha: sha.to_string(),
                subject: subject.to_string(),
            })
        })
        .collect())
}

/// Run an interactive rebase onto `base` with a pre-built `todo` sheet.
/// The sequence editor just overwrites git's todo file with our content, and
/// GIT_EDITOR is a no-op so squash/fixup don't block on a message editor.
pub fn rebase_interactive(path: &str, base: &str, todo: &str) -> AppResult<()> {
    let tmp = std::env::temp_dir().join(format!("gitmage-rebase-todo-{base}"));
    std::fs::write(&tmp, todo).map_err(|e| AppError::Git(format!("write todo: {e}")))?;

    let seq_editor = format!("cp '{}'", tmp.display());
    let out = Command::new("git")
        .current_dir(path)
        .args(["rebase", "-i", base])
        .env("GIT_SEQUENCE_EDITOR", seq_editor)
        .env("GIT_EDITOR", "true")
        .env("GIT_TERMINAL_PROMPT", "0")
        .output();
    let _ = std::fs::remove_file(&tmp);

    let out = out.map_err(|e| AppError::Git(format!("git rebase -i: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let outp = String::from_utf8_lossy(&out.stdout);
        return Err(AppError::Git(
            format!("{}\n{}", err.trim(), outp.trim()).trim().to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn g(dir: &Path, args: &[&str]) {
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
    fn merge_conflict_resolve_round_trip() {
        let dir = std::env::temp_dir().join(format!("gitmage-merge-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();

        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("f.txt"), "base\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "base"]);

        // feature branch changes the line one way…
        g(&dir, &["checkout", "-q", "-b", "feature"]);
        std::fs::write(dir.join("f.txt"), "feature\n").unwrap();
        g(&dir, &["commit", "-qam", "feat"]);

        // …the default branch changes the same line differently.
        g(&dir, &["checkout", "-q", "-"]);
        std::fs::write(dir.join("f.txt"), "mainline\n").unwrap();
        g(&dir, &["commit", "-qam", "main change"]);

        // Merge conflicts.
        assert!(merge(p, "feature").is_err(), "merge should conflict");

        let st = crate::git::status(p).unwrap();
        assert!(st.merge_in_progress, "merge should be in progress");
        assert_eq!(st.conflicted.len(), 1, "one conflicted file");

        // Resolve with ours, then complete the merge.
        resolve_side(p, "f.txt", true).unwrap();
        assert_eq!(crate::git::status(p).unwrap().conflicted.len(), 0);
        merge_continue(p).unwrap();

        let done = crate::git::status(p).unwrap();
        assert!(!done.merge_in_progress, "merge complete");
        assert_eq!(std::fs::read_to_string(dir.join("f.txt")).unwrap(), "mainline\n");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rebase_conflict_round_trip() {
        let dir = std::env::temp_dir().join(format!("gitmage-rebase-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();

        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("f.txt"), "base\n").unwrap();
        std::fs::write(dir.join("g.txt"), "g\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "base"]);

        let out = Command::new("git")
            .current_dir(&dir)
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .output()
            .unwrap();
        let default = String::from_utf8_lossy(&out.stdout).trim().to_string();

        // feature: conflicting change to f.txt + a clean change to g.txt
        g(&dir, &["checkout", "-q", "-b", "feature"]);
        std::fs::write(dir.join("f.txt"), "feature\n").unwrap();
        std::fs::write(dir.join("g.txt"), "g-feature\n").unwrap();
        g(&dir, &["commit", "-qam", "feat"]);

        // default branch changes f.txt differently
        g(&dir, &["checkout", "-q", &default]);
        std::fs::write(dir.join("f.txt"), "mainline\n").unwrap();
        g(&dir, &["commit", "-qam", "main change"]);

        // rebase feature onto default -> conflict on f.txt
        g(&dir, &["checkout", "-q", "feature"]);
        assert!(rebase(p, &default).is_err(), "rebase should conflict");

        let st = crate::git::status(p).unwrap();
        assert!(st.rebase_in_progress, "rebase should be in progress");
        assert_eq!(st.conflicted.len(), 1, "one conflicted file");

        // take "ours" (the rebased-onto side = mainline), continue (g.txt keeps it non-empty)
        resolve_side(p, "f.txt", true).unwrap();
        rebase_continue(p).unwrap();

        let done = crate::git::status(p).unwrap();
        assert!(!done.rebase_in_progress, "rebase complete");
        assert_eq!(std::fs::read_to_string(dir.join("f.txt")).unwrap(), "mainline\n");
        assert_eq!(std::fs::read_to_string(dir.join("g.txt")).unwrap(), "g-feature\n");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn interactive_rebase_squash() {
        let dir = std::env::temp_dir().join(format!("gitmage-irebase-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();

        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("a.txt"), "1\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "base"]);
        std::fs::write(dir.join("a.txt"), "1\n2\n").unwrap();
        g(&dir, &["commit", "-qam", "c2"]);
        std::fs::write(dir.join("a.txt"), "1\n2\n3\n").unwrap();
        g(&dir, &["commit", "-qam", "c3"]);

        let base = {
            let o = Command::new("git")
                .current_dir(&dir)
                .args(["rev-parse", "HEAD~2"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        };

        let items = rebase_todo_commits(p, &base).unwrap();
        assert_eq!(items.len(), 2, "two commits in range");

        // Squash c3 into c2.
        let todo = format!(
            "pick {} {}\nsquash {} {}\n",
            items[0].sha, items[0].subject, items[1].sha, items[1].subject
        );
        rebase_interactive(p, &base, &todo).unwrap();

        let count = {
            let o = Command::new("git")
                .current_dir(&dir)
                .args(["rev-list", "--count", "HEAD"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        };
        assert_eq!(count, "2", "base + one squashed commit");
        assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "1\n2\n3\n");
        assert!(!crate::git::status(p).unwrap().rebase_in_progress);

        let _ = std::fs::remove_dir_all(&dir);
    }
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
