//! Embedded general-purpose terminals (SPEC §M5): spawn the user's login shell
//! in a pty rooted at a repo directory, stream output to the UI, accept input,
//! resize, and kill. Multiple independent sessions can run at once.
//!
//! Mirrors the pty plumbing of `supervisor.rs` but is shell-agnostic and carries
//! no agent/worktree semantics — events use the `term:*` namespace.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TermSession {
    pub id: String,
    pub cwd: String,
    pub title: String,
}

struct Running {
    session: TermSession,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    stop: Arc<AtomicBool>,
    /// Recent raw output (capped) so reopening a session shows scrollback.
    buffer: Arc<Mutex<Vec<u8>>>,
}

const BUFFER_CAP: usize = 256 * 1024;

#[derive(Default)]
pub struct Terminals {
    sessions: Mutex<HashMap<String, Running>>,
}

#[derive(Serialize, Clone)]
struct OutputEvent {
    id: String,
    data: String,
}

/// The user's login shell, falling back to a sensible default per platform.
fn default_shell() -> String {
    if let Ok(sh) = std::env::var("SHELL") {
        if !sh.is_empty() {
            return sh;
        }
    }
    if cfg!(windows) {
        "powershell.exe".into()
    } else {
        "/bin/bash".into()
    }
}

impl Terminals {
    /// Spawn a login shell in a pty with cwd=`cwd`, streaming output via
    /// `term:output` and a `term:exited` event on EOF. `title` is a UI label.
    pub fn open(&self, app: &AppHandle, cwd: &str, title: &str) -> AppResult<TermSession> {
        let pair = native_pty_system()
            .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| AppError::Msg(format!("openpty: {e}")))?;

        let shell = default_shell();
        let mut cmd = CommandBuilder::new(&shell);
        // Login shell on unix so PATH/profile are loaded; harmless basename check.
        if !cfg!(windows) && (shell.ends_with("zsh") || shell.ends_with("bash") || shell.ends_with("sh")) {
            cmd.arg("-l");
        }
        cmd.cwd(cwd);
        // portable-pty starts with an empty env; inherit ours and advertise a tty.
        for (k, v) in std::env::vars() {
            cmd.env(k, v);
        }
        cmd.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Msg(format!("spawn {shell}: {e}")))?;
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Msg(format!("reader: {e}")))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Msg(format!("writer: {e}")))?;

        let id = format!(
            "t{}",
            SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
        );
        let stop = Arc::new(AtomicBool::new(false));
        let buffer = Arc::new(Mutex::new(Vec::<u8>::new()));

        let app2 = app.clone();
        let id2 = id.clone();
        let stop2 = stop.clone();
        let buffer2 = buffer.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        {
                            let mut b = buffer2.lock().unwrap();
                            b.extend_from_slice(&buf[..n]);
                            if b.len() > BUFFER_CAP {
                                let cut = b.len() - BUFFER_CAP;
                                b.drain(..cut);
                            }
                        }
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        let _ = app2.emit("term:output", OutputEvent { id: id2.clone(), data });
                    }
                }
            }
            stop2.store(true, Ordering::Relaxed);
            let _ = app2.emit("term:exited", id2.clone());
        });

        let session = TermSession { id: id.clone(), cwd: cwd.to_string(), title: title.to_string() };
        self.sessions.lock().unwrap().insert(
            id,
            Running { session: session.clone(), child, writer, master: pair.master, stop, buffer },
        );
        Ok(session)
    }

    /// Captured scrollback for a session (to prime the terminal on (re)open).
    pub fn buffer(&self, id: &str) -> String {
        let map = self.sessions.lock().unwrap();
        map.get(id)
            .map(|r| String::from_utf8_lossy(&r.buffer.lock().unwrap()).into_owned())
            .unwrap_or_default()
    }

    pub fn write(&self, id: &str, data: &str) -> AppResult<()> {
        let mut map = self.sessions.lock().unwrap();
        let r = map.get_mut(id).ok_or_else(|| AppError::Msg("no such terminal".into()))?;
        r.writer
            .write_all(data.as_bytes())
            .map_err(|e| AppError::Msg(format!("write: {e}")))?;
        let _ = r.writer.flush();
        Ok(())
    }

    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> AppResult<()> {
        let map = self.sessions.lock().unwrap();
        if let Some(r) = map.get(id) {
            r.master
                .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
                .map_err(|e| AppError::Msg(format!("resize: {e}")))?;
        }
        Ok(())
    }

    pub fn kill(&self, id: &str) -> AppResult<()> {
        if let Some(mut r) = self.sessions.lock().unwrap().remove(id) {
            r.stop.store(true, Ordering::Relaxed);
            let _ = r.child.kill();
        }
        Ok(())
    }

    pub fn list(&self) -> Vec<TermSession> {
        let map = self.sessions.lock().unwrap();
        map.values().map(|r| r.session.clone()).collect()
    }
}
