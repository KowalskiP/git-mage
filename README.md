# GitMage

Open-source, fast, lightweight Git client — built on **Tauri 2 + Rust + React**.
A lighter alternative to GitKraken: visual commit graph, full git operations,
interactive rebase, worktrees, embedded terminal, forge integrations, and
**orchestration of external AI coding agents** (Claude Code, Codex, OpenCode, …)
in isolated worktrees.

No cloud. No built-in AI API calls. No paywall. No telemetry.

> Full product spec: [`docs/SPEC.md`](docs/SPEC.md).

## Features

- **Commit graph** — Rust lane-layout + virtualized canvas, with a working-copy
  (WIP) node and rich commit detail.
- **Working copy** — stage/unstage by file, hunk or line; commit & amend;
  side-by-side / inline diffs (CodeMirror).
- **Branches & operations** — create/checkout/rename/delete, tags,
  fetch/pull/push, merge, rebase, cherry-pick, revert, reset.
- **Interactive rebase** — drag-and-drop todo editor.
- **Conflicts** — 3-way merge editor + external difftool/mergetool.
- **Worktrees** — create, list, remove (optionally with its branch).
- **Agent sessions** *(flagship)* — run a coding-agent CLI inside a dedicated
  worktree in an embedded pty terminal, with live status from hooks and a
  dashboard.
- **Embedded terminal** — multiple shell sessions in a dockable panel.
- **Command palette** — `⌘K` fuzzy finder over actions, branches and repos.
- **Submodules · LFS · signing · gitflow** — status & ops for each.
- **Forge integrations** — GitHub / GitLab / Bitbucket pull/merge requests and
  issues; personal access tokens stored in the **system keychain**.
- **Keyboard shortcuts** — editable keymap with a shortcuts panel.
- **i18n** — English & Russian, with a language switcher.

## Stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2 |
| Backend | Rust (tokio) |
| Git (read / graph) | gitoxide (`gix`) + system `git` |
| Git (write / network / rebase / hooks) | system `git` |
| Terminals & agents | `portable-pty` + `@xterm/xterm` |
| Forge APIs | `reqwest` |
| Secrets | system keychain (`keyring`) |
| Frontend | React 18 + TypeScript + Zustand |
| Storage | SQLite (`rusqlite`, WAL) + TOML config |

## Prerequisites

- **Node.js** ≥ 18 and npm
- **Rust** (stable) — install via [rustup](https://rustup.rs)
- **git** and (optional) **git-lfs** on `PATH`
- Platform deps for Tauri 2 — see https://v2.tauri.app/start/prerequisites/
  (macOS: Xcode Command Line Tools)

## Develop

```sh
npm install
npm run app:dev      # launch the app (Vite + Tauri, hot reload)
```

## Build

```sh
npm run app:build    # produces a .app / .dmg (macOS) under src-tauri/target/release/bundle
```

### Code signing & notarization (macOS release)

Distribution builds should be signed and notarized with your own Apple
Developer credentials (the dev build is ad-hoc signed). Set the signing
identity and notarization secrets as environment variables before
`npm run app:build`:

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"   # https://appleid.apple.com
export APPLE_TEAM_ID="TEAMID"
```

See https://v2.tauri.app/distribute/sign/macos/ for the full flow. Until a
distribution build is signed, keychain-backed features (forge tokens, signed
commits) may prompt or be restricted under the ad-hoc signature.

## Roadmap

M0–M7 are implemented (scaffold → graph → git ops → rebase/conflicts →
worktrees & agents → terminal/palette/submodules/LFS/gitflow/signing → forge
integrations → polish). See [`docs/SPEC.md`](docs/SPEC.md) §11.

## License

[GPL-3.0-or-later](LICENSE). Copyleft — forks and redistributions must stay open source.
