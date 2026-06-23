# GitMage

Open-source, fast, lightweight Git client — built on **Tauri 2 + Rust + React**.
A lighter alternative to GitKraken: visual commit graph, full git operations,
interactive rebase, worktrees, embedded terminal, and **orchestration of external
AI coding agents** (Claude Code, Codex, OpenCode, …) in isolated worktrees.

No cloud. No built-in AI API calls. No paywall. No telemetry.

> Full product spec: [`docs/SPEC.md`](docs/SPEC.md).

## Status

**M0 — scaffold.** Implemented so far:

- Tauri 2 + React + Rust skeleton with typed IPC (commands + events).
- Repository registry in **SQLite** (`rusqlite`, WAL).
- Open a repository (native folder picker), list / favorite / remove repos.
- Working-copy **status** (branch + staged / unstaged / untracked).
- Filesystem **watcher** (`notify`) emitting `repo:fs-change` → live status refresh.

See `docs/SPEC.md` §11 for the milestone roadmap (M1 graph, M2 git ops, … M4 agent sessions).

## Stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2 |
| Backend | Rust (tokio) |
| Git (read) | gitoxide (`gix`) |
| Git (write) | git2-rs *(M1+)* |
| Git (network/rebase/hooks) | system `git` |
| Frontend | React 18 + TypeScript |
| State | Zustand |
| Storage | SQLite + TOML config |

## Prerequisites

- **Node.js** ≥ 18 and npm
- **Rust** (stable) — install via [rustup](https://rustup.rs)
- Platform deps for Tauri 2 — see https://v2.tauri.app/start/prerequisites/
  (macOS: Xcode Command Line Tools)

## Develop

```sh
npm install
npm run tauri icon app-icon.png   # one-time: generate app icons from the placeholder
npm run app:dev                   # launch the app (Vite + Tauri)
```

## Build

```sh
npm run app:build
```

## License

[GPL-3.0-or-later](LICENSE). Copyleft — forks and redistributions must stay open source.
