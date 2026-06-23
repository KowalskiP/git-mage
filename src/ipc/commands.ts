// Typed wrappers around Tauri commands (src-tauri/src/ipc/commands.rs).
import { invoke } from "@tauri-apps/api/core";
import type { RepoMeta, RepoStatus } from "../types/git";

export const listRepos = () => invoke<RepoMeta[]>("list_repos");

export const openRepo = (path: string) => invoke<RepoMeta>("open_repo", { path });

export const removeRepo = (id: number) => invoke<void>("remove_repo", { id });

export const setFavorite = (id: number, favorite: boolean) =>
  invoke<void>("set_favorite", { id, favorite });

export const repoStatus = (path: string) => invoke<RepoStatus>("repo_status", { path });

export const watchRepo = (path: string) => invoke<void>("watch_repo", { path });

export const unwatchRepo = (path: string) => invoke<void>("unwatch_repo", { path });
