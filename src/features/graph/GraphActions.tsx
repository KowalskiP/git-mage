import { useRepos } from "../../store/repos";
import { Icon, type IconName } from "../Icon";

/**
 * Git network + stash actions, shown above the commit graph (GitKraken-style).
 * Icon over a text label; ahead/behind counts live on the branch in the sidebar.
 */
export function GraphActions() {
  const busy = useRepos((s) => s.busy);
  const fetch = useRepos((s) => s.fetch);
  const pull = useRepos((s) => s.pull);
  const push = useRepos((s) => s.push);
  const stashSave = useRepos((s) => s.stashSave);

  const items: { name: IconName; label: string; run: () => void }[] = [
    { name: "fetch", label: "Fetch", run: () => fetch() },
    { name: "pull", label: "Pull", run: () => pull() },
    { name: "push", label: "Push", run: () => push() },
    { name: "stash", label: "Stash", run: () => stashSave(null, false) },
  ];

  return (
    <div className="graph-actions">
      {items.map((it) => (
        <button key={it.name} className="gbtn" onClick={it.run} disabled={!!busy}>
          <Icon name={it.name} size={17} />
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
