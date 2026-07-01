# Changelog

All notable changes to GitMage are documented here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/); the project is pre-1.0 and
versions track the milestone roadmap in [`docs/SPEC.md`](docs/SPEC.md) §11.

## [Unreleased]

### Added — UI overhaul, appearance & tooling
- **Explorer sidebar** (GitKraken-style): collapsible, individually resizable
  sections — LOCAL branches foldered by `/` (current marker, ahead/behind,
  double-click checkout, context menu), REMOTE, PULL REQUESTS (with a token),
  STASHES, WORKTREES, SUBMODULES, AGENTS, GITFLOW, LFS — plus a separate
  collapsible **repositories drawer**. Fetch/Pull/Push/Stash moved above the graph.
- **Native window menu** — File / Edit / GitMage (clone, init, open, open in
  VS Code / Terminal / Finder, **close repository**, preferences, check for
  updates).
- **Clone / Init** repositories from the app; **close repository** returns to the
  empty state.
- **Identity profiles** — name/email + signing/SSH-key profiles stored in SQLite,
  applied per-repo or globally.
- **Themes** — dark / light / system, a custom color editor with reset, and an
  interface-scale control.
- **Icon styles** — Lucide ("Modern") or game-icons.net ("Fantasy"); new
  wizard-hat app icon & logo.
- **Create pull/merge requests** from the app (GitHub / GitLab / Bitbucket).
- **Undo** the last commit / checkout (reflog-based, safe) from the palette.
- Profiles are **auto-applied per repo** on open (remembered choice).
- **i18n**: added German, French, Spanish and Chinese (git terms stay English).
- Dismissible agent-intro banner (remembers the choice).
- **CI** workflow (frontend + backend tests, typecheck, build, clippy) and a
  frontend **test harness** (Vitest + Testing Library with Tauri mocked).

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
