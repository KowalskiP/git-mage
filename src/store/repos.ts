import { create } from "zustand";
import type {
  AgentInfo,
  AgentSession,
  ForgeInfo,
  ForgeIssue,
  ForgePull,
  GitflowConfig,
  BranchList,
  GraphRow,
  LfsStatus,
  Profile,
  Remote,
  RepoMeta,
  RepoStatus,
  SigningConfig,
  StashEntry,
  Submodule,
  Worktree,
} from "../types/git";
import * as api from "../ipc/commands";
import { effectiveBindings } from "../lib/keymap";
import { isLang, type Lang } from "../i18n/dict";
import {
  type Appearance,
  type IconTheme,
  type ThemeMode,
  type ThemeVar,
  DEFAULT_APPEARANCE,
  applyAppearance,
} from "../theme";

const APPEARANCE_SETTING = "appearance";
const PROFILE_MAP_SETTING = "profile.byRepo";

const KEYMAP_SETTING = "keymap.overrides";
const LANG_SETTING = "locale";

interface ReposState {
  repos: RepoMeta[];
  selected: RepoMeta | null;
  status: RepoStatus | null;
  graph: GraphRow[];
  graphLoading: boolean;
  selectedSha: string | null;
  branches: string[];
  branchTree: BranchList;
  tags: string[];
  remotes: Remote[];
  stashes: StashEntry[];
  worktrees: Worktree[];
  submodules: Submodule[];
  lfs: LfsStatus | null;
  signing: SigningConfig | null;
  gitflow: GitflowConfig | null;
  forge: ForgeInfo | null;
  pulls: ForgePull[];
  issues: ForgeIssue[];
  forgeLoading: boolean;
  showForge: boolean;
  agents: AgentInfo[];
  sessions: AgentSession[];
  openSessionId: string | null;
  busy: string | null;
  loading: boolean;
  error: string | null;
  info: string | null;
  showTerminal: boolean;
  reposDrawerOpen: boolean;
  cloneOpen: boolean;
  prOpen: boolean;
  blameView: { file: string; rev: string } | null;
  historyView: { file: string; rev: string } | null;
  profilesOpen: boolean;
  profiles: Profile[];
  /** repo path → profile id last applied there (auto-applied on open). */
  profileByRepo: Record<string, number>;
  paletteOpen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  /** id → chord overrides for the keymap (empty chord = unbound). */
  keymap: Record<string, string>;
  lang: Lang;
  appearance: Appearance;

  toggleTerminal: () => void;
  toggleReposDrawer: (open?: boolean) => void;
  setClone: (open: boolean) => void;
  setBlameView: (t: { file: string; rev: string } | null) => void;
  setHistoryView: (t: { file: string; rev: string } | null) => void;
  cloneRepo: (url: string, dir: string) => Promise<void>;
  initRepo: (dir: string) => Promise<void>;
  setProfilesOpen: (open: boolean) => void;
  loadProfiles: () => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  deleteProfile: (id: number) => Promise<void>;
  applyProfile: (p: Profile, global?: boolean) => Promise<void>;
  undo: () => Promise<void>;
  setInfo: (msg: string | null) => void;
  dismissInfo: () => void;
  setPalette: (open: boolean) => void;
  setShortcuts: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  dismissError: () => void;
  loadKeymap: () => Promise<void>;
  setBinding: (id: string, binding: string) => Promise<void>;
  resetBinding: (id: string) => Promise<void>;
  resetAllBindings: () => Promise<void>;
  runShortcut: (id: string) => void;
  loadLang: () => Promise<void>;
  setLang: (lang: Lang) => Promise<void>;
  loadAppearance: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => void;
  setThemeVar: (v: ThemeVar, value: string) => void;
  resetTheme: () => void;
  setUiScale: (scale: number) => void;
  setIconTheme: (t: IconTheme) => void;
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
  loadRemotes: () => Promise<void>;
  addRemote: (name: string, url: string) => Promise<void>;
  removeRemote: (name: string) => Promise<void>;
  renameRemote: (oldName: string, newName: string) => Promise<void>;
  setRemoteUrl: (name: string, url: string) => Promise<void>;
  checkout: (refname: string) => Promise<void>;
  createBranch: (name: string, checkout: boolean) => Promise<void>;
  fetch: () => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
  merge: (refname: string) => Promise<void>;
  mergeBranches: (from: string, into: string) => Promise<void>;
  rebaseBranchOnto: (branch: string, onto: string) => Promise<void>;
  resetBranchTo: (branch: string, sha: string, mode: string) => Promise<void>;
  cherryPickOnto: (branch: string, sha: string) => Promise<void>;
  createBranchAt: (name: string, at: string, checkout: boolean) => Promise<void>;
  branchDelete: (name: string, force: boolean) => Promise<void>;
  deleteRemoteBranch: (remote: string, branch: string) => Promise<void>;
  branchRename: (oldName: string, newName: string) => Promise<void>;
  loadTags: () => Promise<void>;
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
  loadGitflow: () => Promise<void>;
  gitflowInit: () => Promise<void>;
  gitflowStart: (kind: string, name: string) => Promise<void>;
  gitflowFinish: (kind: string, name: string) => Promise<void>;
  toggleForge: (open?: boolean) => void;
  loadForge: () => Promise<void>;
  setForgeToken: (token: string) => Promise<void>;
  clearForgeToken: () => Promise<void>;
  loadPulls: () => Promise<void>;
  loadIssues: () => Promise<void>;
  setPrOpen: (open: boolean) => void;
  createPull: (title: string, body: string, source: string, target: string) => Promise<void>;
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
  cherryPick: (sha: string) => Promise<void>;
  revert: (sha: string) => Promise<void>;
  reset: (target: string, mode: string) => Promise<void>;
  sequencerContinue: () => Promise<void>;
  sequencerAbort: () => Promise<void>;
  rebase: (onto: string) => Promise<void>;
  rebaseContinue: () => Promise<void>;
  rebaseAbort: () => Promise<void>;
  rebaseInteractive: (base: string, todo: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  closeRepo: () => Promise<void>;
  toggleFavorite: (repo: RepoMeta) => Promise<void>;
}

/** Merge an appearance patch, persist it, and apply it to the document. */
function saveAppearance(
  get: () => ReposState,
  set: (partial: Partial<ReposState>) => void,
  patch: Partial<Appearance>,
) {
  const next: Appearance = { ...get().appearance, ...patch };
  set({ appearance: next });
  applyAppearance(next);
  api.setSetting(APPEARANCE_SETTING, JSON.stringify(next)).catch(() => {});
}

/** Cleared per-repo slice shared by select() and closeRepo(). */
const EMPTY_REPO_STATE = {
  status: null,
  graph: [],
  selectedSha: null,
  branches: [],
  branchTree: { local: [], remote: [] } as BranchList,
  tags: [],
  remotes: [],
  stashes: [],
  worktrees: [],
  submodules: [],
  lfs: null,
  signing: null,
  gitflow: null,
  forge: null,
  pulls: [],
  issues: [],
};

export const useRepos = create<ReposState>((set, get) => ({
  repos: [],
  selected: null,
  status: null,
  graph: [],
  graphLoading: false,
  selectedSha: null,
  branches: [],
  branchTree: { local: [], remote: [] },
  tags: [],
  remotes: [],
  stashes: [],
  worktrees: [],
  submodules: [],
  lfs: null,
  signing: null,
  gitflow: null,
  forge: null,
  pulls: [],
  issues: [],
  forgeLoading: false,
  showForge: false,
  agents: [],
  sessions: [],
  openSessionId: null,
  busy: null,
  loading: false,
  error: null,
  info: null,
  showTerminal: false,
  reposDrawerOpen: true,
  cloneOpen: false,
  prOpen: false,
  blameView: null,
  historyView: null,
  profilesOpen: false,
  profiles: [],
  profileByRepo: {},
  paletteOpen: false,
  shortcutsOpen: false,
  settingsOpen: false,
  keymap: {},
  lang: "en",
  appearance: DEFAULT_APPEARANCE,

  toggleTerminal: () => set((s) => ({ showTerminal: !s.showTerminal })),
  toggleReposDrawer: (open) => set((s) => ({ reposDrawerOpen: open ?? !s.reposDrawerOpen })),
  setClone: (open) => set({ cloneOpen: open }),
  setBlameView: (t) => set({ blameView: t }),
  setHistoryView: (t) => set({ historyView: t }),
  setInfo: (msg) => set({ info: msg }),
  dismissInfo: () => set({ info: null }),

  cloneRepo: async (url, dir) => {
    set({ busy: "Cloning…", error: null });
    try {
      const repo = await api.cloneRepo(url, dir);
      set({ cloneOpen: false });
      await get().loadRepos();
      await get().select(repo);
    } catch (e) {
      set({ error: String(e) });
    }
    set({ busy: null });
  },

  initRepo: async (dir) => {
    set({ busy: "Initializing…", error: null });
    try {
      const repo = await api.initRepo(dir);
      await get().loadRepos();
      await get().select(repo);
    } catch (e) {
      set({ error: String(e) });
    }
    set({ busy: null });
  },

  setProfilesOpen: (open) => set({ profilesOpen: open }),

  loadProfiles: async () => {
    try {
      set({ profiles: (await api.profilesList()) ?? [] });
      const raw = await api.getSetting(PROFILE_MAP_SETTING);
      if (raw) set({ profileByRepo: JSON.parse(raw) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveProfile: async (p) => {
    set({ error: null });
    try {
      await api.profileSave(p);
      await get().loadProfiles();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteProfile: async (id) => {
    set({ error: null });
    try {
      await api.profileDelete(id);
      await get().loadProfiles();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  applyProfile: async (p, global = false) => {
    const sel = get().selected;
    // Global apply doesn't need an open repo; local does.
    if (!global && !sel) return;
    set({ busy: `Applying profile ${p.name}…`, error: null });
    try {
      await api.profileApply(sel?.path ?? "", p, global);
      set({
        info: global
          ? `Profile "${p.name}" set as global git identity.`
          : `Profile "${p.name}" applied to ${sel?.alias ?? sel?.name}.`,
      });
      // Remember the choice per repo so it's re-applied automatically on open.
      if (!global && sel) {
        const map = { ...get().profileByRepo, [sel.path]: p.id };
        set({ profileByRepo: map });
        api.setSetting(PROFILE_MAP_SETTING, JSON.stringify(map)).catch(() => {});
      }
    } catch (e) {
      set({ error: String(e) });
    }
    if (!global) await get().loadSigning();
    set({ busy: null });
  },

  undo: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Undoing…", error: null });
    try {
      set({ info: await api.undo(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  setPalette: (open) => set({ paletteOpen: open }),
  setShortcuts: (open) => set({ shortcutsOpen: open }),
  setSettings: (open) => set({ settingsOpen: open }),
  dismissError: () => set({ error: null }),

  loadKeymap: async () => {
    try {
      const raw = await api.getSetting(KEYMAP_SETTING);
      if (raw) set({ keymap: JSON.parse(raw) });
    } catch {
      /* corrupt/absent setting — keep defaults */
    }
  },

  setBinding: async (id, binding) => {
    // Reassign: clear the chord from any other action that currently holds it.
    const next: Record<string, string> = { ...get().keymap };
    if (binding) {
      const eff = effectiveBindings(next);
      for (const [otherId, b] of Object.entries(eff)) {
        if (otherId !== id && b === binding) next[otherId] = "";
      }
    }
    next[id] = binding;
    set({ keymap: next });
    await api.setSetting(KEYMAP_SETTING, JSON.stringify(next)).catch(() => {});
  },

  resetBinding: async (id) => {
    const next = { ...get().keymap };
    delete next[id];
    set({ keymap: next });
    await api.setSetting(KEYMAP_SETTING, JSON.stringify(next)).catch(() => {});
  },

  resetAllBindings: async () => {
    set({ keymap: {} });
    await api.setSetting(KEYMAP_SETTING, JSON.stringify({})).catch(() => {});
  },

  loadLang: async () => {
    try {
      const saved = await api.getSetting(LANG_SETTING);
      if (saved && isLang(saved)) {
        set({ lang: saved });
        return;
      }
    } catch {
      /* fall through to OS detection */
    }
    // First run: follow the OS language if we support it (e.g. "de-DE" → "de").
    if (typeof navigator !== "undefined") {
      const pref = navigator.language.slice(0, 2).toLowerCase();
      if (isLang(pref)) set({ lang: pref });
    }
  },

  setLang: async (lang) => {
    set({ lang });
    await api.setSetting(LANG_SETTING, lang).catch(() => {});
  },

  loadAppearance: async () => {
    let a = DEFAULT_APPEARANCE;
    try {
      const raw = await api.getSetting(APPEARANCE_SETTING);
      if (raw) a = { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
    } catch {
      /* corrupt/absent — use defaults */
    }
    set({ appearance: a });
    applyAppearance(a);
  },

  setThemeMode: (mode) => saveAppearance(get, set, { mode }),
  setThemeVar: (v, value) =>
    saveAppearance(get, set, { custom: { ...get().appearance.custom, [v]: value } }),
  resetTheme: () => saveAppearance(get, set, { custom: {} }),
  setUiScale: (scale) => saveAppearance(get, set, { scale }),
  setIconTheme: (iconTheme) => saveAppearance(get, set, { iconTheme }),

  runShortcut: (id) => {
    const s = get();
    switch (id) {
      case "palette":
        return s.setPalette(!s.paletteOpen);
      case "shortcuts":
        return s.setShortcuts(!s.shortcutsOpen);
      case "toggleTerminal":
        return s.toggleTerminal();
      case "refresh":
        s.refreshStatus();
        s.loadGraph();
        return;
      case "fetch":
        return void s.fetch();
      case "pull":
        return void s.pull();
      case "push":
        return void s.push();
      case "stageAll":
        return void s.stageAll();
      case "stash":
        return void s.stashSave(null, false);
    }
  },

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
    set({ selected: repo, ...EMPTY_REPO_STATE });
    await api.watchRepo(repo.path).catch(() => {});
    await Promise.all([
      get().refreshStatus(),
      get().loadGraph(),
      get().loadBranches(),
      get().loadTags(),
      get().loadStashes(),
      get().loadWorktrees(),
      get().loadRemotes(),
      get().loadSubmodules(),
      get().loadLfs(),
      get().loadSigning(),
      get().loadGitflow(),
      get().loadForge(),
    ]);
    // Re-apply this repo's remembered identity profile (silent, local config).
    const pid = get().profileByRepo[repo.path];
    if (pid) {
      const prof = get().profiles.find((p) => p.id === pid);
      if (prof) await api.profileApply(repo.path, prof, false).catch(() => {});
    }
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
      const bl = await api.branchList(sel.path);
      set({ branchTree: bl, branches: bl.local.map((b) => b.name) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadRemotes: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ remotes: await api.remoteList(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadTags: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ tags: await api.tagList(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteRemoteBranch: async (remote, branch) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Deleting ${remote}/${branch}…`, error: null });
    try {
      await api.branchDeleteRemote(sel.path, remote, branch);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().loadBranches(), get().loadGraph()]);
    set({ busy: null });
  },

  addRemote: async (name, url) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Adding remote ${name}…`, error: null });
    try {
      await api.remoteAdd(sel.path, name, url);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().loadRemotes(), get().refreshStatus()]);
    set({ busy: null });
  },

  removeRemote: async (name) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Removing remote ${name}…`, error: null });
    try {
      await api.remoteRemove(sel.path, name);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadRemotes();
    set({ busy: null });
  },

  renameRemote: async (oldName, newName) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Renaming remote ${oldName}…`, error: null });
    try {
      await api.remoteRename(sel.path, oldName, newName);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().loadRemotes(), get().refreshStatus()]);
    set({ busy: null });
  },

  setRemoteUrl: async (name, url) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Updating ${name} URL…`, error: null });
    try {
      await api.remoteSetUrl(sel.path, name, url);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadRemotes();
    set({ busy: null });
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

  // Drag-and-drop helpers: check out the branch that must be current for the op,
  // then run it. Bail if the checkout fails (e.g. dirty tree) so we never act on
  // the wrong branch.
  mergeBranches: async (from, into) => {
    if (into !== get().status?.branch) {
      await get().checkout(into);
      if (get().error) return;
    }
    await get().merge(from);
  },

  rebaseBranchOnto: async (branch, onto) => {
    if (branch !== get().status?.branch) {
      await get().checkout(branch);
      if (get().error) return;
    }
    await get().rebase(onto);
  },

  resetBranchTo: async (branch, sha, mode) => {
    if (branch !== get().status?.branch) {
      await get().checkout(branch);
      if (get().error) return;
    }
    await get().reset(sha, mode);
  },

  cherryPickOnto: async (branch, sha) => {
    if (branch !== get().status?.branch) {
      await get().checkout(branch);
      if (get().error) return;
    }
    await get().cherryPick(sha);
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
    await Promise.all([get().loadGraph(), get().loadTags()]);
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
    await Promise.all([get().loadGraph(), get().loadTags()]);
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

  loadGitflow: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ gitflow: await api.gitflowStatus(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  gitflowInit: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Initializing gitflow…", error: null });
    try {
      await api.gitflowInit(sel.path);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().loadGitflow(), get().loadBranches(), get().loadGraph()]);
    set({ busy: null });
  },

  gitflowStart: async (kind, name) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Starting ${kind}/${name}…`, error: null });
    try {
      await api.gitflowStart(sel.path, kind, name);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([
      get().refreshStatus(),
      get().loadGraph(),
      get().loadBranches(),
      get().loadGitflow(),
    ]);
    set({ busy: null });
  },

  gitflowFinish: async (kind, name) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Finishing ${kind}/${name}…`, error: null });
    try {
      await api.gitflowFinish(sel.path, kind, name);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([
      get().refreshStatus(),
      get().loadGraph(),
      get().loadBranches(),
      get().loadGitflow(),
    ]);
    set({ busy: null });
  },

  toggleForge: (open) =>
    set((s) => {
      const next = open ?? !s.showForge;
      // Lazy-load PRs/issues the first time the panel opens with a token.
      if (next && s.forge?.hasToken && s.pulls.length === 0 && s.issues.length === 0) {
        void get().loadPulls();
        void get().loadIssues();
      }
      return { showForge: next };
    }),

  loadForge: async () => {
    const sel = get().selected;
    if (!sel) return;
    try {
      set({ forge: await api.forgeDetect(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setForgeToken: async (token) => {
    const sel = get().selected;
    const provider = get().forge?.provider;
    if (!sel || !provider) return;
    set({ busy: "Saving token…", error: null });
    try {
      await api.forgeSetToken(provider, token);
    } catch (e) {
      set({ error: String(e) });
    }
    await get().loadForge();
    set({ busy: null });
    if (get().forge?.hasToken) {
      await Promise.all([get().loadPulls(), get().loadIssues()]);
    }
  },

  clearForgeToken: async () => {
    const provider = get().forge?.provider;
    if (!provider) return;
    set({ busy: "Removing token…", error: null });
    try {
      await api.forgeClearToken(provider);
    } catch (e) {
      set({ error: String(e) });
    }
    set({ pulls: [], issues: [] });
    await get().loadForge();
    set({ busy: null });
  },

  loadPulls: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ forgeLoading: true, error: null });
    try {
      set({ pulls: await api.forgePulls(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
    set({ forgeLoading: false });
  },

  loadIssues: async () => {
    const sel = get().selected;
    if (!sel) return;
    set({ forgeLoading: true, error: null });
    try {
      set({ issues: await api.forgeIssues(sel.path) });
    } catch (e) {
      set({ error: String(e) });
    }
    set({ forgeLoading: false });
  },

  setPrOpen: (open) => set({ prOpen: open }),

  createPull: async (title, body, source, target) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Creating pull request…", error: null });
    try {
      const url = await api.forgeCreatePull(sel.path, title, body, source, target);
      set({ prOpen: false, info: "Pull request created." });
      if (url) await api.openExternal(url);
      await get().loadPulls();
    } catch (e) {
      set({ error: String(e) });
    }
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

  cherryPick: async (sha) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Cherry-picking…", error: null });
    try {
      await api.cherryPick(sel.path, sha);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  revert: async (sha) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: "Reverting…", error: null });
    try {
      await api.revert(sel.path, sha);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  reset: async (target, mode) => {
    const sel = get().selected;
    if (!sel) return;
    set({ busy: `Resetting (${mode})…`, error: null });
    try {
      await api.reset(sel.path, target, mode);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  sequencerContinue: async () => {
    const sel = get().selected;
    const kind = get().status?.sequencer;
    if (!sel || !kind) return;
    set({ busy: `Continuing ${kind}…`, error: null });
    try {
      await api.sequencerContinue(sel.path, kind);
    } catch (e) {
      set({ error: String(e) });
    }
    await Promise.all([get().refreshStatus(), get().loadGraph(), get().loadBranches()]);
    set({ busy: null });
  },

  sequencerAbort: async () => {
    const sel = get().selected;
    const kind = get().status?.sequencer;
    if (!sel || !kind) return;
    set({ busy: `Aborting ${kind}…`, error: null });
    try {
      await api.sequencerAbort(sel.path, kind);
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
    if (sel?.id === id) set({ selected: null, openSessionId: null, ...EMPTY_REPO_STATE });
    await get().loadRepos();
  },

  // Close the open repo and return to the empty state (keeps it in the list).
  closeRepo: async () => {
    const sel = get().selected;
    if (!sel) return;
    await api.unwatchRepo(sel.path).catch(() => {});
    set({ selected: null, openSessionId: null, ...EMPTY_REPO_STATE });
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
