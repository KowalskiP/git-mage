# Changelog

All notable changes to GitMage are documented here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/); the project is pre-1.0 and
versions track the milestone roadmap in [`docs/SPEC.md`](docs/SPEC.md) §11.

## [Unreleased]

### Added — M7 (polish)
- Unified **Settings** panel (language, commit signing, shortcuts launcher).
- Consolidated **Repo** menu folding Stashes / Worktrees / Submodules / LFS /
  Gitflow into one accordion; decluttered toolbar.
- **Error toasts** + top **progress bar**; empty-state "Open repository" CTA.
- Sidebar **search**, Favorites/Recent grouping and per-repo path subtitles.
- Shape-distinct **status glyphs** (not colour alone) for submodule/LFS state.
- **i18n** foundation with English & Russian and a language switcher.

### Added — M6 (forge integrations)
- Detect GitHub / GitLab / Bitbucket from the repo remote.
- Browse open **pull/merge requests** and **issues**; open items in the browser.
- Personal access tokens stored in the **system keychain** (never in the DB).

### Added — M5
- Embedded **terminal** (multi-session pty), **command palette** (`⌘K`),
  **submodules**, **Git LFS**, **commit signing** (GPG/SSH), **gitflow**, and an
  editable **keyboard-shortcuts** keymap + panel.

### Added — M4 (worktrees & agents)
- Worktree management and **agent sessions**: run coding-agent CLIs in isolated
  worktrees with a pty terminal, hook-driven status and a dashboard.

### Added — M3
- Drag-and-drop **interactive rebase**, 3-way **merge/conflict** editor and
  external diff/merge tools.

### Added — M2
- Branches (create/checkout/rename/delete), tags, fetch/pull/push, merge,
  rebase, cherry-pick, revert, reset.

### Added — M1
- Commit **graph** (Rust lane layout + canvas + virtualization), WIP node,
  stage hunk/line, commit/amend, CodeMirror diffs.

### Added — M0
- Tauri 2 + React + Rust skeleton, SQLite repo registry, status, filesystem
  watcher, settings and themes.
