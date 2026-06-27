//! Tauri command surface (SPEC §5.3). Thin wrappers; logic lives in db/git/watcher.
//!
//! Git-backed commands are `async` so Tauri runs them on the async runtime
//! instead of the main thread — a blocking git call (e.g. `fetch`/`pull`/`push`
//! doing network I/O) must never freeze the UI. The fast local-DB and watcher
//! commands stay synchronous.

use tauri::{AppHandle, State};

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::git;
use crate::agents;
use crate::supervisor::{self, AgentSession, Supervisor};
use crate::terminal::{TermSession, Terminals};
use crate::forge::{self, Provider};
use crate::model::{
    AgentInfo, CommitDetail, DiffSides, ForgeInfo, ForgeIssue, ForgePull, GitflowConfig, GraphRow,
    Hunk, LfsStatus, RebaseCommit, RepoMeta, RepoStatus, SigningConfig, StashEntry, Submodule,
    Worktree,
};
use crate::watcher::{self, Watchers};

#[tauri::command]
pub fn list_repos(db: State<Db>) -> AppResult<Vec<RepoMeta>> {
    db.list()
}

#[tauri::command]
pub fn open_repo(path: String, db: State<Db>) -> AppResult<RepoMeta> {
    git::validate(&path)?;
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repo")
        .to_string();
    db.add_or_touch(&path, &name)
}

#[tauri::command]
pub fn remove_repo(id: i64, db: State<Db>) -> AppResult<()> {
    db.remove(id)
}

#[tauri::command]
pub fn set_favorite(id: i64, favorite: bool, db: State<Db>) -> AppResult<()> {
    db.set_favorite(id, favorite)
}

#[tauri::command]
pub async fn repo_status(path: String) -> AppResult<RepoStatus> {
    git::status(&path)
}

#[tauri::command]
pub async fn graph_load(path: String, limit: Option<usize>) -> AppResult<Vec<GraphRow>> {
    git::graph(&path, limit.unwrap_or(2000))
}

#[tauri::command]
pub async fn commit_detail(path: String, sha: String) -> AppResult<CommitDetail> {
    git::commit_detail(&path, &sha)
}

#[tauri::command]
pub async fn commit_diff(path: String, sha: String, file: String) -> AppResult<String> {
    git::commit_diff(&path, &sha, &file)
}

#[tauri::command]
pub async fn wip_diff(path: String, file: String) -> AppResult<String> {
    git::wip_diff(&path, &file)
}

#[tauri::command]
pub async fn diff_sides(path: String, sha: String, file: String) -> AppResult<DiffSides> {
    git::diff_sides(&path, &sha, &file)
}

#[tauri::command]
pub async fn file_hunks(path: String, file: String, staged: bool) -> AppResult<Vec<Hunk>> {
    git::file_hunks(&path, &file, staged)
}

#[tauri::command]
pub async fn apply_hunk(path: String, patch: String, reverse: bool) -> AppResult<()> {
    git::apply_hunk(&path, &patch, reverse)
}

#[tauri::command]
pub async fn stage(path: String, files: Vec<String>) -> AppResult<()> {
    git::stage(&path, &files)
}

#[tauri::command]
pub async fn unstage(path: String, files: Vec<String>) -> AppResult<()> {
    git::unstage(&path, &files)
}

#[tauri::command]
pub async fn stage_all(path: String) -> AppResult<()> {
    git::stage_all(&path)
}

#[tauri::command]
pub async fn unstage_all(path: String) -> AppResult<()> {
    git::unstage_all(&path)
}

#[tauri::command]
pub async fn commit(path: String, message: String, amend: bool) -> AppResult<()> {
    git::commit(&path, &message, amend)
}

#[tauri::command]
pub async fn list_branches(path: String) -> AppResult<Vec<String>> {
    git::list_branches(&path)
}

#[tauri::command]
pub async fn checkout(path: String, refname: String) -> AppResult<()> {
    git::checkout(&path, &refname)
}

#[tauri::command]
pub async fn create_branch(path: String, name: String, checkout: bool) -> AppResult<()> {
    git::create_branch(&path, &name, checkout)
}

#[tauri::command]
pub async fn fetch(path: String) -> AppResult<()> {
    git::fetch(&path)
}

#[tauri::command]
pub async fn pull(path: String) -> AppResult<()> {
    git::pull(&path)
}

#[tauri::command]
pub async fn push(path: String) -> AppResult<()> {
    git::push(&path)
}

#[tauri::command]
pub async fn merge(path: String, refname: String) -> AppResult<()> {
    git::merge(&path, &refname)
}

#[tauri::command]
pub async fn create_branch_at(
    path: String,
    name: String,
    at: String,
    checkout: bool,
) -> AppResult<()> {
    git::create_branch_at(&path, &name, &at, checkout)
}

#[tauri::command]
pub async fn branch_delete(path: String, name: String, force: bool) -> AppResult<()> {
    git::branch_delete(&path, &name, force)
}

#[tauri::command]
pub async fn branch_rename(path: String, old: String, new: String) -> AppResult<()> {
    git::branch_rename(&path, &old, &new)
}

#[tauri::command]
pub async fn tag_create(path: String, name: String, at: String) -> AppResult<()> {
    git::tag_create(&path, &name, &at)
}

#[tauri::command]
pub async fn tag_delete(path: String, name: String) -> AppResult<()> {
    git::tag_delete(&path, &name)
}

#[tauri::command]
pub async fn resolve_conflict(path: String, file: String, ours: bool) -> AppResult<()> {
    git::resolve_side(&path, &file, ours)
}

#[tauri::command]
pub async fn launch_difftool(path: String, file: String) -> AppResult<()> {
    git::launch_difftool(&path, &file)
}

#[tauri::command]
pub async fn launch_mergetool(path: String, file: String) -> AppResult<()> {
    git::launch_mergetool(&path, &file)
}

#[tauri::command]
pub async fn conflict_content(path: String, file: String) -> AppResult<String> {
    git::conflict_content(&path, &file)
}

#[tauri::command]
pub async fn write_resolution(path: String, file: String, content: String) -> AppResult<()> {
    git::write_resolution(&path, &file, &content)
}

#[tauri::command]
pub async fn merge_continue(path: String) -> AppResult<()> {
    git::merge_continue(&path)
}

#[tauri::command]
pub async fn merge_abort(path: String) -> AppResult<()> {
    git::merge_abort(&path)
}

#[tauri::command]
pub async fn cherry_pick(path: String, sha: String) -> AppResult<()> {
    git::cherry_pick(&path, &sha)
}

#[tauri::command]
pub async fn revert(path: String, sha: String) -> AppResult<()> {
    git::revert(&path, &sha)
}

#[tauri::command]
pub async fn reset(path: String, target: String, mode: String) -> AppResult<()> {
    git::reset(&path, &target, &mode)
}

#[tauri::command]
pub async fn sequencer_continue(path: String, kind: String) -> AppResult<()> {
    git::sequencer_continue(&path, &kind)
}

#[tauri::command]
pub async fn sequencer_abort(path: String, kind: String) -> AppResult<()> {
    git::sequencer_abort(&path, &kind)
}

#[tauri::command]
pub async fn rebase(path: String, onto: String) -> AppResult<()> {
    git::rebase(&path, &onto)
}

#[tauri::command]
pub async fn rebase_continue(path: String) -> AppResult<()> {
    git::rebase_continue(&path)
}

#[tauri::command]
pub async fn rebase_abort(path: String) -> AppResult<()> {
    git::rebase_abort(&path)
}

#[tauri::command]
pub async fn rebase_todo_commits(path: String, base: String) -> AppResult<Vec<RebaseCommit>> {
    git::rebase_todo_commits(&path, &base)
}

#[tauri::command]
pub async fn rebase_interactive(path: String, base: String, todo: String) -> AppResult<()> {
    git::rebase_interactive(&path, &base, &todo)
}

#[tauri::command]
pub fn detect_agents() -> Vec<AgentInfo> {
    agents::detect_agents()
}

#[tauri::command]
pub fn new_agent_session(
    app: AppHandle,
    supervisor: State<Supervisor>,
    db: State<Db>,
    path: String,
    agent_id: String,
    branch: String,
) -> AppResult<AgentSession> {
    let agent = agents::detect_agents()
        .into_iter()
        .find(|a| a.id == agent_id && a.available)
        .ok_or_else(|| AppError::Msg(format!("agent '{agent_id}' not available")))?;
    let command = agent.path.clone().unwrap_or_else(|| agent.command.clone());
    let worktree = git::worktree_add(&path, &branch, true)?;

    // Claude Code: inject status hooks via --settings so the UI gets live status.
    let mut args: Vec<String> = Vec::new();
    let mut status_file: Option<String> = None;
    if agent.id == "claude" {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir();
        let sf = dir.join(format!("gitmage-agent-{stamp}.status"));
        let settings = dir.join(format!("gitmage-agent-{stamp}.settings.json"));
        let sf_str = sf.to_string_lossy().into_owned();
        std::fs::write(&settings, supervisor::claude_hooks_settings(&sf_str))
            .map_err(|e| AppError::Msg(format!("write settings: {e}")))?;
        args.push("--settings".into());
        args.push(settings.to_string_lossy().into_owned());
        status_file = Some(sf_str);
    }

    // Optional setup commands (Preferences > Agents): run them in the new worktree
    // before the agent by wrapping the spawn in a shell script that execs the agent.
    let setup = db.get_setting("agent.setup")?.unwrap_or_default();
    let setup_lines: Vec<&str> = setup
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .collect();

    let (command, args) = if setup_lines.is_empty() {
        (command, args)
    } else {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let script = std::env::temp_dir().join(format!("gitmage-setup-{stamp}.sh"));
        let body = format!("#!/bin/sh\nset -e\n{}\nexec \"$@\"\n", setup_lines.join("\n"));
        std::fs::write(&script, body).map_err(|e| AppError::Msg(format!("write setup: {e}")))?;
        let mut wrapped = vec![script.to_string_lossy().into_owned(), command];
        wrapped.extend(args);
        ("sh".to_string(), wrapped)
    };

    let session = supervisor.start(
        &app,
        &agent.id,
        &agent.name,
        &command,
        &args,
        &branch,
        &worktree,
        status_file.as_deref(),
    )?;

    // Persist so the session is still listed after an app restart.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let _ = db.save_session(&session, now);
    Ok(session)
}

#[tauri::command]
pub fn get_setting(db: State<Db>, key: String) -> AppResult<Option<String>> {
    db.get_setting(&key)
}

#[tauri::command]
pub fn set_setting(db: State<Db>, key: String, value: String) -> AppResult<()> {
    db.set_setting(&key, &value)
}

#[tauri::command]
pub fn agent_write(supervisor: State<Supervisor>, id: String, data: String) -> AppResult<()> {
    supervisor.write(&id, &data)
}

#[tauri::command]
pub fn agent_resize(
    supervisor: State<Supervisor>,
    id: String,
    rows: u16,
    cols: u16,
) -> AppResult<()> {
    supervisor.resize(&id, rows, cols)
}

#[tauri::command]
pub fn agent_kill(supervisor: State<Supervisor>, db: State<Db>, id: String) -> AppResult<()> {
    supervisor.kill(&id)?;
    // Killing (or removing an already-exited entry) drops it from persistence.
    let _ = db.delete_session(&id);
    Ok(())
}

#[tauri::command]
pub fn agent_sessions(supervisor: State<Supervisor>, db: State<Db>) -> AppResult<Vec<AgentSession>> {
    let live = supervisor.list();
    let live_ids: std::collections::HashSet<String> = live.iter().map(|s| s.id.clone()).collect();
    let mut out = live;
    // Persisted sessions not currently running (e.g. after a restart) → exited.
    for s in db.list_sessions()? {
        if !live_ids.contains(&s.id) {
            out.push(s);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn agent_buffer(supervisor: State<Supervisor>, id: String) -> String {
    supervisor.buffer(&id)
}

#[tauri::command]
pub fn terminal_open(
    terminals: State<Terminals>,
    app: AppHandle,
    cwd: String,
    title: String,
) -> AppResult<TermSession> {
    terminals.open(&app, &cwd, &title)
}

#[tauri::command]
pub fn terminal_write(terminals: State<Terminals>, id: String, data: String) -> AppResult<()> {
    terminals.write(&id, &data)
}

#[tauri::command]
pub fn terminal_resize(
    terminals: State<Terminals>,
    id: String,
    rows: u16,
    cols: u16,
) -> AppResult<()> {
    terminals.resize(&id, rows, cols)
}

#[tauri::command]
pub fn terminal_kill(terminals: State<Terminals>, id: String) -> AppResult<()> {
    terminals.kill(&id)
}

#[tauri::command]
pub fn terminal_list(terminals: State<Terminals>) -> Vec<TermSession> {
    terminals.list()
}

#[tauri::command]
pub fn terminal_buffer(terminals: State<Terminals>, id: String) -> String {
    terminals.buffer(&id)
}

#[tauri::command]
pub async fn submodule_list(path: String) -> AppResult<Vec<Submodule>> {
    git::submodule_list(&path)
}

#[tauri::command]
pub async fn submodule_update(path: String, sub: Option<String>, init: bool) -> AppResult<()> {
    git::submodule_update(&path, sub.as_deref(), init)
}

#[tauri::command]
pub async fn submodule_sync(path: String) -> AppResult<()> {
    git::submodule_sync(&path)
}

#[tauri::command]
pub async fn lfs_status(path: String) -> AppResult<LfsStatus> {
    git::lfs_status(&path)
}

#[tauri::command]
pub async fn lfs_pull(path: String) -> AppResult<()> {
    git::lfs_pull(&path)
}

#[tauri::command]
pub async fn lfs_track(path: String, pattern: String) -> AppResult<()> {
    git::lfs_track(&path, &pattern)
}

#[tauri::command]
pub async fn lfs_lock(path: String, file: String) -> AppResult<()> {
    git::lfs_lock(&path, &file)
}

#[tauri::command]
pub async fn lfs_unlock(path: String, file: String) -> AppResult<()> {
    git::lfs_unlock(&path, &file)
}

#[tauri::command]
pub async fn signing_config(path: String) -> AppResult<SigningConfig> {
    git::signing_config(&path)
}

#[tauri::command]
pub async fn set_signing(
    path: String,
    sign: bool,
    format: String,
    key: String,
) -> AppResult<()> {
    git::set_signing(&path, sign, &format, &key)
}

#[tauri::command]
pub async fn gitflow_status(path: String) -> AppResult<GitflowConfig> {
    git::gitflow_status(&path)
}

#[tauri::command]
pub async fn gitflow_init(path: String) -> AppResult<()> {
    git::gitflow_init(&path)
}

#[tauri::command]
pub async fn gitflow_start(path: String, kind: String, name: String) -> AppResult<()> {
    git::gitflow_start(&path, &kind, &name)
}

#[tauri::command]
pub async fn gitflow_finish(path: String, kind: String, name: String) -> AppResult<()> {
    git::gitflow_finish(&path, &kind, &name)
}

#[tauri::command]
pub async fn forge_detect(path: String) -> AppResult<ForgeInfo> {
    Ok(forge::detect(&path))
}

#[tauri::command]
pub async fn forge_set_token(provider: String, token: String) -> AppResult<()> {
    let p = Provider::from_key(&provider).ok_or_else(|| AppError::Msg("unknown provider".into()))?;
    forge::set_token(p, &token)
}

#[tauri::command]
pub async fn forge_clear_token(provider: String) -> AppResult<()> {
    let p = Provider::from_key(&provider).ok_or_else(|| AppError::Msg("unknown provider".into()))?;
    forge::clear_token(p)
}

fn forge_token(rr: &forge::RepoRef) -> AppResult<String> {
    forge::get_token(rr.provider)
        .ok_or_else(|| AppError::Msg("no token for this provider — add one in the forge panel".into()))
}

#[tauri::command]
pub async fn forge_pulls(path: String) -> AppResult<Vec<ForgePull>> {
    let rr = forge::require_ref(&path)?;
    let token = forge_token(&rr)?;
    forge::fetch_pulls(&rr, &token).await
}

#[tauri::command]
pub async fn forge_issues(path: String) -> AppResult<Vec<ForgeIssue>> {
    let rr = forge::require_ref(&path)?;
    let token = forge_token(&rr)?;
    forge::fetch_issues(&rr, &token).await
}

/// Open a URL in the user's default browser (used for PR/issue links).
#[tauri::command]
pub async fn open_external(url: String) -> AppResult<()> {
    // Only follow web links; never shell-execute arbitrary schemes.
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(AppError::Msg("refusing to open non-http URL".into()));
    }
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", ""]);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = std::process::Command::new("xdg-open");

    cmd.arg(&url);
    cmd.spawn().map_err(|e| AppError::Msg(format!("open: {e}")))?;
    Ok(())
}

#[tauri::command]
pub async fn worktree_list(path: String) -> AppResult<Vec<Worktree>> {
    git::worktree_list(&path)
}

#[tauri::command]
pub async fn worktree_add(path: String, name: String, create: bool) -> AppResult<String> {
    git::worktree_add(&path, &name, create)
}

#[tauri::command]
pub async fn worktree_remove(path: String, wt_path: String, force: bool) -> AppResult<()> {
    git::worktree_remove(&path, &wt_path, force)
}

#[tauri::command]
pub async fn worktree_lock(path: String, wt_path: String, lock: bool) -> AppResult<()> {
    git::worktree_lock(&path, &wt_path, lock)
}

#[tauri::command]
pub async fn worktree_prune(path: String) -> AppResult<()> {
    git::worktree_prune(&path)
}

#[tauri::command]
pub async fn stash_list(path: String) -> AppResult<Vec<StashEntry>> {
    git::stash_list(&path)
}

#[tauri::command]
pub async fn stash_save(path: String, message: Option<String>, untracked: bool) -> AppResult<()> {
    git::stash_save(&path, message.as_deref(), untracked)
}

#[tauri::command]
pub async fn stash_apply(path: String, id: String) -> AppResult<()> {
    git::stash_apply(&path, &id)
}

#[tauri::command]
pub async fn stash_pop(path: String, id: String) -> AppResult<()> {
    git::stash_pop(&path, &id)
}

#[tauri::command]
pub async fn stash_drop(path: String, id: String) -> AppResult<()> {
    git::stash_drop(&path, &id)
}

#[tauri::command]
pub fn watch_repo(path: String, app: AppHandle, watchers: State<Watchers>) -> AppResult<()> {
    watcher::watch(&app, &watchers, &path)
}

#[tauri::command]
pub fn unwatch_repo(path: String, watchers: State<Watchers>) -> AppResult<()> {
    watcher::unwatch(&watchers, &path);
    Ok(())
}
