//! Tauri command surface (SPEC §5.3). Thin wrappers; logic lives in db/git/watcher.
//!
//! Git-backed commands are `async` so Tauri runs them on the async runtime
//! instead of the main thread — a blocking git call (e.g. `fetch`/`pull`/`push`
//! doing network I/O) must never freeze the UI. The fast local-DB and watcher
//! commands stay synchronous.

use tauri::{AppHandle, State};

use crate::db::Db;
use crate::error::AppResult;
use crate::git;
use crate::model::{CommitDetail, DiffSides, GraphRow, Hunk, RepoMeta, RepoStatus};
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
pub fn watch_repo(path: String, app: AppHandle, watchers: State<Watchers>) -> AppResult<()> {
    watcher::watch(&app, &watchers, &path)
}

#[tauri::command]
pub fn unwatch_repo(path: String, watchers: State<Watchers>) -> AppResult<()> {
    watcher::unwatch(&watchers, &path);
    Ok(())
}
