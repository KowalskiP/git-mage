//! Agent supervisor (SPEC §10.6): spawns a coding-agent CLI inside a worktree
//! in a pty, streams its output to the UI, accepts input, resizes, and kills.
//! Agent-agnostic — works for any detected agent; status is alive/exited here,
//! with richer hook-based statuses to come.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, AppResult};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub id: String,
    pub agent_id: String,
    pub agent_name: String,
    pub branch: String,
    pub worktree_path: String,
    pub status: String, // "running" | "exited"
}

struct Running {
    session: AgentSession,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
}

#[derive(Default)]
pub struct Supervisor {
    sessions: Mutex<HashMap<String, Running>>,
}

#[derive(Serialize, Clone)]
struct OutputEvent {
    id: String,
    data: String,
}

impl Supervisor {
    /// Spawn `command` in a pty with cwd=`worktree_path`, streaming output via the
    /// `agent:output` event and an `agent:exited` event on EOF.
    pub fn start(
        &self,
        app: &AppHandle,
        agent_id: &str,
        agent_name: &str,
        command: &str,
        branch: &str,
        worktree_path: &str,
    ) -> AppResult<AgentSession> {
        let pair = native_pty_system()
            .openpty(PtySize { rows: 30, cols: 100, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| AppError::Msg(format!("openpty: {e}")))?;

        let mut cmd = CommandBuilder::new(command);
        cmd.cwd(worktree_path);
        // portable-pty starts with an empty env; inherit ours so the agent finds
        // HOME/PATH/etc., and advertise a real terminal.
        for (k, v) in std::env::vars() {
            cmd.env(k, v);
        }
        cmd.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Msg(format!("spawn {command}: {e}")))?;
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
            "s{}",
            SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
        );

        let app2 = app.clone();
        let id2 = id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        let _ = app2.emit("agent:output", OutputEvent { id: id2.clone(), data });
                    }
                }
            }
            let _ = app2.emit("agent:exited", id2.clone());
        });

        let session = AgentSession {
            id: id.clone(),
            agent_id: agent_id.to_string(),
            agent_name: agent_name.to_string(),
            branch: branch.to_string(),
            worktree_path: worktree_path.to_string(),
            status: "running".into(),
        };
        self.sessions.lock().unwrap().insert(
            id,
            Running { session: session.clone(), child, writer, master: pair.master },
        );
        Ok(session)
    }

    pub fn write(&self, id: &str, data: &str) -> AppResult<()> {
        let mut map = self.sessions.lock().unwrap();
        let r = map.get_mut(id).ok_or_else(|| AppError::Msg("no such session".into()))?;
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
            let _ = r.child.kill();
        }
        Ok(())
    }

    pub fn list(&self) -> Vec<AgentSession> {
        let mut map = self.sessions.lock().unwrap();
        map.values_mut()
            .map(|r| {
                let exited = matches!(r.child.try_wait(), Ok(Some(_)));
                r.session.status = if exited { "exited" } else { "running" }.into();
                r.session.clone()
            })
            .collect()
    }
}
