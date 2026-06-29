//! Native window menu (SPEC §M7). GitKraken-style File / Edit / GitMage menus.
//!
//! Predefined Edit items (undo/redo/cut/copy/paste/select-all) are handled
//! natively against the focused webview field. Custom items emit a `"menu"`
//! event carrying their id; the webview listens and performs the action (open
//! repo, settings, clone, init, open-in-editor/terminal/finder, update check).

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

/// Build the application menu. Wired via `Builder::menu`.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = AboutMetadata {
        name: Some("GitMage".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        ..Default::default()
    };

    let app_menu = Submenu::with_items(
        app,
        "GitMage",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About GitMage"), Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "check_update", "Check for Updates…", true, None::<&str>)?,
            &MenuItem::with_id(app, "settings", "Preferences…", true, Some("CmdOrCtrl+,"))?,
            &MenuItem::with_id(app, "profiles", "Profiles…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "clone", "Clone…", true, None::<&str>)?,
            &MenuItem::with_id(app, "init", "New Repository…", true, None::<&str>)?,
            &MenuItem::with_id(app, "open_repo", "Open Repository…", true, Some("CmdOrCtrl+O"))?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "open_editor", "Open in VS Code", true, None::<&str>)?,
            &MenuItem::with_id(app, "open_terminal", "Open in Terminal", true, None::<&str>)?,
            &MenuItem::with_id(app, "open_finder", "Reveal in Finder", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu])
}

/// Forward custom menu items to the webview. Wired via `Builder::on_menu_event`.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    let id = event.id().0.as_str();
    if matches!(
        id,
        "check_update"
            | "settings"
            | "profiles"
            | "clone"
            | "init"
            | "open_repo"
            | "open_editor"
            | "open_terminal"
            | "open_finder"
    ) {
        let _ = app.emit("menu", id.to_string());
    }
}
