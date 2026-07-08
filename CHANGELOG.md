# Changelog

All notable changes to GitMage are documented here. The format is loosely based
on [Keep a Changelog](https://keepachangelog.com/); the project is pre-1.0 and
versions track the milestone roadmap in [`docs/SPEC.md`](docs/SPEC.md) §11.

## [Unreleased]

## [0.3.1] - 2026-07-08

### Fixed
- **Windows: console windows flashing in and out** when opening a repository
  ([#1](https://github.com/KowalskiP/git-mage/issues/1)). Every `git` subprocess
  (status, graph, branches, …) and the filesystem-watcher refresh now spawn with
  `CREATE_NO_WINDOW`, so no console window pops up. Same fix applied to the
  browser-link and "open in editor" launchers.
- **About dialog showed `0.1.0`** regardless of the actual version — the Rust
  crate version was never bumped; all version numbers are now in sync.

## [0.3.0] - 2026-07-02

### Added
- **Linux builds** — releases now ship a **`.deb`** (Debian/Ubuntu) and a
  universal **AppImage** for x86_64, built on ubuntu-22.04 for broad glibc
  compatibility. The AppImage self-updates via the updater manifest
  (`latest.json` gains a `linux-x86_64` entry); the `.deb` is managed by apt.

## [0.2.0] - 2026-07-02

### Added
- **Windows builds** — releases now ship a Windows **x64 NSIS installer (`.exe`)**
  and an **`.msi`** alongside the macOS bundles, with Windows entries in the
  updater manifest (`latest.json`) so in-app auto-update works on Windows too.

### Changed
- **Native menu is cross-platform.** macOS keeps its conventional app menu;
  Windows/Linux get a **File + Help** layout with the app-level actions
  (Preferences / Profiles / Check for Updates / Exit) folded in, and the
  macOS-only Services / Hide / Show-All items dropped there.
- **Open in editor / terminal / file manager** is implemented on **Windows**
  (VS Code, Explorer, a new terminal) and **Linux** (VS Code, `xdg-open`),
  replacing the previous macOS-only behaviour.

### CI
- Added a **Windows build job** (clippy + release compile) so per-OS breakage is
  caught before a release.

## [0.1.0] - 2026-07-02

First public release — the full M0–M7 milestone set plus the GitKraken-style UI
pass. macOS bundles (aarch64 + x86_64) are attached to this release.

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
- **File history & blame** from the diff header (jump to a commit or blame a rev).
- **Graph drag-and-drop**: drag a branch onto a branch/commit to merge, rebase or
  reset.
- Profiles are **auto-applied per repo** on open (remembered choice).
- **i18n**: added German, French, Spanish and Chinese, and localized the full UI
  chrome across all locales — including interactive-rebase, conflict-editor and
  keyboard-shortcut panels and the keymap action/group labels (git terms stay
  English).
- Dismissible agent-intro banner (remembers the choice).
- **CI** workflow (frontend + backend tests, typecheck, build, clippy) and a
  frontend **test harness** (Vitest + Testing Library with Tauri mocked).

### Performance
- **Commit graph — append-only pagination.** The graph loads a page at a time and
  now *appends* each further page as you scroll, resuming the lane layout from an
  opaque cursor instead of re-fetching and re-laying-out the whole history. Deep
  scrolls stay O(page) per step; scroll position no longer jumps. A backend
  invariant test proves paged assembly is byte-identical to a single full load.

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
