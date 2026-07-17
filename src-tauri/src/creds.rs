//! User-entered connection credentials (SPEC §M6, issue: enter passwords for
//! SSH/HTTPS): HTTPS username+password stored per host, and SSH key passphrases
//! stored per key path. Secrets live only in the OS keychain (never SQLite/
//! config), alongside the forge PATs, and are used to authenticate git network
//! operations non-interactively.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::forge::KEYCHAIN_SERVICE;

/// Stored HTTPS credential (serialized into a single keychain secret).
#[derive(Serialize, Deserialize)]
struct HttpsCred {
    username: String,
    password: String,
}

fn entry(account: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, account)
        .map_err(|e| AppError::Msg(format!("keychain: {e}")))
}

fn https_account(host: &str) -> String {
    format!("https:{host}")
}

fn ssh_account(key_path: &str) -> String {
    format!("ssh:{key_path}")
}

/// Store an HTTPS username/password for `host`.
pub fn set_https(host: &str, username: &str, password: &str) -> AppResult<()> {
    let blob = serde_json::to_string(&HttpsCred {
        username: username.to_string(),
        password: password.to_string(),
    })
    .map_err(|e| AppError::Msg(format!("serialize credential: {e}")))?;
    entry(&https_account(host))?
        .set_password(&blob)
        .map_err(|e| AppError::Msg(format!("keychain set: {e}")))
}

/// The stored (username, password) for `host`, or None.
pub fn get_https(host: &str) -> Option<(String, String)> {
    let blob = entry(&https_account(host)).ok()?.get_password().ok()?;
    let c: HttpsCred = serde_json::from_str(&blob).ok()?;
    Some((c.username, c.password))
}

/// The stored username for `host` (without exposing the password to callers).
pub fn https_username(host: &str) -> Option<String> {
    get_https(host).map(|(u, _)| u)
}

pub fn clear_https(host: &str) -> AppResult<()> {
    delete(&https_account(host))
}

/// Store the passphrase for the SSH private key at `key_path`.
pub fn set_ssh_passphrase(key_path: &str, passphrase: &str) -> AppResult<()> {
    entry(&ssh_account(key_path))?
        .set_password(passphrase)
        .map_err(|e| AppError::Msg(format!("keychain set: {e}")))
}

pub fn get_ssh_passphrase(key_path: &str) -> Option<String> {
    entry(&ssh_account(key_path)).ok()?.get_password().ok()
}

pub fn has_ssh_passphrase(key_path: &str) -> bool {
    get_ssh_passphrase(key_path).is_some()
}

pub fn clear_ssh_passphrase(key_path: &str) -> AppResult<()> {
    delete(&ssh_account(key_path))
}

fn delete(account: &str) -> AppResult<()> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Msg(format!("keychain clear: {e}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_keys_are_namespaced() {
        // HTTPS and SSH accounts never collide with each other or forge providers.
        assert_eq!(https_account("github.com"), "https:github.com");
        assert_eq!(ssh_account("/home/u/.ssh/id_ed25519"), "ssh:/home/u/.ssh/id_ed25519");
        assert_ne!(https_account("github"), "github");
    }

    #[test]
    fn https_cred_serializes_round_trip() {
        let blob = serde_json::to_string(&HttpsCred {
            username: "alice".into(),
            password: "s3cr3t".into(),
        })
        .unwrap();
        let c: HttpsCred = serde_json::from_str(&blob).unwrap();
        assert_eq!(c.username, "alice");
        assert_eq!(c.password, "s3cr3t");
    }
}
