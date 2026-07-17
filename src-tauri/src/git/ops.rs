//! Branch + remote operations (SPEC §6.4): checkout, create branch, fetch,
//! pull, push. Network ops rely on the system credential helper / SSH agent
//! and disable interactive prompts so they fail fast instead of hanging.

use std::process::Command;
use crate::git::cmd::HideConsole;

use crate::error::{AppError, AppResult};
use crate::model::{BranchList, LocalBranch, RebaseCommit};

const US: char = '\u{1f}';

fn run(path: &str, args: &[&str], network: bool) -> AppResult<()> {
    let mut cmd = Command::new("git");
    cmd.hide_console();
    cmd.current_dir(path).args(args);
    if network {
        // Never block on a TTY prompt or a merge editor in a headless process.
        cmd.env("GIT_TERMINAL_PROMPT", "0");
        cmd.env("GIT_EDITOR", "true");
        apply_network_auth(&mut cmd, path);
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

/// Wire stored credentials into a network git child: an HTTPS username/token via
/// GIT_ASKPASS, and/or an SSH key passphrase via SSH_ASKPASS. A no-op when
/// nothing is stored — git then falls back to the system helper / SSH agent and,
/// with GIT_TERMINAL_PROMPT=0, fails fast instead of hanging.
fn apply_network_auth(cmd: &mut Command, path: &str) {
    // HTTPS: a forge PAT or a user-entered host username/password.
    if let Some((user, secret)) = crate::forge::https_auth(path) {
        if let Some(helper) = askpass_helper() {
            cmd.env("GIT_ASKPASS", helper);
            cmd.env("GITMAGE_USER", user);
            cmd.env("GITMAGE_TOKEN", secret);
        }
    }
    // SSH: hand a stored key passphrase to `ssh` via SSH_ASKPASS.
    if let Some((key, pass)) = ssh_passphrase_for(path) {
        if let Some(helper) = ssh_askpass_helper() {
            cmd.env("SSH_ASKPASS", helper);
            // OpenSSH ≥8.4 uses the askpass even without a tty when REQUIRE=force;
            // DISPLAY covers older ssh, which needs it set (any value) + no tty.
            cmd.env("SSH_ASKPASS_REQUIRE", "force");
            if std::env::var_os("DISPLAY").is_none() {
                cmd.env("DISPLAY", ":0");
            }
            cmd.env("GITMAGE_SSH_PASS", pass);
            cmd.env("GIT_SSH_COMMAND", format!("ssh -i {key} -o IdentitiesOnly=yes"));
        }
    }
}

/// (key_path, passphrase) when the repo's SSH remote uses a key (from
/// core.sshCommand's `-i`) whose passphrase we have stored; else None.
fn ssh_passphrase_for(path: &str) -> Option<(String, String)> {
    let (_, scheme) = crate::forge::remote_host_scheme(path)?;
    if scheme != "ssh" {
        return None;
    }
    let key = ssh_key_from_config(path)?;
    let pass = crate::creds::get_ssh_passphrase(&key)?;
    Some((key, pass))
}

/// The `-i <path>` key out of the repo's core.sshCommand, if configured.
pub fn ssh_key_from_config(path: &str) -> Option<String> {
    let out = Command::new("git").hide_console()
        .current_dir(path)
        .args(["config", "--get", "core.sshCommand"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let cmd = String::from_utf8_lossy(&out.stdout);
    let mut toks = cmd.split_whitespace();
    while let Some(t) = toks.next() {
        if t == "-i" {
            return toks.next().map(|s| s.trim_matches(['"', '\'']).to_string());
        }
        if let Some(rest) = t.strip_prefix("-i") {
            if !rest.is_empty() {
                return Some(rest.trim_matches(['"', '\'']).to_string());
            }
        }
    }
    None
}

/// A tiny SSH_ASKPASS helper that echoes the passphrase from the environment.
/// The secret lives only in the env passed to the git/ssh child, not the script.
fn ssh_askpass_helper() -> Option<String> {
    let p = std::env::temp_dir().join("gitmage-ssh-askpass.sh");
    std::fs::write(&p, "#!/bin/sh\nprintf '%s' \"$GITMAGE_SSH_PASS\"\n").ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).ok()?;
    }
    Some(p.to_string_lossy().into_owned())
}

/// Host of an HTTP(S) URL, for looking up a stored clone credential.
fn https_host_of(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
    let host = rest.split(['/', ':']).next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

/// Clone `url` into the new directory `dir` (network). Uses a stored HTTPS host
/// credential when one exists; otherwise relies on the system credential helper
/// / SSH agent. We never block on a TTY prompt.
pub fn clone(url: &str, dir: &str) -> AppResult<()> {
    let mut cmd = Command::new("git");
    cmd.hide_console();
    cmd.args(["clone", url, dir]);
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    // HTTPS: authenticate with a stored username/password for the URL's host.
    if url.starts_with("https://") || url.starts_with("http://") {
        if let Some((user, pass)) = https_host_of(url).and_then(|h| crate::creds::get_https(&h)) {
            if let Some(helper) = askpass_helper() {
                cmd.env("GIT_ASKPASS", helper);
                cmd.env("GITMAGE_USER", user);
                cmd.env("GITMAGE_TOKEN", pass);
            }
        }
    }
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
    let out = Command::new("git").hide_console()
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

/// Subject of the most recent HEAD reflog entry (e.g. "commit: msg",
/// "checkout: moving from a to b"), or None when there's no reflog yet.
pub fn last_action(path: &str) -> Option<String> {
    let out = Command::new("git").hide_console()
        .current_dir(path)
        .args(["reflog", "-1", "--format=%gs"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// Undo the last *safely reversible* HEAD action:
///
/// - a commit → soft reset to HEAD@{1} (keeps the changes staged);
/// - a checkout → switch back to the previous branch.
///
/// Other operations (merge/rebase/reset/…) are left alone — auto-undoing them
/// can lose work, so we refuse rather than guess. Returns a short description.
pub fn undo(path: &str) -> AppResult<String> {
    let subject = last_action(path).ok_or_else(|| AppError::Git("nothing to undo".into()))?;
    if subject.starts_with("commit") {
        // covers "commit", "commit (amend)", "commit (initial)"
        run(path, &["reset", "--soft", "HEAD@{1}"], false)?;
        Ok("Undid the last commit — changes kept staged".into())
    } else if subject.starts_with("checkout:") {
        run(path, &["checkout", "-"], false)?;
        Ok("Switched back to the previous branch".into())
    } else {
        Err(AppError::Git(format!(
            "Can't safely auto-undo the last action ({subject}). Use the graph's reset/revert instead."
        )))
    }
}

/// All tags, newest first (by creation date).
pub fn tag_list(path: &str) -> AppResult<Vec<String>> {
    let out = Command::new("git").hide_console()
        .current_dir(path)
        .args(["tag", "--sort=-creatordate"])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect())
}

/// Delete `branch` on `remote` (network: `git push <remote> --delete <branch>`).
pub fn branch_delete_remote(path: &str, remote: &str, branch: &str) -> AppResult<()> {
    run(path, &["push", remote, "--delete", branch], true)
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
    Command::new("git").hide_console()
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
    Command::new("git").hide_console()
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
    Command::new("git").hide_console()
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
    let out = Command::new("git").hide_console()
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
    let out = Command::new("git").hide_console()
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
        let ok = Command::new("git").hide_console()
            .current_dir(dir)
            .args(args)
            .output()
            .unwrap()
            .status
            .success();
        assert!(ok, "git {args:?} failed");
    }

    #[test]
    fn undo_reverts_last_commit_keeping_changes() {
        let dir = std::env::temp_dir().join(format!("gitmage-undo-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("f.txt"), "a\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "first"]);
        std::fs::write(dir.join("f.txt"), "b\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "second"]);

        assert!(last_action(p).unwrap().starts_with("commit"));
        assert!(undo(p).unwrap().contains("commit"));

        let head = Command::new("git").hide_console()
            .current_dir(&dir)
            .args(["log", "-1", "--format=%s"])
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&head.stdout).trim(), "first");
        let staged = Command::new("git").hide_console()
            .current_dir(&dir)
            .args(["diff", "--cached", "--name-only"])
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&staged.stdout).trim(), "f.txt");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tag_list_newest_first_and_remote_branch_delete() {
        let dir = std::env::temp_dir().join(format!("gitmage-tags-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q", "-b", "main"]);
        g(&dir, &["config", "user.email", "t@t"]);
        g(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("f.txt"), "x\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "c1"]);
        g(&dir, &["tag", "v1"]);
        g(&dir, &["tag", "v2"]);
        let tags = tag_list(p).unwrap();
        assert_eq!(tags.len(), 2);
        assert!(tags.contains(&"v1".to_string()) && tags.contains(&"v2".to_string()));

        // bare remote + a pushed branch, then delete it on the remote.
        let bare = dir.join("remote.git");
        g(&dir, &["init", "-q", "--bare", bare.to_str().unwrap()]);
        g(&dir, &["remote", "add", "origin", bare.to_str().unwrap()]);
        g(&dir, &["branch", "feature"]);
        g(&dir, &["push", "-q", "origin", "feature"]);
        assert!(branch_delete_remote(p, "origin", "feature").is_ok());
        let refs = Command::new("git").hide_console()
            .current_dir(&bare)
            .args(["for-each-ref", "--format=%(refname)", "refs/heads"])
            .output()
            .unwrap();
        assert!(!String::from_utf8_lossy(&refs.stdout).contains("feature"));

        let _ = std::fs::remove_dir_all(&dir);
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
            let o = Command::new("git").hide_console().current_dir(dir).args(["rev-parse", r]).output().unwrap();
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

        let out = Command::new("git").hide_console()
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
            let o = Command::new("git").hide_console()
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
            let o = Command::new("git").hide_console()
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

    #[test]
    fn https_host_parsing_for_clone_creds() {
        assert_eq!(https_host_of("https://github.com/o/r.git").as_deref(), Some("github.com"));
        assert_eq!(
            https_host_of("https://user@gitlab.example.com:8443/o/r.git").as_deref(),
            Some("gitlab.example.com")
        );
        // SSH remotes have no HTTPS host to key a stored password on.
        assert_eq!(https_host_of("git@github.com:o/r.git"), None);
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
    let out = Command::new("git").hide_console()
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
    let local_out = Command::new("git").hide_console()
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

    let remote_out = Command::new("git").hide_console()
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
