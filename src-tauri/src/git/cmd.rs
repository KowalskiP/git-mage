//! Console-window suppression for subprocesses on Windows.
//!
//! GitMage shells out to the `git` CLI constantly (status, graph, branch
//! listing, …) and the filesystem watcher re-runs those on every change. On
//! Windows each console subprocess pops a visible console window unless the
//! `CREATE_NO_WINDOW` creation flag is set — so without this the screen fills
//! with console windows flickering in and out when you open a repository
//! (issue #1). This trait applies the flag on Windows and is a no-op elsewhere.

use std::process::Command;

/// Extension on [`Command`] to hide the Windows console window.
pub trait HideConsole {
    /// Suppress the console window this subprocess would otherwise pop on
    /// Windows. No-op on other platforms. Returns `&mut Self` for chaining.
    fn hide_console(&mut self) -> &mut Self;
}

impl HideConsole for Command {
    fn hide_console(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // winbase.h CREATE_NO_WINDOW — run the child without a console.
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}
