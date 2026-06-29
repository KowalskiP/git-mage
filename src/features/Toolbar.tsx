import { useRepos } from "../store/repos";
import { useT } from "../i18n/useT";
import { Icon } from "./Icon";

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

      <button className="gbtn" onClick={() => setPalette(true)} title="Command palette (⌘K)">
        <Icon name="palette" size={17} />
        <span>⌘K</span>
      </button>

      <button className="gbtn" onClick={() => setSettings(true)} title={t("toolbar.settings")}>
        <Icon name="settings" size={17} />
        <span>{t("toolbar.settings")}</span>
      </button>

      <button
        className={"gbtn" + (showTerminal ? " gbtn--on" : "")}
        onClick={toggleTerminal}
        title="Toggle embedded terminal"
      >
        <Icon name="terminal" size={17} />
        <span>Terminal</span>
      </button>
    </div>
  );
}
