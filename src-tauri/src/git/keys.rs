//! Generate SSH and GPG keys from the profile UI (SPEC #6). The user picks a
//! name and an optional passphrase; we shell out to `ssh-keygen` / `gpg` and
//! return only public material (the SSH public key line, or the GPG
//! fingerprint) so the caller can wire it into a profile. Passphrases are fed
//! to the child and never persisted or logged.

use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::error::{AppError, AppResult};
use crate::git::cmd::HideConsole;
use crate::model::GeneratedKey;

/// The user's home directory (`$HOME`, or `%USERPROFILE%` on Windows).
fn home_dir() -> AppResult<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| AppError::Msg("could not locate your home directory".into()))
}

/// `~/.ssh`, created (0700 on unix) if missing.
fn ssh_dir() -> AppResult<PathBuf> {
    let dir = home_dir()?.join(".ssh");
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Msg(format!("create ~/.ssh: {e}")))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    Ok(dir)
}

/// Keep a user-supplied name safe for a filename: alphanumerics, dash and
/// underscore survive; everything else becomes `_`.
fn sanitize(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if s.is_empty() {
        "key".to_string()
    } else {
        s
    }
}

/// Generate an SSH keypair at `~/.ssh/id_<type>_<name>` and return its path and
/// public-key line. `key_type` is "ed25519" (default) or "rsa" (4096-bit). An
/// empty `passphrase` produces an unprotected key. Refuses to overwrite.
///
/// The passphrase is passed via `-N`; on a shared host it is briefly visible in
/// the process list to the same user, an accepted trade-off for a desktop app.
pub fn ssh_keygen(
    name: &str,
    key_type: &str,
    passphrase: &str,
    comment: &str,
) -> AppResult<GeneratedKey> {
    let ktype = if key_type == "rsa" { "rsa" } else { "ed25519" };
    let path = ssh_dir()?.join(format!("id_{ktype}_{}", sanitize(name)));
    if path.exists() {
        return Err(AppError::Msg(format!(
            "a key already exists at {} — pick another name",
            path.display()
        )));
    }
    let path_s = path.to_string_lossy().into_owned();

    let mut args: Vec<String> = vec![
        "-t".into(),
        ktype.into(),
        "-f".into(),
        path_s.clone(),
        "-N".into(),
        passphrase.to_string(),
    ];
    if ktype == "rsa" {
        args.push("-b".into());
        args.push("4096".into());
    }
    if !comment.trim().is_empty() {
        args.push("-C".into());
        args.push(comment.trim().to_string());
    }

    let out = Command::new("ssh-keygen")
        .hide_console()
        .args(&args)
        .output()
        .map_err(|e| AppError::Msg(format!("ssh-keygen not available: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Msg(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }

    let public = std::fs::read_to_string(format!("{path_s}.pub"))
        .unwrap_or_default()
        .trim()
        .to_string();
    Ok(GeneratedKey { kind: "ssh".into(), path: path_s, public })
}

/// Generate a GPG signing key for "`name` <`email`>" and return its
/// fingerprint (for `user.signingkey`). `algo` is "ed25519" (default) or "rsa"
/// (4096-bit). An empty `passphrase` produces an unprotected key. Requires
/// `gpg` on PATH.
pub fn gpg_keygen(
    name: &str,
    email: &str,
    passphrase: &str,
    algo: &str,
) -> AppResult<GeneratedKey> {
    let uid = if email.trim().is_empty() {
        name.trim().to_string()
    } else {
        format!("{} <{}>", name.trim(), email.trim())
    };
    if uid.is_empty() {
        return Err(AppError::Msg("a name (or email) is required for a GPG key".into()));
    }
    let algo = if algo == "rsa" { "rsa4096" } else { "ed25519" };

    // `--passphrase-fd 0` + loopback pinentry reads the passphrase from stdin,
    // so it never appears in argv. `sign never` → a sign-only, non-expiring key.
    let mut child = Command::new("gpg")
        .hide_console()
        .args([
            "--batch",
            "--pinentry-mode",
            "loopback",
            "--passphrase-fd",
            "0",
            "--quick-generate-key",
            &uid,
            algo,
            "sign",
            "never",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Msg(format!("gpg not available: {e}")))?;

    if let Some(mut stdin) = child.stdin.take() {
        // Passphrase then newline; an empty passphrase leaves the key unprotected.
        let _ = stdin.write_all(passphrase.as_bytes());
        let _ = stdin.write_all(b"\n");
    }
    let out = child
        .wait_with_output()
        .map_err(|e| AppError::Msg(format!("gpg: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Msg(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }

    let fpr = gpg_fingerprint(&uid)?;
    Ok(GeneratedKey { kind: "gpg".into(), path: String::new(), public: fpr })
}

/// Newest secret-key fingerprint matching `query` (a uid or email).
fn gpg_fingerprint(query: &str) -> AppResult<String> {
    let out = Command::new("gpg")
        .hide_console()
        .args(["--batch", "--with-colons", "--list-secret-keys", query])
        .output()
        .map_err(|e| AppError::Msg(format!("gpg: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Msg(
            "key generated, but its fingerprint could not be read".into(),
        ));
    }
    // Colon format: the `fpr` record carries the fingerprint in field 10 (index 9).
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .find_map(|l| {
            let fields: Vec<&str> = l.split(':').collect();
            if fields.first() == Some(&"fpr") {
                fields.get(9).copied().filter(|s| !s.is_empty()).map(str::to_string)
            } else {
                None
            }
        })
        .ok_or_else(|| AppError::Msg("key generated, but no fingerprint was found".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_keeps_safe_chars() {
        assert_eq!(sanitize("Work Laptop"), "Work_Laptop");
        assert_eq!(sanitize("a/b:c"), "a_b_c");
        assert_eq!(sanitize("  "), "key");
        assert_eq!(sanitize("ok-name_1"), "ok-name_1");
    }
}
