import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepos } from "./store/repos";
import { onFsChange } from "./ipc/events";
import * as api from "./ipc/commands";
import { applyAppearance } from "./theme";
import { Logo } from "./features/Logo";
import { RepoSidebar } from "./features/repos/RepoSidebar";
import { Explorer } from "./features/explorer/Explorer";
import { CloneModal } from "./features/CloneModal";
import { ProfilesPanel } from "./features/profiles/ProfilesPanel";
import { RepoView } from "./features/RepoView";
import { AgentSessionView } from "./features/agents/AgentSessionView";
import { CommandPalette } from "./features/palette/CommandPalette";
import { ShortcutsPanel } from "./features/shortcuts/ShortcutsPanel";
import { ForgePanel } from "./features/forge/ForgePanel";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { TopProgress, Toaster } from "./features/Feedback";
import { UpdateBanner } from "./features/UpdateBanner";
import { eventBinding, effectiveBindings, KEYMAP_ACTIONS } from "./lib/keymap";
import { useT } from "./i18n/useT";

export function App() {
  const t = useT();
  const loadRepos = useRepos((s) => s.loadRepos);
  const loadAgents = useRepos((s) => s.loadAgents);
  const loadSessions = useRepos((s) => s.loadSessions);
  const loadKeymap = useRepos((s) => s.loadKeymap);
  const loadLang = useRepos((s) => s.loadLang);
  const loadProfiles = useRepos((s) => s.loadProfiles);
  const loadAppearance = useRepos((s) => s.loadAppearance);
  const setSessionStatus = useRepos((s) => s.setSessionStatus);
  const refreshStatus = useRepos((s) => s.refreshStatus);
  const loadGraph = useRepos((s) => s.loadGraph);
  const selected = useRepos((s) => s.selected);
  const openSessionId = useRepos((s) => s.openSessionId);
  const reposDrawerOpen = useRepos((s) => s.reposDrawerOpen);
  const openRepo = useRepos((s) => s.openRepo);
  const initRepo = useRepos((s) => s.initRepo);

  async function pickRepo() {
    const dir = await open({ directory: true, multiple: false, title: t("sidebar.openRepo") });
    if (typeof dir === "string") await openRepo(dir);
  }

  async function doInit() {
    const dir = await open({ directory: true, multiple: false, title: t("menu.initTitle") });
    if (typeof dir === "string") await initRepo(dir);
  }

  // Throttle fs-change-driven refreshes (SPEC NFR: refresh ≤100ms, but coalesce bursts).
  const throttle = useRef<number | null>(null);

  useEffect(() => {
    loadRepos();
    loadAgents();
    loadSessions();
    loadKeymap();
    loadLang();
    loadProfiles();
    loadAppearance();
  }, [loadRepos, loadAgents, loadSessions, loadKeymap, loadLang, loadProfiles, loadAppearance]);

  // Re-apply the palette when the OS theme changes while in "system" mode.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) return;
    const onChange = () => {
      const a = useRepos.getState().appearance;
      if (a.mode === "system") applyAppearance(a);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const unlisten = onFsChange((repoPath) => {
      if (repoPath !== useRepos.getState().selected?.path) return;
      if (throttle.current) return;
      throttle.current = window.setTimeout(() => {
        throttle.current = null;
        refreshStatus();
        loadGraph();
      }, 150);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshStatus, loadGraph]);

  // Global shortcut dispatch driven by the editable keymap. Matching is on
  // physical key codes so non-Latin layouts (e.g. Cyrillic) still trigger.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let the shortcut-capture field (data-capturing) record chords itself.
      const target = e.target as HTMLElement | null;
      if (target?.dataset?.capturing) return;
      const chord = eventBinding(e);
      if (!chord) return;
      const st = useRepos.getState();
      const eff = effectiveBindings(st.keymap);
      const action = KEYMAP_ACTIONS.find((a) => eff[a.id] && eff[a.id] === chord);
      if (!action) return;
      if (action.needsRepo && !st.selected) return;
      e.preventDefault();
      st.runShortcut(action.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Suppress the webview's default right-click menu (its "Reload" item) on the
  // app chrome, but keep it on text fields so cut/copy/paste stays available.
  // Custom in-app context menus call preventDefault + stopPropagation, so they
  // never reach this listener.
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true'], [contenteditable='']")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  // Native window-menu actions (File / GitMage). The Rust side emits "menu"
  // with the item id; we dispatch to the matching action here.
  useEffect(() => {
    const un = listen<string>("menu", (e) => {
      const st = useRepos.getState();
      switch (e.payload) {
        case "open_repo":
          void pickRepo();
          break;
        case "close_repo":
          void st.closeRepo();
          break;
        case "init":
          void doInit();
          break;
        case "clone":
          st.setClone(true);
          break;
        case "settings":
          st.setSettings(true);
          break;
        case "profiles":
          st.setProfilesOpen(true);
          break;
        case "check_update":
          window.dispatchEvent(new CustomEvent("gitmage:check-update"));
          break;
        case "open_editor":
          if (st.selected) void api.openIn("editor", st.selected.path);
          break;
        case "open_terminal":
          if (st.selected) void api.openIn("terminal", st.selected.path);
          break;
        case "open_finder":
          if (st.selected) void api.openIn("finder", st.selected.path);
          break;
      }
    });
    return () => {
      un.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live agent status (from Claude Code hooks) + process exit.
  useEffect(() => {
    const onStatus = listen<{ id: string; status: string }>("agent:status", (e) =>
      setSessionStatus(e.payload.id, e.payload.status),
    );
    const onExit = listen<string>("agent:exited", (e) => setSessionStatus(e.payload, "exited"));
    return () => {
      onStatus.then((fn) => fn());
      onExit.then((fn) => fn());
    };
  }, [setSessionStatus]);

  // The repos drawer can be collapsed, but stays forced-open while no repo is
  // selected so there's always a way to open one.
  const showDrawer = reposDrawerOpen || !selected;

  return (
    <div className="app">
      <TopProgress />
      {showDrawer && <RepoSidebar />}
      {selected && <Explorer />}
      <main className="main">
        {openSessionId ? (
          <AgentSessionView sessionId={openSessionId} />
        ) : selected ? (
          <RepoView />
        ) : (
          <div className="empty">
            <Logo size={64} />
            <h1>GitMage</h1>
            <p>{t("app.tagline")}</p>
            <button className="btn empty__cta" onClick={pickRepo}>
              {t("app.openCta")}
            </button>
          </div>
        )}
      </main>
      <CommandPalette />
      <ShortcutsPanel />
      <ForgePanel />
      <SettingsPanel />
      <CloneModal />
      <ProfilesPanel />
      <Toaster />
      <UpdateBanner />
    </div>
  );
}
