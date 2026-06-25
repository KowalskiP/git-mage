import { create } from "zustand";
import type {
  AgentInfo,
  AgentSession,
  GraphRow,
  LfsStatus,
  RepoMeta,
  RepoStatus,
  SigningConfig,
  StashEntry,
  Submodule,
  Worktree,
} from "../types/git";
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
  worktrees: Worktree[];
  submodules: Submodule[];
  lfs: LfsStatus | null;
  signing: SigningConfig | null;
  agents: AgentInfo[];
  sessions: AgentSession[];
  openSessionId: string | null;
  busy: string | null;
  loading: boolean;
  error: string | null;
  showTerminal: boolean;
  paletteOpen: boolean;

  toggleTerminal: () => void;
  setPalette: (open: boolean) => void;
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
  loadAgents: () => Promise<void>;
  loadSessions: () => Promise<void>;
  newSession: (agentId: string, branch: string) => Promise<void>;
  killSession: (id: string) => Promise<void>;
  openSession: (id: string | null) => void;
  setSessionStatus: (id: string, status: string) => void;
  loadWorktrees: () => Promise<void>;
  addWorktree: (name: string, create: boolean) => Promise<void>;
  removeWorktree: (wtPath: string, force: boolean, deleteBranch?: string) => Promise<void>;
  loadSubmodules: () => Promise<void>;
  updateSubmodule: (sub: string | null, init: boolean) => Promise<void>;
  syncSubmodules: () => Promise<void>;
  loadLfs: () => Promise<void>;
  lfsPull: () => Promise<void>;
  lfsTrack: (pattern: string) => Promise<void>;
  lfsLock: (file: string, lock: boolean) => Promise<void>;
  loadSigning: () => Promise<void>;
  saveSigning: (sign: boolean, format: string, key: string) => Promise<void>;
  loadStashes: () => Promise<void>;
  stashSave: (message: string | null, untracked: boolean) => Promise<void>;
  stashApply: (id: string) => Promise<void>;
  stashPop: (id: string) => Promise<void>;
  stashDrop: (id: string) => Promise<void>;
  resolveConflict: (file: string, ours: boolean) => Promise<void>;
  saveResolution: (file: string, content: string) => Promise<void>;
  openDifftool: (file: string) => Promise<void>;
  openMergetool: (file: string) => Promise<void>;
  mergeContinue: () => Promise<void>;
  mergeAbort: () => Promise<void>;
  rebase: (onto: string) => Promise<void>;
  rebaseContinue: () => Promise<void>;
  rebaseAbort: () => Promise<void>;
  rebaseInteractive: (base: string, todo: string) => Promise<void>;
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
  worktrees: [],
  submodules: [],
  lfs: null,
  signing: null,
  agents: [],
  sessions: [],
  openSessionId: null,
  busy: null,
  loading: false,
  error: null,
  showTerminal: false,
  paletteOpen: false,

  toggleTerminal: () => set((s) => ({ showTerminal: !s.showTerminal })),
  setPalette: (open) => set({ paletteOpen: open }),

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
    set({
      selected: repo,
      status: null,
      graph: [],
      selectedSha: null,
      branches: [],
      stashes: [],
      worktrees: [],
      submodules: [],
      lfs: null,
      signing: null,
    });
    await api.watchRepo(repo.path).catch(() => {});
    await Promise.all([
      get().refreshStatus(),
      get().loadGraph(),
      get().loadBranches(),
      get().loadStashes(),
      get().loadWorktrees(),
      get().loadSubmodules(),
      get().loadLfs(),
      get().loadSigning(),
    ]);
  },

  refreshStatus: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      // Don't clear `error` here: a failed mutation sets it and then calls this
      // refresh — clearing on success would hide the failure. Errors clear when
      // the next user action starts.
      set({ status: await api.repoStatus(sel.path) });
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
      set({ graph, selectedSha: keep });
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

  loadAgents: async () => {
    try {
      set({ agents: await api.detectAgents() });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadSessions: async () => {
    try {
      set({ sessions: await api.agentSessions() });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  newSession: async (agentId, branch) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Starting ${agentId} on ${branch}…`, error: null });
    try {
      const session = await api.newAgentSession(sel.path, agentId, branch);
      set({ openSessionId: session.id });
      await Promise.all([get().loadSessions(), get().loadWorktrees(), get().loadGraph()]);
    } catch (e) {
      set({ error: String(e) });
    }
    set({ busy: null });
  },

  killSession: async (id) => {
    try {
      await api.agentKill(id);
    } catch (e) {
      set({ error: String(e) });
    }
    const open = get().openSessionId === id ? null : get().openSessionId;
    set({ openSessionId: open });
    await get().loadSessions();
  },

  openSession: (id) => set({ openSessionId: id }),

  setSessionStatus: (id, status) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, status } : x)),
    })),

  loadWorktrees: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ worktrees: await api.worktreeList(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addWorktree: async (name, create) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Creating worktree ${name}…`, error: null });
    try {
      await api.worktreeAdd(sel.path, name, create);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().loadWorktrees(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  removeWorktree: async (wtPath, force, deleteBranch) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Removing worktree…", error: null });
    try {
      await api.worktreeRemove(sel.path, wtPath, force);
      if (deleteBranch) await api.branchDelete(sel.path, deleteBranch, true);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().loadWorktrees(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  loadSubmodules: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ submodules: await api.submoduleList(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  updateSubmodule: async (sub, init) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: sub ? `Updating ${sub}…` : "Updating submodules…", error: null });
    try {
      await api.submoduleUpdate(sel.path, sub, init);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadSubmodules()]);
    set({ busy: null });
  },

  syncSubmodules: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Syncing submodules…", error: null });
    try {
      await api.submoduleSync(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadSubmodules();
    set({ busy: null });
  },

  loadLfs: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ lfs: await api.lfsStatus(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  lfsPull: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Pulling LFS objects…", error: null });
    try {
      await api.lfsPull(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadLfs();
    set({ busy: null });
  },

  lfsTrack: async (pattern) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Tracking ${pattern}…`, error: null });
    try {
      await api.lfsTrack(sel.path, pattern);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().loadLfs(), get().refreshStatus()]);
    set({ busy: null });
  },

  lfsLock: async (file, lock) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: lock ? `Locking ${file}…` : `Unlocking ${file}…`, error: null });
    try {
      if (lock) await api.lfsLock(sel.path, file);
      else await api.lfsUnlock(sel.path, file);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadLfs();
    set({ busy: null });
  },

  loadSigning: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ signing: await api.signingConfig(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveSigning: async (sign, format, key) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Saving signing config…", error: null });
    try {
      await api.setSigning(sel.path, sign, format, key);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadSigning();
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

  resolveConflict: async (file, ours) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Resolving ${file}…`, error: null });
    try {
      await api.resolveConflict(sel.path, file, ours);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
    set({ busy: null });
  },

  saveResolution: async (file, content) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Resolving ${file}…`, error: null });
    try {
      await api.writeResolution(sel.path, file, content);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
    set({ busy: null });
  },

  openDifftool: async (file) => {
    const sel = get().selected;
    if (!sel) return;
    set({ error: null });
    try {
      await api.launchDifftool(sel.path, file);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openMergetool: async (file) => {
    const sel = get().selected;
    if (!sel) return;
    set({ error: null });
    try {
      await api.launchMergetool(sel.path, file);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  mergeContinue: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Completing merge…", error: null });
    try {
      await api.mergeContinue(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  mergeAbort: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Aborting merge…", error: null });
    try {
      await api.mergeAbort(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
    set({ busy: null });
  },

  rebase: async (onto) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Rebasing onto ${onto}…`, error: null });
    try {
      await api.rebase(sel.path, onto);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  rebaseContinue: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Continuing rebase…", error: null });
    try {
      await api.rebaseContinue(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  rebaseAbort: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Aborting rebase…", error: null });
    try {
      await api.rebaseAbort(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph()]);
    set({ busy: null });
  },

  rebaseInteractive: async (base, todo) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Rebasing…", error: null });
    try {
      await api.rebaseInteractive(sel.path, base, todo);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
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
