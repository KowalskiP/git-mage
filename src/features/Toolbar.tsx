import { useRepos } from "../store/repos";
import { useT } from "../i18n/useT";

/**
 * Lean top bar. Branch switching, remotes, stashes, worktrees, PRs etc. now
 * live in the explorer sidebar; fetch/pull/push/stash sit above the graph. What
 * remains here is global chrome: busy state, command palette, settings, terminal.
 */
export function Toolbar() {
  const t = useT();
  const busy = useRepos((s) => s.busy);
  const showTerminal = useRepos((s) => s.showTerminal);
  const toggleTerminal = useRepos((s) => s.toggleTerminal);
  const setPalette = useRepos((s) => s.setPalette);
  const setSettings = useRepos((s) => s.setSettings);

  return (
    <div className="toolbar">
      <div className="toolbar__spacer" />

      {busy && <span className="toolbar__busy">{busy}</span>}

      <button className="tbtn" onClick={() => setPalette(true)} title="Command palette (⌘K)">
        ⌘K
      </button>

      <button className="tbtn" onClick={() => setSettings(true)} title={t("toolbar.settings")}>
        ⚙
      </button>

      <button
        className={"tbtn" + (showTerminal ? " tbtn--on" : "")}
        onClick={toggleTerminal}
        title="Toggle embedded terminal"
      >
        Terminal
      </button>
    </div>
  );
}
