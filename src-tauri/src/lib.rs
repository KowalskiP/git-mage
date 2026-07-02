mod agents;
mod db;
mod error;
mod forge;
mod git;
mod ipc;
mod model;
mod supervisor;
mod terminal;
mod watcher;

#[cfg(desktop)]
mod menu;

use db::Db;
use supervisor::Supervisor;
use terminal::Terminals;
use tauri::Manager;
use watcher::Watchers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());
    // Auto-update + relaunch are desktop-only (GitHub Releases endpoint).
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .menu(menu::build)
            .on_menu_event(menu::on_event);
    }
    builder
        .manage(Watchers::default())
        .manage(Supervisor::default())
        .manage(Terminals::default())
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
            ipc::commands::branch_list,
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
            ipc::commands::remote_list,
            ipc::commands::remote_add,
            ipc::commands::remote_remove,
            ipc::commands::remote_rename,
            ipc::commands::remote_set_url,
            ipc::commands::cherry_pick,
            ipc::commands::revert,
            ipc::commands::reset,
            ipc::commands::sequencer_continue,
            ipc::commands::sequencer_abort,
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
            ipc::commands::terminal_open,
            ipc::commands::terminal_write,
            ipc::commands::terminal_resize,
            ipc::commands::terminal_kill,
            ipc::commands::terminal_list,
            ipc::commands::terminal_buffer,
            ipc::commands::submodule_list,
            ipc::commands::submodule_update,
            ipc::commands::submodule_sync,
            ipc::commands::lfs_status,
            ipc::commands::lfs_pull,
            ipc::commands::lfs_track,
            ipc::commands::lfs_lock,
            ipc::commands::lfs_unlock,
            ipc::commands::signing_config,
            ipc::commands::set_signing,
            ipc::commands::gitflow_status,
            ipc::commands::gitflow_init,
            ipc::commands::gitflow_start,
            ipc::commands::gitflow_finish,
            ipc::commands::forge_detect,
            ipc::commands::forge_set_token,
            ipc::commands::forge_clear_token,
            ipc::commands::forge_pulls,
            ipc::commands::forge_issues,
            ipc::commands::forge_create_pull,
            ipc::commands::open_external,
            ipc::commands::open_in,
            ipc::commands::clone_repo,
            ipc::commands::init_repo,
            ipc::commands::profiles_list,
            ipc::commands::profile_save,
            ipc::commands::profile_delete,
            ipc::commands::profile_apply,
            ipc::commands::repo_identity,
            ipc::commands::last_action,
            ipc::commands::undo,
            ipc::commands::file_history,
            ipc::commands::blame,
            ipc::commands::tag_list,
            ipc::commands::branch_delete_remote,
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
