//! Apply a saved identity profile (SPEC #6) to a repo's local git config:
//! user.name/email, optional signing key, optional SSH key. Writes go to the
//! repo-local config so different repos can use different identities.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::Profile;

fn set(path: &str, key: &str, value: &str) -> AppResult<()> {
    let out = Command::new("git")
        .current_dir(path)
        .args(["config", key, value])
        .output()
        .map_err(|e| AppError::Git(format!("git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

fn get(path: &str, key: &str) -> String {
    Command::new("git")
        .current_dir(path)
        .args(["config", "--get", key])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}

/// Apply `p` to the repo's local config. Only the fields the profile actually
/// sets are written; empty fields leave existing config untouched.
pub fn apply_profile(path: &str, p: &Profile) -> AppResult<()> {
    if !p.user_name.is_empty() {
        set(path, "user.name", &p.user_name)?;
    }
    if !p.user_email.is_empty() {
        set(path, "user.email", &p.user_email)?;
    }
    if !p.signing_key.is_empty() {
        set(path, "user.signingkey", &p.signing_key)?;
        if !p.signing_format.is_empty() {
            set(path, "gpg.format", &p.signing_format)?;
        }
        set(path, "commit.gpgsign", "true")?;
    }
    if !p.ssh_key_path.is_empty() {
        set(
            path,
            "core.sshCommand",
            &format!("ssh -i {} -o IdentitiesOnly=yes", p.ssh_key_path),
        )?;
    }
    Ok(())
}

/// Effective identity (name, email) for the repo — what commits will use.
pub fn identity(path: &str) -> AppResult<(String, String)> {
    Ok((get(path, "user.name"), get(path, "user.email")))
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

    #[test]
    fn apply_sets_local_identity() {
        let dir = std::env::temp_dir().join(format!("gitmage-prof-apply-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q"]);

        let prof = Profile {
            id: 1,
            name: "Work".into(),
            user_name: "Ann Dev".into(),
            user_email: "ann@work.com".into(),
            signing_key: "ABC123".into(),
            signing_format: "openpgp".into(),
            ssh_key_path: String::new(),
        };
        apply_profile(p, &prof).unwrap();

        let (name, email) = identity(p).unwrap();
        assert_eq!(name, "Ann Dev");
        assert_eq!(email, "ann@work.com");
        assert_eq!(get(p, "user.signingkey"), "ABC123");
        assert_eq!(get(p, "commit.gpgsign"), "true");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
