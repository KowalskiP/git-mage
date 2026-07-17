import { useRepos } from "../../store/repos";
import { Icon, type IconName } from "../Icon";
import { useT } from "../../i18n/useT";

/**
 * Git network + stash actions, shown above the commit graph (GitKraken-style).
 * Icon over a text label; ahead/behind counts live on the branch in the sidebar.
 */
export function GraphActions() {
  const t = useT();
  const busy = useRepos((s) => s.busy);
  const fetch = useRepos((s) => s.fetch);
  const pull = useRepos((s) => s.pull);
  const push = useRepos((s) => s.push);
  const stashSave = useRepos((s) => s.stashSave);
  const pinnedRefs = useRepos((s) => s.pinnedRefs);
  const clearGraphFilter = useRepos((s) => s.clearGraphFilter);
  const graphScope = useRepos((s) => s.graphScope);
  const setGraphScope = useRepos((s) => s.setGraphScope);
  const graphDefaultRefs = useRepos((s) => s.graphDefaultRefs);

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
      {pinnedRefs.length > 0 ? (
        <button
          className="graph-filter-chip"
          onClick={() => clearGraphFilter()}
          title={pinnedRefs.join(", ")}
        >
          <Icon name="pin" size={13} />
          <span>{t("graph.filtered", { n: pinnedRefs.length })}</span>
          <Icon name="close" size={13} />
        </button>
      ) : (
        <button
          className={"graph-scope-chip" + (graphScope === "all" ? " graph-scope-chip--all" : "")}
          onClick={() => setGraphScope(graphScope === "compact" ? "all" : "compact")}
          disabled={!!busy}
          title={graphScope === "compact" ? t("graph.scopeCompactHint") : t("graph.scopeAllHint")}
        >
          <Icon name="branch" size={13} />
          <span>
            {graphScope === "compact"
              ? t("graph.scopeCompact", { n: graphDefaultRefs.length })
              : t("graph.scopeAll")}
          </span>
        </button>
      )}
    </div>
  );
}
