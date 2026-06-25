//! Submodule operations (SPEC §6.8): list with status, init/update, sync.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::Submodule;

/// Submodules with their working state (`git submodule status`).
pub fn submodule_list(path: &str) -> AppResult<Vec<Submodule>> {
    let out = Command::new("git")
        .current_dir(path)
        .args(["-c", "core.quotePath=false", "submodule", "status"])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        if err.trim().is_empty() {
            return Ok(vec![]);
        }
        return Err(AppError::Git(err.trim().to_string()));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    let mut subs = Vec::new();
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        // First char is the status marker; the rest is "<sha> <path> (<describe>)".
        let marker = line.as_bytes()[0] as char;
        let rest = &line[1..];
        let mut it = rest.split_whitespace();
        let sha = it.next().unwrap_or("").to_string();
        let p = it.next().unwrap_or("").to_string();
        let describe = rest
            .split_once('(')
            .map(|(_, d)| d.trim_end_matches(')').trim().to_string())
            .unwrap_or_default();
        let status = match marker {
            '+' => "modified",
            '-' => "uninitialized",
            'U' => "conflict",
            _ => "ok",
        }
        .to_string();
        subs.push(Submodule { path: p, sha, status, describe });
    }
    Ok(subs)
}

fn run(path: &str, args: &[&str], network: bool) -> AppResult<()> {
    let mut cmd = Command::new("git");
    cmd.current_dir(path).args(args);
    if network {
        cmd.env("GIT_TERMINAL_PROMPT", "0");
    }
    let out = cmd.output().map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let outp = String::from_utf8_lossy(&out.stdout);
        return Err(AppError::Git(
            format!("{}\n{}", err.trim(), outp.trim()).trim().to_string(),
        ));
    }
    Ok(())
}

/// Update submodules (fetches from remote). `init` adds `--init`; a `sub` path
/// limits it to one submodule, otherwise all are updated.
pub fn submodule_update(path: &str, sub: Option<&str>, init: bool) -> AppResult<()> {
    let mut args = vec!["submodule", "update"];
    if init {
        args.push("--init");
    }
    if let Some(s) = sub {
        args.push("--");
        args.push(s);
    }
    run(path, &args, true)
}

/// Sync submodule remote URLs from .gitmodules into the working config.
pub fn submodule_sync(path: &str) -> AppResult<()> {
    run(path, &["submodule", "sync"], false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn g(dir: &Path, args: &[&str]) {
        assert!(
            Command::new("git").current_dir(dir).args(args).output().unwrap().status.success(),
            "git {args:?}"
        );
    }

    fn init_repo(dir: &Path) {
        std::fs::create_dir_all(dir).unwrap();
        g(dir, &["init", "-q"]);
        g(dir, &["config", "user.email", "t@t"]);
        g(dir, &["config", "user.name", "t"]);
        g(dir, &["config", "protocol.file.allow", "always"]);
    }

    #[test]
    fn list_init_and_status() {
        let base = std::env::temp_dir().join(format!("gitmage-sm-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let upstream = base.join("upstream");
        let super_ = base.join("super");

        // Upstream repo that becomes the submodule.
        init_repo(&upstream);
        std::fs::write(upstream.join("lib.txt"), "v1\n").unwrap();
        g(&upstream, &["add", "."]);
        g(&upstream, &["commit", "-q", "-m", "lib v1"]);

        // Superproject embeds it under `vendor/lib`.
        init_repo(&super_);
        std::fs::write(super_.join("main.txt"), "app\n").unwrap();
        g(&super_, &["add", "."]);
        g(&super_, &["commit", "-q", "-m", "app"]);
        g(
            &super_,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                upstream.to_str().unwrap(),
                "vendor/lib",
            ],
        );
        g(&super_, &["commit", "-q", "-m", "add submodule"]);

        let p = super_.to_str().unwrap();
        let subs = submodule_list(p).unwrap();
        assert_eq!(subs.len(), 1, "one submodule");
        assert_eq!(subs[0].path, "vendor/lib");
        assert_eq!(subs[0].status, "ok", "checked-out submodule is ok");

        // Deinit → uninitialized marker ('-').
        g(&super_, &["submodule", "deinit", "-f", "vendor/lib"]);
        let subs = submodule_list(p).unwrap();
        assert_eq!(subs[0].status, "uninitialized");

        // Re-init via our update path.
        submodule_update(p, Some("vendor/lib"), true).unwrap();
        assert_eq!(submodule_list(p).unwrap()[0].status, "ok");

        // sync should not error on a healthy tree.
        submodule_sync(p).unwrap();

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn empty_repo_has_no_submodules() {
        let dir = std::env::temp_dir().join(format!("gitmage-sm-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        init_repo(&dir);
        assert!(submodule_list(dir.to_str().unwrap()).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
