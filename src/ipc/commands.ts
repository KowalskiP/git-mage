// Typed wrappers around Tauri commands (src-tauri/src/ipc/commands.rs).
import { invoke } from "@tauri-apps/api/core";
import type { CommitDetail, DiffSides, GraphRow, RepoMeta, RepoStatus } from "../types/git";

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

export const watchRepo = (path: string) => invoke<void>("watch_repo", { path });

export const unwatchRepo = (path: string) => invoke<void>("unwatch_repo", { path });
