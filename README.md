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
  (WIP) node and rich commit detail; **append-only pagination** streams deep
  history as you scroll (each page resumes the lane layout, no re-fetch).
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
- **Forge integrations** — GitHub / GitLab / Bitbucket: browse **and create**
  pull/merge requests, browse issues; tokens in the **system keychain**.
- **Keyboard shortcuts** — editable keymap with a shortcuts panel.
- **i18n** — full UI in English, Russian, German, French, Spanish and Chinese,
  with a language switcher (git terms stay in English).
- **Explorer sidebar** — GitKraken-style collapsible, resizable sections (local
  branches foldered by `/`, remotes, pull requests, stashes, worktrees,
  submodules, gitflow, LFS, agents) + a separate collapsible repositories drawer.
- **Native window menu** — File / Edit / GitMage: clone, init, open, open in
  VS Code / Terminal / Finder, close repository, preferences, check for updates.
- **Identity profiles** — reusable name/email + signing/SSH-key profiles, applied
  per-repo (local config) or globally, and **auto-applied** when a repo re-opens.
- **Undo** — reflog-based undo of the last commit / checkout (command palette).
- **File history & blame** — from the diff header: list a file's commits (jump to
  one in the graph) or view line-by-line blame at any revision.
- **Graph drag-and-drop** — drag a branch onto another branch or commit to merge,
  rebase, reset or cherry-pick, with a drop-target highlight.
- **Themes** — dark / light / system, a custom **color editor** with reset, and an
  **interface-scale** control.
- **Icon styles** — clean **Modern** (Lucide) or a **Fantasy** set (game-icons.net).

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

## Test

```sh
npm test                       # frontend unit + integration (Vitest + Testing Library)
( cd src-tauri && cargo test ) # backend (Rust)
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs both suites,
typecheck, the frontend build and `clippy -D warnings` on every push / PR.

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

## Releasing & auto-update

GitMage ships an in-app updater (`tauri-plugin-updater`) that pulls signed
releases from **GitHub Releases** — no Apple account or paid hosting required.
Update integrity is guaranteed by Tauri's own signing key (separate from Apple
code signing).

The updater endpoint in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json)
points at `KowalskiP/git-mage`.

**One-time setup (on a fork):**

1. In [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json), point
   `plugins.updater.endpoints` at your own GitHub `owner/repo`.
2. Generate an updater keypair (if you don't reuse the bundled public key):
   ```sh
   npm run tauri signer generate -- -w ~/.gitmage/updater.key
   ```
   Put the **public** key in `plugins.updater.pubkey`. Add the **private** key
   contents as the repo secret `TAURI_SIGNING_PRIVATE_KEY` (and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if you set one).

**Cutting a release:**

1. Bump `version` in `package.json` and `src-tauri/tauri.conf.json`.
2. Tag and push: `git tag v0.2.0 && git push --tags`.
3. The [`release`](.github/workflows/release.yml) workflow builds the macOS
   bundles (aarch64 + x86_64), signs them, and drafts a GitHub release with the
   artifacts **and** `latest.json`. Publish the draft — running apps then see the
   update on next launch.

**Local signed build** (since `createUpdaterArtifacts` is enabled):

```sh
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.gitmage/updater.key)" npm run app:build
```

**Gatekeeper note (unsigned distribution):** without an Apple Developer ID the
downloaded `.dmg` is unsigned, so on first launch macOS blocks it — users
right-click → **Open** once (or `xattr -dr com.apple.quarantine
/Applications/GitMage.app`). Auto-updates replace the bundle in place and aren't
re-quarantined, so they apply without further prompts.

## Roadmap

M0–M7 are implemented (scaffold → graph → git ops → rebase/conflicts →
worktrees & agents → terminal/palette/submodules/LFS/gitflow/signing → forge
integrations → polish), followed by a GitKraken-style UI pass (explorer sidebar,
native menu, profiles, theming & icons). See [`docs/SPEC.md`](docs/SPEC.md) §11.

Considered next: server-side graph filtering (by branch/author/path) for very
large repositories, and richer diff/blame virtualization for huge files.

## Screenshots

Drop images in `docs/screenshots/` and reference them here. (None are checked in
yet — capture them from a local `npm run app:dev` build.)

## Credits

Bundled icons: **Lucide** (MIT) and **game-icons.net** (CC BY 3.0, incl. the
wizard-hat logo). Full attribution in [`CREDITS.md`](CREDITS.md).

## License

[GPL-3.0-or-later](LICENSE). Copyleft — forks and redistributions must stay open source.
