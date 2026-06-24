import { useEffect, useRef } from "react";
import { useRepos } from "./store/repos";
import { onFsChange } from "./ipc/events";
import { RepoSidebar } from "./features/repos/RepoSidebar";
import { RepoView } from "./features/RepoView";

export function App() {
  const loadRepos = useRepos((s) => s.loadRepos);
  const loadAgents = useRepos((s) => s.loadAgents);
  const refreshStatus = useRepos((s) => s.refreshStatus);
  const loadGraph = useRepos((s) => s.loadGraph);
  const selected = useRepos((s) => s.selected);

  // Throttle fs-change-driven refreshes (SPEC NFR: refresh ≤100ms, but coalesce bursts).
  const throttle = useRef<number | null>(null);

  useEffect(() => {
    loadRepos();
    loadAgents();
  }, [loadRepos, loadAgents]);

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

  return (
    <div className="app">
      <RepoSidebar />
      <main className="main">
        {selected ? (
          <RepoView />
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
