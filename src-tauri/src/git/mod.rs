//! Git read access.
//!
//! SPEC §5.2 hybrid engine: reads go through **gitoxide (`gix`)** for speed.
//! For M0 we use `gix` to validate/open the repo and read the current branch,
//! and shell out to system `git` for the porcelain working-tree status.
//! M1 will move status onto `gix::status` (see `status.rs`).

mod commit;
mod graph;
mod hunk;
mod ops;
mod stage;
mod status;

pub use commit::{commit_detail, commit_diff, diff_sides, wip_diff};
pub use graph::graph;
pub use hunk::{apply_hunk, file_hunks};
pub use ops::{
    branch_delete, branch_rename, checkout, create_branch, create_branch_at, fetch,
    list_branches, merge, pull, push, tag_create, tag_delete,
};
pub use stage::{commit, stage, stage_all, unstage, unstage_all};
pub use status::status;

use crate::error::{AppError, AppResult};

/// Validate that `path` is a git repository (via gix).
pub fn validate(path: &str) -> AppResult<()> {
    gix::open(path).map_err(|e| AppError::Git(format!("not a git repository: {e}")))?;
    Ok(())
}

/// Current branch short name via gix, or `None` if detached / unborn.
pub fn current_branch(path: &str) -> Option<String> {
    let repo = gix::open(path).ok()?;
    let head = repo.head().ok()?;
    head.referent_name().map(|name| name.shorten().to_string())
}
