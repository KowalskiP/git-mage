import { create } from "zustand";
import type { RepoMeta, RepoStatus } from "../types/git";
import * as api from "../ipc/commands";

interface ReposState {
  repos: RepoMeta[];
  selected: RepoMeta | null;
  status: RepoStatus | null;
  loading: boolean;
  error: string | null;

  loadRepos: () => Promise<void>;
  openRepo: (path: string) => Promise<void>;
  select: (repo: RepoMeta) => Promise<void>;
  refreshStatus: () => Promise<void>;
  remove: (id: number) => Promise<void>;
  toggleFavorite: (repo: RepoMeta) => Promise<void>;
}

export const useRepos = create<ReposState>((set, get) => ({
  repos: [],
  selected: null,
  status: null,
  loading: false,
  error: null,

  loadRepos: async () => {
    try {
      set({ repos: await api.listRepos() });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openRepo: async (path) => {
    set({ loading: true, error: null });
    try {
      const repo = await api.openRepo(path);
      await get().loadRepos();
      await get().select(repo);
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ loading: false });
    }
  },

  select: async (repo) => {
    const prev = get().selected;
    if (prev && prev.path !== repo.path) {
      await api.unwatchRepo(prev.path).catch(() => {});
    }
    set({ selected: repo, status: null });
    await api.watchRepo(repo.path).catch(() => {});
    await get().refreshStatus();
  },

  refreshStatus: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ status: await api.repoStatus(sel.path), error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  remove: async (id) => {
    await api.removeRepo(id);
    const sel = get().selected;
    if (sel?.id === id) set({ selected: null, status: null });
    await get().loadRepos();
  },

  toggleFavorite: async (repo) => {
    await api.setFavorite(repo.id, !repo.favorite);
    await get().loadRepos();
  },
}));
