import { create } from "zustand";
import type { GraphRow, RepoMeta, RepoStatus, StashEntry } from "../types/git";
import * as api from "../ipc/commands";

interface ReposState {
  repos: RepoMeta[];
  selected: RepoMeta | null;
  status: RepoStatus | null;
  graph: GraphRow[];
  graphLoading: boolean;
  selectedSha: string | null;
  branches: string[];
  stashes: StashEntry[];
  busy: string | null;
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
  stageHunk: (patch: string) => Promise<void>;
  unstageHunk: (patch: string) => Promise<void>;
  loadBranches: () => Promise<void>;
  checkout: (refname: string) => Promise<void>;
  createBranch: (name: string, checkout: boolean) => Promise<void>;
  fetch: () => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
  merge: (refname: string) => Promise<void>;
  createBranchAt: (name: string, at: string, checkout: boolean) => Promise<void>;
  branchDelete: (name: string, force: boolean) => Promise<void>;
  branchRename: (oldName: string, newName: string) => Promise<void>;
  tagCreate: (name: string, at: string) => Promise<void>;
  tagDelete: (name: string) => Promise<void>;
  loadStashes: () => Promise<void>;
  stashSave: (message: string | null, untracked: boolean) => Promise<void>;
  stashApply: (id: string) => Promise<void>;
  stashPop: (id: string) => Promise<void>;
  stashDrop: (id: string) => Promise<void>;
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
  branches: [],
  stashes: [],
  busy: null,
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
    set({ selected: repo, status: null, graph: [], selectedSha: null, branches: [], stashes: [] });
    await api.watchRepo(repo.path).catch(() => {});
    await Promise.all([
      get().refreshStatus(),
      get().loadGraph(),
      get().loadBranches(),
      get().loadStashes(),
    ]);
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
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
  },

  stageHunk: async (patch) => {
    const sel = get().selected;
    if (!sel) return;
    try {
      await api.applyHunk(sel.path, patch, false);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
  },

  unstageHunk: async (patch) => {
    const sel = get().selected;
    if (!sel) return;
    try {
      await api.applyHunk(sel.path, patch, true);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
  },

  loadBranches: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ branches: await api.listBranches(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  checkout: async (refname) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Checking out ${refname}…`, error: null });
    try {
      await api.checkout(sel.path, refname);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  createBranch: async (name, checkout) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Creating ${name}…`, error: null });
    try {
      await api.createBranch(sel.path, name, checkout);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  merge: async (refname) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Merging ${refname}…`, error: null });
    try {
      await api.merge(sel.path, refname);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  createBranchAt: async (name, at, checkout) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Creating ${name}…`, error: null });
    try {
      await api.createBranchAt(sel.path, name, at, checkout);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  branchDelete: async (name, force) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Deleting ${name}…`, error: null });
    try {
      await api.branchDelete(sel.path, name, force);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  branchRename: async (oldName, newName) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Renaming ${oldName}…`, error: null });
    try {
      await api.branchRename(sel.path, oldName, newName);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  tagCreate: async (name, at) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Tagging ${name}…`, error: null });
    try {
      await api.tagCreate(sel.path, name, at);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadGraph();
    set({ busy: null });
  },

  tagDelete: async (name) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Deleting tag ${name}…`, error: null });
    try {
      await api.tagDelete(sel.path, name);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadGraph();
    set({ busy: null });
  },

  loadStashes: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ stashes: await api.stashList(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  stashSave: async (message, untracked) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Stashing…", error: null });
    try {
      await api.stashSave(sel.path, message, untracked);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadStashes()]);
    set({ busy: null });
  },

  stashApply: async (id) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Applying ${id}…`, error: null });
    try {
      await api.stashApply(sel.path, id);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadStashes()]);
    set({ busy: null });
  },

  stashPop: async (id) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Popping ${id}…`, error: null });
    try {
      await api.stashPop(sel.path, id);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadStashes()]);
    set({ busy: null });
  },

  stashDrop: async (id) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Dropping ${id}…`, error: null });
    try {
      await api.stashDrop(sel.path, id);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadStashes();
    set({ busy: null });
  },

  fetch: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Fetching…", error: null });
    try {
      await api.fetch(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
    set({ busy: null });
  },

  pull: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Pulling…", error: null });
    try {
      await api.pull(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  push: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Pushing…", error: null });
    try {
      await api.push(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
    set({ busy: null });
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

// Zustand state doesn't survive HMR patching cleanly (it can leave components
// bound to a stale store, with dead event handlers). Force a full window reload
// whenever this module changes so dev edits to the store stay safe.
if (import.meta.hot) {
  import.meta.hot.accept(() => import.meta.hot!.invalidate());
}
