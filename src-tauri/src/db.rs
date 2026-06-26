use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::model::RepoMeta;
use crate::supervisor::AgentSession;

/// SQLite-backed repository registry. Wrapped in a Mutex so it can live in
/// Tauri managed state (SPEC §5.5: app data in SQLite, WAL mode).
pub struct Db(pub Mutex<Connection>);

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS repos (
  id          INTEGER PRIMARY KEY,
  path        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  alias       TEXT,
  favorite    INTEGER NOT NULL DEFAULT 0,
  last_opened INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_sessions (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  agent_name    TEXT NOT NULL,
  branch        TEXT NOT NULL,
  worktree_path TEXT NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT 0
);
";

fn row_to_meta(r: &rusqlite::Row) -> rusqlite::Result<RepoMeta> {
    Ok(RepoMeta {
        id: r.get(0)?,
        path: r.get(1)?,
        name: r.get(2)?,
        alias: r.get(3)?,
        favorite: r.get::<_, i64>(4)? != 0,
        last_opened: r.get(5)?,
    })
}

const COLS: &str = "id, path, name, alias, favorite, last_opened";

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Db(Mutex::new(conn)))
    }

    pub fn list(&self) -> AppResult<Vec<RepoMeta>> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLS} FROM repos ORDER BY favorite DESC, last_opened DESC"
        ))?;
        let rows = stmt.query_map([], row_to_meta)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn add_or_touch(&self, path: &str, name: &str) -> AppResult<RepoMeta> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO repos (path, name, last_opened)
             VALUES (?1, ?2, strftime('%s','now'))
             ON CONFLICT(path) DO UPDATE SET last_opened = strftime('%s','now')",
            params![path, name],
        )?;
        let meta = conn.query_row(
            &format!("SELECT {COLS} FROM repos WHERE path = ?1"),
            params![path],
            row_to_meta,
        )?;
        Ok(meta)
    }

    pub fn remove(&self, id: i64) -> AppResult<()> {
        self.0
            .lock()
            .unwrap()
            .execute("DELETE FROM repos WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn set_favorite(&self, id: i64, fav: bool) -> AppResult<()> {
        self.0.lock().unwrap().execute(
            "UPDATE repos SET favorite = ?2 WHERE id = ?1",
            params![id, fav as i64],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        let conn = self.0.lock().unwrap();
        let v = conn
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .ok();
        Ok(v)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        self.0.lock().unwrap().execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, value],
        )?;
        Ok(())
    }

    /// Persist an agent session so it survives app restarts (SPEC §M7). The pty
    /// process itself does not survive — restored sessions show as "exited".
    pub fn save_session(&self, s: &AgentSession, created_at: i64) -> AppResult<()> {
        self.0.lock().unwrap().execute(
            "INSERT OR REPLACE INTO agent_sessions
               (id, agent_id, agent_name, branch, worktree_path, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![s.id, s.agent_id, s.agent_name, s.branch, s.worktree_path, created_at],
        )?;
        Ok(())
    }

    pub fn delete_session(&self, id: &str) -> AppResult<()> {
        self.0.lock().unwrap().execute(
            "DELETE FROM agent_sessions WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    /// Persisted sessions (newest first), each marked "exited" — callers merge
    /// these with the live in-memory sessions.
    pub fn list_sessions(&self) -> AppResult<Vec<AgentSession>> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, agent_id, agent_name, branch, worktree_path
             FROM agent_sessions ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(AgentSession {
                id: r.get(0)?,
                agent_id: r.get(1)?,
                agent_name: r.get(2)?,
                branch: r.get(3)?,
                worktree_path: r.get(4)?,
                status: "exited".into(),
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: &str) -> AgentSession {
        AgentSession {
            id: id.into(),
            agent_id: "claude".into(),
            agent_name: "Claude Code".into(),
            branch: "agent/x".into(),
            worktree_path: "/tmp/wt".into(),
            status: "running".into(),
        }
    }

    #[test]
    fn agent_session_round_trip_and_ordering() {
        let dir = std::env::temp_dir().join(format!("gitmage-db-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let db = Db::open(&dir.join("t.sqlite")).unwrap();

        db.save_session(&session("s1"), 100).unwrap();
        db.save_session(&session("s2"), 200).unwrap();

        let list = db.list_sessions().unwrap();
        assert_eq!(list.len(), 2);
        // Newest (higher created_at) first; restored as "exited".
        assert_eq!(list[0].id, "s2");
        assert_eq!(list[1].id, "s1");
        assert_eq!(list[0].status, "exited");
        assert_eq!(list[0].agent_name, "Claude Code");

        db.delete_session("s1").unwrap();
        let list = db.list_sessions().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "s2");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
