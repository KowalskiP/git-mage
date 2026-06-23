mod db;
mod error;
mod git;
mod ipc;
mod model;
mod watcher;

use db::Db;
use tauri::Manager;
use watcher::Watchers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Watchers::default())
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
            ipc::commands::stage,
            ipc::commands::unstage,
            ipc::commands::stage_all,
            ipc::commands::unstage_all,
            ipc::commands::commit,
            ipc::commands::watch_repo,
            ipc::commands::unwatch_repo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GitMage");
}
