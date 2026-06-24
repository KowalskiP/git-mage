//! Coding-agent auto-detection (SPEC §10.2). The base for agent sessions:
//! detect which agent CLIs are installed so the user can launch one in a worktree.

use crate::model::AgentInfo;

/// Known agents: (id, display name, command).
const AGENTS: &[(&str, &str, &str)] = &[
    ("claude", "Claude Code", "claude"),
    ("codex", "Codex CLI", "codex"),
    ("opencode", "OpenCode", "opencode"),
    ("copilot", "Copilot CLI", "copilot"),
    ("gemini", "Gemini CLI", "gemini"),
];

/// Detect installed agent CLIs by scanning PATH plus the usual user bin dirs
/// (a GUI .app gets a minimal PATH, so we augment it).
pub fn detect_agents() -> Vec<AgentInfo> {
    let dirs = search_dirs();
    AGENTS
        .iter()
        .map(|(id, name, command)| {
            let path = resolve(command, &dirs);
            AgentInfo {
                id: id.to_string(),
                name: name.to_string(),
                command: command.to_string(),
                available: path.is_some(),
                path,
            }
        })
        .collect()
}

fn search_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    if let Some(home) = std::env::var_os("HOME").map(std::path::PathBuf::from) {
        for sub in [".local/bin", ".cargo/bin", ".bun/bin", ".deno/bin", ".npm-global/bin"] {
            dirs.push(home.join(sub));
        }
    }
    for d in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        dirs.push(std::path::PathBuf::from(d));
    }
    dirs
}

fn resolve(command: &str, dirs: &[std::path::PathBuf]) -> Option<String> {
    for dir in dirs {
        let candidate = dir.join(command);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().into_owned());
        }
        #[cfg(windows)]
        for ext in ["exe", "cmd", "bat"] {
            let c = dir.join(format!("{command}.{ext}"));
            if c.is_file() {
                return Some(c.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_known_agents_list() {
        let agents = detect_agents();
        // Always returns the full catalogue with availability flags.
        assert_eq!(agents.len(), AGENTS.len());
        assert!(agents.iter().any(|a| a.id == "claude"));
        // Availability ⇒ a resolved path.
        for a in &agents {
            assert_eq!(a.available, a.path.is_some());
        }
    }
}
