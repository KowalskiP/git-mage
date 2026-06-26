import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useRepos } from "./store/repos";
import { onFsChange } from "./ipc/events";
import { RepoSidebar } from "./features/repos/RepoSidebar";
import { RepoView } from "./features/RepoView";
import { AgentSessionView } from "./features/agents/AgentSessionView";
import { CommandPalette } from "./features/palette/CommandPalette";
import { ShortcutsPanel } from "./features/shortcuts/ShortcutsPanel";
import { ForgePanel } from "./features/forge/ForgePanel";
import { eventBinding, effectiveBindings, KEYMAP_ACTIONS } from "./lib/keymap";

export function App() {
  const loadRepos = useRepos((s) => s.loadRepos);
  const loadAgents = useRepos((s) => s.loadAgents);
  const loadSessions = useRepos((s) => s.loadSessions);
  const loadKeymap = useRepos((s) => s.loadKeymap);
  const setSessionStatus = useRepos((s) => s.setSessionStatus);
  const refreshStatus = useRepos((s) => s.refreshStatus);
  const loadGraph = useRepos((s) => s.loadGraph);
  const selected = useRepos((s) => s.selected);
  const openSessionId = useRepos((s) => s.openSessionId);

  // Throttle fs-change-driven refreshes (SPEC NFR: refresh ≤100ms, but coalesce bursts).
  const throttle = useRef<number | null>(null);

  useEffect(() => {
    loadRepos();
    loadAgents();
    loadSessions();
    loadKeymap();
  }, [loadRepos, loadAgents, loadSessions, loadKeymap]);

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

  return (
    <div className="app">
      <RepoSidebar />
      <main className="main">
        {openSessionId ? (
          <AgentSessionView sessionId={openSessionId} />
        ) : selected ? (
          <RepoView />
        ) : (
          <div className="empty">
            <h1>GitMage</h1>
            <p>Open a repository to begin.</p>
          </div>
        )}
      </main>
      <CommandPalette />
      <ShortcutsPanel />
      <ForgePanel />
    </div>
  );
}
