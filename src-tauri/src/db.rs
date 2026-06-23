use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::model::RepoMeta;

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
}
