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
use crate::supervisor::{AgentSession, Supervisor};
use crate::model::{
    AgentInfo, CommitDetail, DiffSides, GraphRow, Hunk, RebaseCommit, RepoMeta, RepoStatus,
    StashEntry, Worktree,
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
    supervisor.start(&app, &agent.id, &agent.name, &command, &branch, &worktree)
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
pub fn agent_kill(supervisor: State<Supervisor>, id: String) -> AppResult<()> {
    supervisor.kill(&id)
}

#[tauri::command]
pub fn agent_sessions(supervisor: State<Supervisor>) -> Vec<AgentSession> {
    supervisor.list()
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
