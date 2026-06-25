//! Gitflow helper (SPEC §M5): start/finish feature, release and hotfix branches
//! by convention. Implemented natively on top of plain git (no dependency on
//! the `git-flow` extension), reading any `gitflow.*` config overrides written
//! by `git flow init` so it interoperates with repos already using gitflow.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::GitflowConfig;

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

fn config_get(path: &str, key: &str) -> Option<String> {
    let out = Command::new("git")
        .current_dir(path)
        .args(["config", "--get", key])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!v.is_empty()).then_some(v)
}

fn branch_exists(path: &str, name: &str) -> bool {
    Command::new("git")
        .current_dir(path)
        .args(["rev-parse", "--verify", "--quiet", &format!("refs/heads/{name}")])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn current_branch(path: &str) -> String {
    Command::new("git")
        .current_dir(path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

/// Resolve the production branch: gitflow config, else `main`, else `master`.
fn main_branch(path: &str) -> String {
    if let Some(m) = config_get(path, "gitflow.branch.master") {
        return m;
    }
    if branch_exists(path, "main") {
        return "main".into();
    }
    if branch_exists(path, "master") {
        return "master".into();
    }
    "main".into()
}

fn prefixes(path: &str) -> (String, String, String) {
    (
        config_get(path, "gitflow.prefix.feature").unwrap_or_else(|| "feature/".into()),
        config_get(path, "gitflow.prefix.release").unwrap_or_else(|| "release/".into()),
        config_get(path, "gitflow.prefix.hotfix").unwrap_or_else(|| "hotfix/".into()),
    )
}

/// Current gitflow configuration and the active flow branch (if any).
pub fn gitflow_status(path: &str) -> AppResult<GitflowConfig> {
    let main = main_branch(path);
    let develop = config_get(path, "gitflow.branch.develop").unwrap_or_else(|| "develop".into());
    let (feature_prefix, release_prefix, hotfix_prefix) = prefixes(path);
    let current = current_branch(path);

    let (current_kind, current_name) = if let Some(n) = current.strip_prefix(&feature_prefix) {
        ("feature".to_string(), n.to_string())
    } else if let Some(n) = current.strip_prefix(&release_prefix) {
        ("release".to_string(), n.to_string())
    } else if let Some(n) = current.strip_prefix(&hotfix_prefix) {
        ("hotfix".to_string(), n.to_string())
    } else {
        (String::new(), String::new())
    };

    Ok(GitflowConfig {
        initialized: branch_exists(path, &develop),
        main,
        develop,
        feature_prefix,
        release_prefix,
        hotfix_prefix,
        current,
        current_kind,
        current_name,
    })
}

/// Initialise gitflow: create the develop branch off main if missing and record
/// the standard branch/prefix config.
pub fn gitflow_init(path: &str) -> AppResult<()> {
    let main = main_branch(path);
    let develop = config_get(path, "gitflow.branch.develop").unwrap_or_else(|| "develop".into());

    if !branch_exists(path, &develop) {
        if branch_exists(path, &main) {
            run(path, &["branch", &develop, &main])?;
        } else {
            // Unborn/empty repo: just create the branch at HEAD.
            run(path, &["branch", &develop])?;
        }
    }
    let set = |k: &str, v: &str| run(path, &["config", k, v]);
    set("gitflow.branch.master", &main)?;
    set("gitflow.branch.develop", &develop)?;
    set("gitflow.prefix.feature", "feature/")?;
    set("gitflow.prefix.release", "release/")?;
    set("gitflow.prefix.hotfix", "hotfix/")?;
    Ok(())
}

fn prefix_for(cfg: &GitflowConfig, kind: &str) -> AppResult<String> {
    match kind {
        "feature" => Ok(cfg.feature_prefix.clone()),
        "release" => Ok(cfg.release_prefix.clone()),
        "hotfix" => Ok(cfg.hotfix_prefix.clone()),
        _ => Err(AppError::Msg(format!("unknown gitflow kind: {kind}"))),
    }
}

/// Start a flow branch: feature/release branch off develop, hotfix off main.
pub fn gitflow_start(path: &str, kind: &str, name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Msg("Branch name is empty".into()));
    }
    let cfg = gitflow_status(path)?;
    let branch = format!("{}{}", prefix_for(&cfg, kind)?, name);
    let base = if kind == "hotfix" { &cfg.main } else { &cfg.develop };
    run(path, &["checkout", "-b", &branch, base])
}

/// Finish a flow branch: merge into the target branch(es), tag release/hotfix,
/// and delete the branch. Merge conflicts surface as an error and leave the
/// repo mid-merge for resolution via the normal conflict flow.
pub fn gitflow_finish(path: &str, kind: &str, name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Msg("Branch name is empty".into()));
    }
    let cfg = gitflow_status(path)?;
    let branch = format!("{}{}", prefix_for(&cfg, kind)?, name);
    if !branch_exists(path, &branch) {
        return Err(AppError::Git(format!("no such branch: {branch}")));
    }

    let merge_into = |target: &str| -> AppResult<()> {
        run(path, &["checkout", target])?;
        run(path, &["merge", "--no-ff", "-m", &format!("Merge {branch} into {target}"), &branch])
    };

    match kind {
        "feature" => {
            merge_into(&cfg.develop)?;
        }
        "release" | "hotfix" => {
            merge_into(&cfg.main)?;
            // Tag the production merge with the release/hotfix name.
            run(path, &["tag", "-a", name, "-m", &format!("{kind} {name}")])?;
            merge_into(&cfg.develop)?;
        }
        _ => return Err(AppError::Msg(format!("unknown gitflow kind: {kind}"))),
    }
    run(path, &["branch", "-d", &branch])
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
        g(dir, &["init", "-q", "-b", "main"]);
        g(dir, &["config", "user.email", "t@t"]);
        g(dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("a.txt"), "x\n").unwrap();
        g(dir, &["add", "."]);
        g(dir, &["commit", "-q", "-m", "base"]);
    }

    #[test]
    fn init_start_finish_feature() {
        let dir = std::env::temp_dir().join(format!("gitmage-flow-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        init_repo(&dir);
        let p = dir.to_str().unwrap();

        let cfg = gitflow_status(p).unwrap();
        assert!(!cfg.initialized, "no develop yet");
        assert_eq!(cfg.main, "main");

        gitflow_init(p).unwrap();
        let cfg = gitflow_status(p).unwrap();
        assert!(cfg.initialized, "develop created");

        gitflow_start(p, "feature", "login").unwrap();
        let cfg = gitflow_status(p).unwrap();
        assert_eq!(cfg.current, "feature/login");
        assert_eq!(cfg.current_kind, "feature");
        assert_eq!(cfg.current_name, "login");

        // Make a commit on the feature branch, then finish it into develop.
        std::fs::write(dir.join("f.txt"), "feature\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "feature work"]);

        gitflow_finish(p, "feature", "login").unwrap();
        let cfg = gitflow_status(p).unwrap();
        assert_eq!(cfg.current, "develop", "back on develop");
        assert!(!branch_exists(p, "feature/login"), "feature branch deleted");
        assert!(dir.join("f.txt").exists(), "feature work merged");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn release_merges_to_main_and_tags() {
        let dir = std::env::temp_dir().join(format!("gitmage-flow-rel-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        init_repo(&dir);
        let p = dir.to_str().unwrap();
        gitflow_init(p).unwrap();

        gitflow_start(p, "release", "1.0").unwrap();
        std::fs::write(dir.join("r.txt"), "rel\n").unwrap();
        g(&dir, &["add", "."]);
        g(&dir, &["commit", "-q", "-m", "release prep"]);

        gitflow_finish(p, "release", "1.0").unwrap();

        // Tag exists and main contains the release work.
        let tags = Command::new("git").current_dir(&dir).args(["tag"]).output().unwrap();
        assert!(String::from_utf8_lossy(&tags.stdout).contains("1.0"), "tag created");
        assert!(!branch_exists(p, "release/1.0"), "release branch deleted");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
