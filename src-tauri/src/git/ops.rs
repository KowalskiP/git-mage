//! Branch + remote operations (SPEC §6.4): checkout, create branch, fetch,
//! pull, push. Network ops rely on the system credential helper / SSH agent
//! and disable interactive prompts so they fail fast instead of hanging.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::{BranchList, LocalBranch, RebaseCommit};

const US: char = '\u{1f}';

fn run(path: &str, args: &[&str], network: bool) -> AppResult<()> {
    let mut cmd = Command::new("git");
    cmd.current_dir(path).args(args);
    if network {
        // Never block on a TTY prompt or a merge editor in a headless process.
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        cmd.env("GIT_EDITOR", "true");
        // HTTPS forge remote with a stored PAT → authenticate via askpass
        // instead of failing. SSH remotes return None and use the SSH agent.
        if let Some((user, token)) = crate::forge::https_token(path) {
            if let Some(helper) = askpass_helper() {
                cmd.env("GIT_ASKPASS", helper);
                cmd.env("GITMAGE_USER", user);
                cmd.env("GITMAGE_TOKEN", token);
            }
        }
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

/// Write (idempotently) a tiny GIT_ASKPASS helper that echoes the username /
/// token from the environment, and return its path. The secret lives only in
/// the env passed to the git child, never in the script file.
fn askpass_helper() -> Option<String> {
    let p = std::env::temp_dir().join("gitmage-askpass.sh");
    let body = "#!/bin/sh\ncase \"$1\" in\n  *[Uu]sername*) printf '%s' \"$GITMAGE_USER\" ;;\n  *) printf '%s' \"$GITMAGE_TOKEN\" ;;\nesac\n";
    std::fs::write(&p, body).ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).ok()?;
    }
    Some(p.to_string_lossy().into_owned())
}

/// Clone `url` into the new directory `dir` (network). Auth relies on the
/// system credential helper / SSH agent; we never block on a TTY prompt.
pub fn clone(url: &str, dir: &str) -> AppResult<()> {
    let mut cmd = Command::new("git");
    cmd.args(["clone", url, dir]);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    let out = cmd
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Git(err.trim().to_string()));
    }
    Ok(())
}

/// Initialize a new repository at `dir` (creating it if needed) with `main` as
/// the initial branch.
pub fn init(dir: &str) -> AppResult<()> {
    std::fs::create_dir_all(dir).map_err(|e| AppError::Git(format!("mkdir: {e}")))?;
    let out = Command::new("git")
        .current_dir(dir)
        .args(["init", "-q", "-b", "main"])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::Git(err.trim().to_string()));
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

/// Apply commit `sha` onto the current branch. On conflict, leaves a cherry-pick
/// in progress (resolve, then continue/abort).
pub fn cherry_pick(path: &str, sha: &str) -> AppResult<()> {
    // network=true → GIT_EDITOR=true so the commit message editor never blocks.
    run(path, &["cherry-pick", sha], true)
}

/// Create a commit that reverses `sha`.
pub fn revert(path: &str, sha: &str) -> AppResult<()> {
    run(path, &["revert", "--no-edit", sha], true)
}

/// Move HEAD (and optionally the index/worktree) to `target`.
/// `mode` is "soft" | "mixed" | "hard".
pub fn reset(path: &str, target: &str, mode: &str) -> AppResult<()> {
    let flag = match mode {
        "soft" => "--soft",
        "hard" => "--hard",
        _ => "--mixed",
    };
    run(path, &["reset", flag, target], false)
}

fn sequencer_cmd(kind: &str) -> &'static str {
    if kind == "revert" {
        "revert"
    } else {
        "cherry-pick"
    }
}

/// Continue an in-progress cherry-pick / revert after resolving conflicts.
pub fn sequencer_continue(path: &str, kind: &str) -> AppResult<()> {
    run(path, &[sequencer_cmd(kind), "--continue"], true)
}

/// Abort an in-progress cherry-pick / revert.
pub fn sequencer_abort(path: &str, kind: &str) -> AppResult<()> {
    run(path, &[sequencer_cmd(kind), "--abort"], false)
}

/// Resolve a conflicted file by taking one side, then mark it resolved (`git add`).
pub fn resolve_side(path: &str, file: &str, ours: bool) -> AppResult<()> {
    let side = if ours { "--ours" } else { "--theirs" };
    run(path, &["checkout", side, "--", file], false)?;
    run(path, &["add", "--", file], false)
}

fn tool_configured(path: &str, key: &str) -> bool {
    Command::new("git")
        .current_dir(path)
        .args(["config", "--get", key])
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false)
}

/// Launch the configured external diff tool for a file (fire-and-forget).
pub fn launch_difftool(path: &str, file: &str) -> AppResult<()> {
    if !tool_configured(path, "diff.tool") && !tool_configured(path, "merge.tool") {
        return Err(AppError::Msg(
            "No external diff tool configured (set git config diff.tool)".into(),
        ));
    }
    Command::new("git")
        .current_dir(path)
        .args(["difftool", "--no-prompt", "--", file])
        .spawn()
        .map_err(|e| AppError::Git(format!("difftool: {e}")))?;
    Ok(())
}

/// Launch the configured external merge tool for a conflicted file (fire-and-forget).
pub fn launch_mergetool(path: &str, file: &str) -> AppResult<()> {
    if !tool_configured(path, "merge.tool") {
        return Err(AppError::Msg(
            "No external merge tool configured (set git config merge.tool)".into(),
        ));
    }
    Command::new("git")
        .current_dir(path)
        .args(["mergetool", "--no-prompt", file])
        .spawn()
        .map_err(|e| AppError::Git(format!("mergetool: {e}")))?;
    Ok(())
}

/// Raw contents of a (conflicted) working-tree file, including conflict markers.
pub fn conflict_content(path: &str, file: &str) -> AppResult<String> {
    let full = std::path::Path::new(path).join(file);
    std::fs::read_to_string(&full).map_err(|e| AppError::Git(format!("read {file}: {e}")))
}

/// Write a resolved file and mark it resolved (`git add`).
pub fn write_resolution(path: &str, file: &str, content: &str) -> AppResult<()> {
    let full = std::path::Path::new(path).join(file);
    std::fs::write(&full, content).map_err(|e| AppError::Git(format!("write {file}: {e}")))?;
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

// Helpers below are defined after this module for historical reasons; the test
// module intentionally sits mid-file.
#[allow(clippy::items_after_test_module)]
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
    fn parse_track_ahead_behind() {
        assert_eq!(parse_track("[ahead 1, behind 2]"), (1, 2));
        assert_eq!(parse_track("[ahead 3]"), (3, 0));
        assert_eq!(parse_track("[behind 5]"), (0, 5));
        assert_eq!(parse_track(""), (0, 0));
        assert_eq!(parse_track("[gone]"), (0, 0));
    }

    #[test]
    fn branch_list_local_current_and_remotes() {
        let dir = std::env::temp_dir().join(format!("gitmage-blist-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q", "-b", "main"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("a.txt"), "a\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "base"]);
        g(&dir, &["branch", "feature"]);

        let bl = branch_list(p).unwrap();
        assert_eq!(bl.local.len(), 2);
        let main = bl.local.iter().find(|b| b.name == "main").unwrap();
        assert!(main.current, "main is current");
        assert!(bl.local.iter().any(|b| b.name == "feature" && !b.current));
        assert!(bl.remote.is_empty(), "no remotes configured");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cherry_pick_revert_reset_and_sequencer() {
        fn rev(dir: &Path, r: &str) -> String {
            let o = Command::new("git").current_dir(dir).args(["rev-parse", r]).output().unwrap();
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        }

        let dir = std::env::temp_dir().join(format!("gitmage-seq-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("a.txt"), "a\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "base"]);
        let base = rev(&dir, "HEAD");

        // Side branch adds b.txt.
        g(&dir, &["checkout", "-q", "-b", "feature"]);
        std::fs::write(dir.join("b.txt"), "b\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "add b"]);
        let feat = rev(&dir, "HEAD");

        // Cherry-pick brings b.txt onto the base branch.
        g(&dir, &["checkout", "-q", "-"]);
        cherry_pick(p, &feat).unwrap();
        assert!(dir.join("b.txt").exists(), "cherry-pick applied");

        // Revert undoes it.
        revert(p, &rev(&dir, "HEAD")).unwrap();
        assert!(!dir.join("b.txt").exists(), "revert removed b.txt");

        // Reset --hard back to base drops the cherry-pick + revert commits.
        reset(p, &base, "hard").unwrap();
        assert_eq!(rev(&dir, "HEAD"), base, "HEAD reset to base");
        assert!(!dir.join("b.txt").exists());

        // Conflicting cherry-pick leaves a sequencer in progress; abort clears it.
        std::fs::write(dir.join("a.txt"), "mainline\n").unwrap();
        g(&dir, &["commit", "-qam", "main edit"]);
        g(&dir, &["checkout", "-q", "-b", "other", &base]);
        std::fs::write(dir.join("a.txt"), "other\n").unwrap();
        g(&dir, &["commit", "-qam", "other edit"]);
        let other = rev(&dir, "HEAD");
        g(&dir, &["checkout", "-q", "-"]);
        assert!(cherry_pick(p, &other).is_err(), "cherry-pick should conflict");
        assert_eq!(crate::git::status(p).unwrap().sequencer, "cherry-pick");
        sequencer_abort(p, "cherry-pick").unwrap();
        assert_eq!(crate::git::status(p).unwrap().sequencer, "");

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

    #[test]
    fn conflict_editor_round_trip() {
        let dir = std::env::temp_dir().join(format!("gitmage-cflt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();

        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("f.txt"), "base\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "base"]);
        g(&dir, &["checkout", "-q", "-b", "feature"]);
        std::fs::write(dir.join("f.txt"), "feature\n").unwrap();
        g(&dir, &["commit", "-qam", "feat"]);
        g(&dir, &["checkout", "-q", "-"]);
        std::fs::write(dir.join("f.txt"), "mainline\n").unwrap();
        g(&dir, &["commit", "-qam", "main change"]);
        assert!(merge(p, "feature").is_err(), "merge should conflict");

        // The working file has conflict markers we can parse + edit.
        let content = conflict_content(p, "f.txt").unwrap();
        assert!(content.contains("<<<<<<<") && content.contains(">>>>>>>"), "markers present");

        // Write a hand-resolved version and mark it resolved.
        write_resolution(p, "f.txt", "resolved\n").unwrap();
        let st = crate::git::status(p).unwrap();
        assert_eq!(st.conflicted.len(), 0, "no conflicts after resolution");
        assert_eq!(std::fs::read_to_string(dir.join("f.txt")).unwrap(), "resolved\n");

        merge_continue(p).unwrap();
        assert!(!crate::git::status(p).unwrap().merge_in_progress, "merge complete");

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

/// Parse ahead/behind from a `%(upstream:track)` string like "[ahead 1, behind 2]".
fn parse_track(s: &str) -> (u32, u32) {
    let num_after = |kw: &str| -> u32 {
        s.find(kw)
            .and_then(|i| {
                s[i + kw.len()..]
                    .trim_start()
                    .split(|c: char| !c.is_ascii_digit())
                    .next()
            })
            .and_then(|d| d.parse().ok())
            .unwrap_or(0)
    };
    (num_after("ahead "), num_after("behind "))
}

/// Local branches (current + ahead/behind) and remote-tracking branches, for
/// the sidebar explorer (SPEC §6.4).
pub fn branch_list(path: &str) -> AppResult<BranchList> {
    let local_out = Command::new("git")
        .current_dir(path)
        .args([
            "for-each-ref",
            &format!("--format=%(refname:short){US}%(HEAD){US}%(upstream:track)"),
            "refs/heads",
        ])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !local_out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&local_out.stderr).trim().to_string(),
        ));
    }
    let mut local = Vec::new();
    for line in String::from_utf8_lossy(&local_out.stdout).lines() {
        let mut f = line.split(US);
        let name = f.next().unwrap_or("").to_string();
        if name.is_empty() {
            continue;
        }
        let current = f.next().unwrap_or("") == "*";
        let (ahead, behind) = parse_track(f.next().unwrap_or(""));
        local.push(LocalBranch { name, current, ahead, behind });
    }

    let remote_out = Command::new("git")
        .current_dir(path)
        .args(["for-each-ref", "--format=%(refname:short)", "refs/remotes"])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    let remote = String::from_utf8_lossy(&remote_out.stdout)
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !s.ends_with("/HEAD"))
        .collect();

    Ok(BranchList { local, remote })
}
