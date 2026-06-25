//! Commit-signing configuration (SPEC §M5): read/write the git config that
//! controls GPG/SSH commit signing. The actual signing happens inside
//! `git commit`, which honours `commit.gpgsign`/`gpg.format`/`user.signingkey`.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::SigningConfig;

/// Read a single git config value (local → global fallback), trimmed.
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
    if v.is_empty() {
        None
    } else {
        Some(v)
    }
}

fn config_set(path: &str, key: &str, value: &str) -> AppResult<()> {
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

/// Current signing config for the repo.
pub fn signing_config(path: &str) -> AppResult<SigningConfig> {
    let sign = config_get(path, "commit.gpgsign")
        .map(|v| v == "true")
        .unwrap_or(false);
    // git's default format is openpgp when unset.
    let format = config_get(path, "gpg.format").unwrap_or_else(|| "openpgp".into());
    let key = config_get(path, "user.signingkey").unwrap_or_default();
    Ok(SigningConfig { sign, format, key })
}

/// Write signing config into the repo's local git config.
pub fn set_signing(path: &str, sign: bool, format: &str, key: &str) -> AppResult<()> {
    config_set(path, "commit.gpgsign", if sign { "true" } else { "false" })?;
    if !format.is_empty() {
        config_set(path, "gpg.format", format)?;
    }
    // Allow clearing the key by passing an empty string.
    if key.is_empty() {
        let _ = Command::new("git")
            .current_dir(path)
            .args(["config", "--unset", "user.signingkey"])
            .output();
    } else {
        config_set(path, "user.signingkey", key)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;

    fn g(dir: &Path, args: &[&str]) {
        assert!(
            Command::new("git").current_dir(dir).args(args).output().unwrap().status.success(),
            "git {args:?}"
        );
    }

    #[test]
    fn roundtrip_signing_config() {
        let dir = std::env::temp_dir().join(format!("gitmage-sign-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        g(&dir, &["init", "-q"]);

        let cfg = signing_config(p).unwrap();
        assert!(!cfg.sign, "off by default");

        set_signing(p, true, "ssh", "/tmp/id_ed25519.pub").unwrap();
        let cfg = signing_config(p).unwrap();
        assert!(cfg.sign);
        assert_eq!(cfg.format, "ssh");
        assert_eq!(cfg.key, "/tmp/id_ed25519.pub");

        // Clearing the key unsets it.
        set_signing(p, false, "ssh", "").unwrap();
        let cfg = signing_config(p).unwrap();
        assert!(!cfg.sign);
        assert_eq!(cfg.key, "");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
