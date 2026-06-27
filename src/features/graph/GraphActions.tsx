import { useRepos } from "../../store/repos";

/**
 * Git network + stash actions, shown above the commit graph (GitKraken-style).
 * Ahead/behind counts live on the branch in the sidebar, not on these buttons.
 */
export function GraphActions() {
  const busy = useRepos((s) => s.busy);
  const fetch = useRepos((s) => s.fetch);
  const pull = useRepos((s) => s.pull);
  const push = useRepos((s) => s.push);
  const stashSave = useRepos((s) => s.stashSave);

  return (
    <div className="graph-actions">
      <button className="tbtn" onClick={() => fetch()} disabled={!!busy}>
        Fetch
      </button>
      <button className="tbtn" onClick={() => pull()} disabled={!!busy}>
        Pull
      </button>
      <button className="tbtn" onClick={() => push()} disabled={!!busy}>
        Push
      </button>
      <button className="tbtn" onClick={() => stashSave(null, false)} disabled={!!busy}>
        Stash
      </button>
    </div>
  );
}
