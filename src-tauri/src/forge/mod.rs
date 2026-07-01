//! Code-hosting integrations (SPEC §M6): detect the provider from a repo's
//! remote, store per-provider personal access tokens in the system keychain,
//! and fetch pull/merge requests and issues from GitHub, GitLab and Bitbucket.
//!
//! Tokens never touch our SQLite/config — they live only in the OS keychain
//! (Keychain / Credential Manager / Secret Service) via the `keyring` crate.

mod api;

pub use api::{create_pull, fetch_issues, fetch_pulls};

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::ForgeInfo;

const KEYCHAIN_SERVICE: &str = "dev.gitmage.desktop";

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Provider {
    GitHub,
    GitLab,
    Bitbucket,
}

impl Provider {
    pub fn key(self) -> &'static str {
        match self {
            Provider::GitHub => "github",
            Provider::GitLab => "gitlab",
            Provider::Bitbucket => "bitbucket",
        }
    }

    pub fn from_key(s: &str) -> Option<Provider> {
        match s {
            "github" => Some(Provider::GitHub),
            "gitlab" => Some(Provider::GitLab),
            "bitbucket" => Some(Provider::Bitbucket),
            _ => None,
        }
    }

    fn from_host(host: &str) -> Option<Provider> {
        let h = host.to_lowercase();
        if h.contains("github") {
            Some(Provider::GitHub)
        } else if h.contains("gitlab") {
            Some(Provider::GitLab)
        } else if h.contains("bitbucket") {
            Some(Provider::Bitbucket)
        } else {
            None
        }
    }
}

/// A repo's remote location, parsed from its origin URL.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoRef {
    pub provider: Provider,
    pub host: String,
    pub owner: String,
    /// Everything after the owner — usually the repo name, but may include
    /// GitLab subgroups (e.g. "group/sub/project").
    pub repo: String,
}

impl RepoRef {
    /// Full project path "owner/repo" (handles GitLab subgroups).
    pub fn full_path(&self) -> String {
        format!("{}/{}", self.owner, self.repo)
    }
}

/// Parse an SSH or HTTPS git remote URL into (host, path-without-.git).
fn parse_remote_url(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    let (host, path) = if let Some(rest) = url.strip_prefix("git@") {
        // scp-style: git@host:owner/repo.git
        let (host, path) = rest.split_once(':')?;
        (host.to_string(), path.to_string())
    } else if let Some(rest) = url.strip_prefix("ssh://") {
        // ssh://git@host[:port]/owner/repo.git
        let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
        let (hostport, path) = rest.split_once('/')?;
        let host = hostport.split(':').next().unwrap_or(hostport);
        (host.to_string(), path.to_string())
    } else if let Some(rest) = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://")) {
        // https://[user@]host/owner/repo.git
        let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
        let (host, path) = rest.split_once('/')?;
        (host.to_string(), path.to_string())
    } else {
        return None;
    };

    let path = path.trim_matches('/').trim_end_matches(".git").to_string();
    if host.is_empty() || path.is_empty() {
        return None;
    }
    Some((host, path))
}

/// The origin remote URL (falls back to the first configured remote).
fn remote_url(path: &str) -> Option<String> {
    let try_remote = |name: &str| {
        Command::new("git")
            .current_dir(path)
            .args(["remote", "get-url", name])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty())
    };
    if let Some(u) = try_remote("origin") {
        return Some(u);
    }
    // Otherwise pick the first remote listed.
    let out = Command::new("git").current_dir(path).args(["remote"]).output().ok()?;
    let first = String::from_utf8_lossy(&out.stdout).lines().next()?.trim().to_string();
    if first.is_empty() {
        None
    } else {
        try_remote(&first)
    }
}

/// Parse a remote into a RepoRef (None when there's no remote or the host is
/// not a recognised forge).
pub fn parse_repo_ref(url: &str) -> Option<RepoRef> {
    let (host, path) = parse_remote_url(url)?;
    let provider = Provider::from_host(&host)?;
    let (owner, repo) = path.split_once('/')?;
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some(RepoRef {
        provider,
        host,
        owner: owner.to_string(),
        repo: repo.to_string(),
    })
}

/// Detect the forge for a repo, including whether a token is stored.
pub fn detect(path: &str) -> ForgeInfo {
    let blank = || ForgeInfo {
        provider: String::new(),
        host: String::new(),
        owner: String::new(),
        repo: String::new(),
        has_token: false,
    };
    let Some(url) = remote_url(path) else { return blank() };
    let Some(rr) = parse_repo_ref(&url) else {
        // Known remote but unrecognised host — surface host for context.
        if let Some((host, _)) = parse_remote_url(&url) {
            return ForgeInfo { host, ..blank() };
        }
        return blank();
    };
    ForgeInfo {
        provider: rr.provider.key().to_string(),
        host: rr.host.clone(),
        owner: rr.owner.clone(),
        repo: rr.repo.clone(),
        has_token: get_token(rr.provider).is_some(),
    }
}

fn entry(provider: Provider) -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, provider.key())
        .map_err(|e| AppError::Msg(format!("keychain: {e}")))
}

/// Read a stored token, or None if absent.
pub fn get_token(provider: Provider) -> Option<String> {
    entry(provider).ok()?.get_password().ok()
}

pub fn set_token(provider: Provider, token: &str) -> AppResult<()> {
    entry(provider)?
        .set_password(token)
        .map_err(|e| AppError::Msg(format!("keychain set: {e}")))
}

pub fn clear_token(provider: Provider) -> AppResult<()> {
    match entry(provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Msg(format!("keychain clear: {e}"))),
    }
}

/// Username git should use with a forge personal access token over HTTPS.
fn https_user(p: Provider) -> &'static str {
    match p {
        Provider::GitHub => "x-access-token",
        Provider::GitLab => "oauth2",
        Provider::Bitbucket => "x-token-auth",
    }
}

/// For an HTTPS forge remote with a stored token, the (username, token) to feed
/// git's askpass so fetch/pull/push authenticate non-interactively. Returns None
/// for SSH remotes (the SSH agent handles those) or when no token is stored.
pub fn https_token(path: &str) -> Option<(String, String)> {
    let url = remote_url(path)?;
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return None;
    }
    let rr = parse_repo_ref(&url)?;
    let token = get_token(rr.provider)?;
    Some((https_user(rr.provider).to_string(), token))
}

/// Resolve a repo path to its RepoRef, erroring if unsupported.
pub fn require_ref(path: &str) -> AppResult<RepoRef> {
    remote_url(path)
        .as_deref()
        .and_then(parse_repo_ref)
        .ok_or_else(|| AppError::Msg("no supported forge remote for this repo".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ssh_scp_style() {
        let rr = parse_repo_ref("git@bitbucket.org:vallettasoftwarecom/done-it-ai.git").unwrap();
        assert_eq!(rr.provider, Provider::Bitbucket);
        assert_eq!(rr.host, "bitbucket.org");
        assert_eq!(rr.owner, "vallettasoftwarecom");
        assert_eq!(rr.repo, "done-it-ai");
        assert_eq!(rr.full_path(), "vallettasoftwarecom/done-it-ai");
    }

    #[test]
    fn parse_https_github() {
        let rr = parse_repo_ref("https://github.com/anthropics/claude-code.git").unwrap();
        assert_eq!(rr.provider, Provider::GitHub);
        assert_eq!(rr.owner, "anthropics");
        assert_eq!(rr.repo, "claude-code");
    }

    #[test]
    fn parse_https_with_user() {
        let rr = parse_repo_ref("https://user@gitlab.com/group/project.git").unwrap();
        assert_eq!(rr.provider, Provider::GitLab);
        assert_eq!(rr.owner, "group");
        assert_eq!(rr.repo, "project");
    }

    #[test]
    fn parse_ssh_url_style_with_port() {
        let rr = parse_repo_ref("ssh://git@gitlab.com:22/group/sub/project.git").unwrap();
        assert_eq!(rr.provider, Provider::GitLab);
        assert_eq!(rr.owner, "group");
        assert_eq!(rr.repo, "sub/project", "subgroups preserved in repo path");
        assert_eq!(rr.full_path(), "group/sub/project");
    }

    #[test]
    fn unknown_host_is_none() {
        assert!(parse_repo_ref("git@example.com:owner/repo.git").is_none());
    }

    #[test]
    fn non_url_is_none() {
        assert!(parse_repo_ref("not a url").is_none());
    }

    #[test]
    fn https_token_gating_without_keychain() {
        use std::process::Command;
        let dir = std::env::temp_dir().join(format!("gitmage-askpass-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        let g = |args: &[&str]| {
            Command::new("git").current_dir(&dir).args(args).output().unwrap();
        };
        g(&["init", "-q"]);

        // SSH remote → no askpass token (handled by the SSH agent), no keychain hit.
        g(&["remote", "add", "origin", "git@github.com:o/r.git"]);
        assert!(https_token(p).is_none());

        // HTTPS on an unrecognised host → None before any keychain lookup.
        g(&["remote", "set-url", "origin", "https://example.com/o/r.git"]);
        assert!(https_token(p).is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
