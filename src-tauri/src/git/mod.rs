//! Git read access.
//!
//! SPEC §5.2 hybrid engine: reads go through **gitoxide (`gix`)** for speed.
//! For M0 we use `gix` to validate/open the repo and read the current branch,
//! and shell out to system `git` for the porcelain working-tree status.
//! M1 will move status onto `gix::status` (see `status.rs`).

pub mod cmd;
mod commit;
mod gitflow;
mod graph;
mod history;
mod hunk;
mod keys;
mod lfs;
mod ops;
mod profile;
mod remotes;
mod signing;
mod stage;
mod stash;
mod status;
mod submodule;
mod worktree;

pub use commit::{commit_detail, commit_diff, diff_sides, wip_diff};
pub use graph::{default_graph_refs, graph, graph_more};
pub use gitflow::{gitflow_finish, gitflow_init, gitflow_start, gitflow_status};
pub use history::{blame, file_history};
pub use hunk::{apply_hunk, file_hunks};
pub use keys::{gpg_keygen, ssh_keygen};
pub use lfs::{lfs_lock, lfs_pull, lfs_status, lfs_track, lfs_unlock};
pub use stash::{stash_apply, stash_drop, stash_list, stash_pop, stash_save};
pub use submodule::{submodule_list, submodule_sync, submodule_update};
pub use worktree::{
    worktree_add, worktree_list, worktree_lock, worktree_prune, worktree_remove,
};
pub use ops::{
    branch_delete, branch_delete_remote, branch_list, branch_rename, checkout, cherry_pick, clone,
    conflict_content, create_branch, create_branch_at, fetch, init, last_action, launch_difftool,
    launch_mergetool, list_branches, merge, merge_abort,
    merge_continue, pull, push, rebase, rebase_abort, rebase_continue, rebase_interactive,
    rebase_todo_commits, reset, resolve_side, revert, sequencer_abort, sequencer_continue,
    ssh_key_from_config, tag_create, tag_delete, tag_list, undo, write_resolution,
};
pub use profile::{apply_profile, identity};
pub use remotes::{remote_add, remote_list, remote_remove, remote_rename, remote_set_url};
pub use signing::{set_signing, signing_config};
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
