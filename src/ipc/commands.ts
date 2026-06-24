// Typed wrappers around Tauri commands (src-tauri/src/ipc/commands.rs).
import { invoke } from "@tauri-apps/api/core";
import type {
  CommitDetail,
  DiffSides,
  GraphRow,
  Hunk,
  RebaseCommit,
  RepoMeta,
  RepoStatus,
  StashEntry,
  Worktree,
} from "../types/git";

export const listRepos = () => invoke<RepoMeta[]>("list_repos");

export const openRepo = (path: string) => invoke<RepoMeta>("open_repo", { path });

export const removeRepo = (id: number) => invoke<void>("remove_repo", { id });

export const setFavorite = (id: number, favorite: boolean) =>
  invoke<void>("set_favorite", { id, favorite });

export const repoStatus = (path: string) => invoke<RepoStatus>("repo_status", { path });

export const graphLoad = (path: string, limit?: number) =>
  invoke<GraphRow[]>("graph_load", { path, limit });

export const commitDetail = (path: string, sha: string) =>
  invoke<CommitDetail>("commit_detail", { path, sha });

export const commitDiff = (path: string, sha: string, file: string) =>
  invoke<string>("commit_diff", { path, sha, file });

export const wipDiff = (path: string, file: string) =>
  invoke<string>("wip_diff", { path, file });

export const diffSides = (path: string, sha: string, file: string) =>
  invoke<DiffSides>("diff_sides", { path, sha, file });

export const fileHunks = (path: string, file: string, staged: boolean) =>
  invoke<Hunk[]>("file_hunks", { path, file, staged });
export const applyHunk = (path: string, patch: string, reverse: boolean) =>
  invoke<void>("apply_hunk", { path, patch, reverse });

export const stage = (path: string, files: string[]) => invoke<void>("stage", { path, files });
export const unstage = (path: string, files: string[]) => invoke<void>("unstage", { path, files });
export const stageAll = (path: string) => invoke<void>("stage_all", { path });
export const unstageAll = (path: string) => invoke<void>("unstage_all", { path });
export const commit = (path: string, message: string, amend: boolean) =>
  invoke<void>("commit", { path, message, amend });

export const listBranches = (path: string) => invoke<string[]>("list_branches", { path });
export const checkout = (path: string, refname: string) =>
  invoke<void>("checkout", { path, refname });
export const createBranch = (path: string, name: string, checkout: boolean) =>
  invoke<void>("create_branch", { path, name, checkout });
export const fetch = (path: string) => invoke<void>("fetch", { path });
export const pull = (path: string) => invoke<void>("pull", { path });
export const push = (path: string) => invoke<void>("push", { path });

export const merge = (path: string, refname: string) =>
  invoke<void>("merge", { path, refname });
export const createBranchAt = (path: string, name: string, at: string, checkout: boolean) =>
  invoke<void>("create_branch_at", { path, name, at, checkout });
export const branchDelete = (path: string, name: string, force: boolean) =>
  invoke<void>("branch_delete", { path, name, force });
export const branchRename = (path: string, oldName: string, newName: string) =>
  invoke<void>("branch_rename", { path, old: oldName, new: newName });
export const tagCreate = (path: string, name: string, at: string) =>
  invoke<void>("tag_create", { path, name, at });
export const tagDelete = (path: string, name: string) =>
  invoke<void>("tag_delete", { path, name });

export const resolveConflict = (path: string, file: string, ours: boolean) =>
  invoke<void>("resolve_conflict", { path, file, ours });
export const launchDifftool = (path: string, file: string) =>
  invoke<void>("launch_difftool", { path, file });
export const launchMergetool = (path: string, file: string) =>
  invoke<void>("launch_mergetool", { path, file });
export const conflictContent = (path: string, file: string) =>
  invoke<string>("conflict_content", { path, file });
export const writeResolution = (path: string, file: string, content: string) =>
  invoke<void>("write_resolution", { path, file, content });
export const mergeContinue = (path: string) => invoke<void>("merge_continue", { path });
export const mergeAbort = (path: string) => invoke<void>("merge_abort", { path });
export const rebase = (path: string, onto: string) => invoke<void>("rebase", { path, onto });
export const rebaseContinue = (path: string) => invoke<void>("rebase_continue", { path });
export const rebaseAbort = (path: string) => invoke<void>("rebase_abort", { path });
export const rebaseTodoCommits = (path: string, base: string) =>
  invoke<RebaseCommit[]>("rebase_todo_commits", { path, base });
export const rebaseInteractive = (path: string, base: string, todo: string) =>
  invoke<void>("rebase_interactive", { path, base, todo });

export const worktreeList = (path: string) => invoke<Worktree[]>("worktree_list", { path });
export const worktreeAdd = (path: string, name: string, create: boolean) =>
  invoke<string>("worktree_add", { path, name, create });
export const worktreeRemove = (path: string, wtPath: string, force: boolean) =>
  invoke<void>("worktree_remove", { path, wtPath, force });

export const stashList = (path: string) => invoke<StashEntry[]>("stash_list", { path });
export const stashSave = (path: string, message: string | null, untracked: boolean) =>
  invoke<void>("stash_save", { path, message, untracked });
export const stashApply = (path: string, id: string) =>
  invoke<void>("stash_apply", { path, id });
export const stashPop = (path: string, id: string) => invoke<void>("stash_pop", { path, id });
export const stashDrop = (path: string, id: string) => invoke<void>("stash_drop", { path, id });

export const watchRepo = (path: string) => invoke<void>("watch_repo", { path });

export const unwatchRepo = (path: string) => invoke<void>("unwatch_repo", { path });
