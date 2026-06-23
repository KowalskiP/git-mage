import { useEffect, useRef } from "react";
import { useRepos } from "./store/repos";
import { onFsChange } from "./ipc/events";
import { RepoSidebar } from "./features/repos/RepoSidebar";
import { StatusPanel } from "./features/status/StatusPanel";

export function App() {
  const loadRepos = useRepos((s) => s.loadRepos);
  const refreshStatus = useRepos((s) => s.refreshStatus);
  const selected = useRepos((s) => s.selected);

  // Throttle fs-change-driven refreshes (SPEC NFR: refresh ≤100ms, but coalesce bursts).
  const throttle = useRef<number | null>(null);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  useEffect(() => {
    const unlisten = onFsChange((repoPath) => {
      if (repoPath !== useRepos.getState().selected?.path) return;
      if (throttle.current) return;
      throttle.current = window.setTimeout(() => {
        throttle.current = null;
        refreshStatus();
      }, 120);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshStatus]);

  return (
    <div className="app">
      <RepoSidebar />
      <main className="main">
        {selected ? (
          <StatusPanel />
        ) : (
          <div className="empty">
            <h1>GitMage</h1>
            <p>Open a repository to begin.</p>
          </div>
        )}
      </main>
    </div>
  );
}
