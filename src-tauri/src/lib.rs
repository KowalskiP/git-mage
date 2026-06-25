mod agents;
mod db;
mod error;
mod git;
mod ipc;
mod model;
mod supervisor;
mod watcher;

use db::Db;
use supervisor::Supervisor;
use tauri::Manager;
use watcher::Watchers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Watchers::default())
        .manage(Supervisor::default())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = Db::open(&dir.join("gitmage.sqlite"))?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::commands::list_repos,
            ipc::commands::open_repo,
            ipc::commands::remove_repo,
            ipc::commands::set_favorite,
            ipc::commands::repo_status,
            ipc::commands::graph_load,
            ipc::commands::commit_detail,
            ipc::commands::commit_diff,
            ipc::commands::wip_diff,
            ipc::commands::diff_sides,
            ipc::commands::file_hunks,
            ipc::commands::apply_hunk,
            ipc::commands::stage,
            ipc::commands::unstage,
            ipc::commands::stage_all,
            ipc::commands::unstage_all,
            ipc::commands::commit,
            ipc::commands::list_branches,
            ipc::commands::checkout,
            ipc::commands::create_branch,
            ipc::commands::fetch,
            ipc::commands::pull,
            ipc::commands::push,
            ipc::commands::merge,
            ipc::commands::create_branch_at,
            ipc::commands::branch_delete,
            ipc::commands::branch_rename,
            ipc::commands::tag_create,
            ipc::commands::tag_delete,
            ipc::commands::resolve_conflict,
            ipc::commands::launch_difftool,
            ipc::commands::launch_mergetool,
            ipc::commands::conflict_content,
            ipc::commands::write_resolution,
            ipc::commands::merge_continue,
            ipc::commands::merge_abort,
            ipc::commands::rebase,
            ipc::commands::rebase_continue,
            ipc::commands::rebase_abort,
            ipc::commands::rebase_todo_commits,
            ipc::commands::rebase_interactive,
            ipc::commands::get_setting,
            ipc::commands::set_setting,
            ipc::commands::detect_agents,
            ipc::commands::new_agent_session,
            ipc::commands::agent_write,
            ipc::commands::agent_resize,
            ipc::commands::agent_kill,
            ipc::commands::agent_sessions,
            ipc::commands::agent_buffer,
            ipc::commands::submodule_list,
            ipc::commands::submodule_update,
            ipc::commands::submodule_sync,
            ipc::commands::worktree_list,
            ipc::commands::worktree_add,
            ipc::commands::worktree_remove,
            ipc::commands::worktree_lock,
            ipc::commands::worktree_prune,
            ipc::commands::stash_list,
            ipc::commands::stash_save,
            ipc::commands::stash_apply,
            ipc::commands::stash_pop,
            ipc::commands::stash_drop,
            ipc::commands::watch_repo,
            ipc::commands::unwatch_repo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GitMage");
}
