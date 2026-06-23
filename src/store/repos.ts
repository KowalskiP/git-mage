import { create } from "zustand";
import type { GraphRow, RepoMeta, RepoStatus } from "../types/git";
import * as api from "../ipc/commands";

interface ReposState {
  repos: RepoMeta[];
  selected: RepoMeta | null;
  status: RepoStatus | null;
  graph: GraphRow[];
  graphLoading: boolean;
  selectedSha: string | null;
  loading: boolean;
  error: string | null;

  loadRepos: () => Promise<void>;
  openRepo: (path: string) => Promise<void>;
  select: (repo: RepoMeta) => Promise<void>;
  refreshStatus: () => Promise<void>;
  loadGraph: () => Promise<void>;
  selectNode: (sha: string) => void;
  stage: (files: string[]) => Promise<void>;
  unstage: (files: string[]) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: (message: string, amend: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
  toggleFavorite: (repo: RepoMeta) => Promise<void>;
}

export const useRepos = create<ReposState>((set, get) => ({
  repos: [],
  selected: null,
  status: null,
  graph: [],
  graphLoading: false,
  selectedSha: null,
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
    set({ selected: repo, status: null, graph: [], selectedSha: null });
    await api.watchRepo(repo.path).catch(() => {});
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
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

  loadGraph: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ graphLoading: true });
    try {
      const graph = await api.graphLoad(sel.path);
      // Keep the current selection if still present, else select the top node.
      const cur = get().selectedSha;
      const keep = cur && graph.some((r) => r.sha === cur) ? cur : graph[0]?.sha ?? null;
      set({ graph, selectedSha: keep, error: null });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ graphLoading: false });
    }
  },

  selectNode: (sha) => set({ selectedSha: sha }),

  stage: async (files) => {
    const sel = get().selected;
    if (!sel) return;
    try {
      await api.stage(sel.path, files);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
  },

  unstage: async (files) => {
    const sel = get().selected;
    if (!sel) return;
    try {
      await api.unstage(sel.path, files);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
  },

  stageAll: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      await api.stageAll(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
  },

  unstageAll: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      await api.unstageAll(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
  },

  // Throws on failure so the commit box can react (show error, keep the message).
  commit: async (message, amend) => {
    const sel = get().selected;
    if (!sel) return;
    await api.commit(sel.path, message, amend);
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
  },

  remove: async (id) => {
    await api.removeRepo(id);
    const sel = get().selected;
    if (sel?.id === id) set({ selected: null, status: null, graph: [], selectedSha: null });
    await get().loadRepos();
  },

  toggleFavorite: async (repo) => {
    await api.setFavorite(repo.id, !repo.favorite);
    await get().loadRepos();
  },
}));
