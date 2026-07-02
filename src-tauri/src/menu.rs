//! Native window menu (SPEC §M7). GitKraken-style File / Edit / GitMage menus.
//!
//! Predefined Edit items (undo/redo/cut/copy/paste/select-all) are handled
//! natively against the focused webview field. Custom items emit a `"menu"`
//! event carrying their id; the webview listens and performs the action (open
//! repo, settings, clone, init, open-in-editor/terminal/finder, update check).

use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

/// Build the application menu. Wired via `Builder::menu`.
///
/// macOS gets the conventional app menu (About / Services / Hide / Quit under a
/// "GitMage" menu). Windows/Linux have no app-menu convention and don't support
/// the Services/Hide/Show-All predefined items, so those platforms fold the
/// app-level actions into File + a Help menu instead.
// Explicit `return` per cfg branch keeps the two platform arms unambiguous (only
// one is ever compiled); that's clearer here than relying on tail-expr position.
#[allow(clippy::needless_return)]
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about = AboutMetadata {
        name: Some("GitMage".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        ..Default::default()
    };

    // OS-appropriate label for the "reveal folder in the file manager" item.
    let reveal_label = if cfg!(target_os = "windows") {
        "Reveal in Explorer"
    } else if cfg!(target_os = "macos") {
        "Reveal in Finder"
    } else {
        "Reveal in File Manager"
    };

    // Items shared across platforms.
    let clone = MenuItem::with_id(app, "clone", "Clone…", true, None::<&str>)?;
    let init = MenuItem::with_id(app, "init", "New Repository…", true, None::<&str>)?;
    let open_repo = MenuItem::with_id(app, "open_repo", "Open Repository…", true, Some("CmdOrCtrl+O"))?;
    let close_repo = MenuItem::with_id(app, "close_repo", "Close Repository", true, Some("CmdOrCtrl+W"))?;
    let open_editor = MenuItem::with_id(app, "open_editor", "Open in VS Code", true, None::<&str>)?;
    let open_terminal = MenuItem::with_id(app, "open_terminal", "Open in Terminal", true, None::<&str>)?;
    let open_finder = MenuItem::with_id(app, "open_finder", reveal_label, true, None::<&str>)?;
    let check_update = MenuItem::with_id(app, "check_update", "Check for Updates…", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Preferences…", true, Some("CmdOrCtrl+,"))?;
    let profiles = MenuItem::with_id(app, "profiles", "Profiles…", true, None::<&str>)?;

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
        ],
    )?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            "GitMage",
            true,
            &[
                &PredefinedMenuItem::about(app, Some("About GitMage"), Some(about))?,
                &PredefinedMenuItem::separator(app)?,
                &check_update,
                &settings,
                &profiles,
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
                &clone,
                &init,
                &open_repo,
                &close_repo,
                &PredefinedMenuItem::separator(app)?,
                &open_editor,
                &open_terminal,
                &open_finder,
            ],
        )?;
        return Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu]);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let file_menu = Submenu::with_items(
            app,
            "File",
            true,
            &[
                &clone,
                &init,
                &open_repo,
                &close_repo,
                &PredefinedMenuItem::separator(app)?,
                &open_editor,
                &open_terminal,
                &open_finder,
                &PredefinedMenuItem::separator(app)?,
                &settings,
                &profiles,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, Some("Exit"))?,
            ],
        )?;
        let help_menu = Submenu::with_items(
            app,
            "Help",
            true,
            &[
                &check_update,
                &PredefinedMenuItem::about(app, Some("About GitMage"), Some(about))?,
            ],
        )?;
        return Menu::with_items(app, &[&file_menu, &edit_menu, &window_menu, &help_menu]);
    }
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
            | "close_repo"
            | "open_editor"
            | "open_terminal"
            | "open_finder"
    ) {
        let _ = app.emit("menu", id.to_string());
    }
}
