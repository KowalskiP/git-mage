import { useRepos } from "../../store/repos";

export function AgentsPanel() {
  const agents = useRepos((s) => s.agents);
  const worktrees = useRepos((s) => s.worktrees);
  const selected = useRepos((s) => s.selected);

  if (!selected) {
    return <div className="agents-hint agents-hint--pad">Select a repository to manage agent sessions.</div>;
  }

  const available = agents.filter((a) => a.available).length;

  return (
    <div className="agents-panel">
      <div className="agents-section">
        <h3>Agents detected</h3>
        <ul className="agent-list">
          {agents.map((a) => (
            <li
              key={a.id}
              className={"agent-chip" + (a.available ? " agent-chip--on" : "")}
              title={a.path ?? "not installed"}
            >
              <span className="agent-dot" />
              {a.name}
            </li>
          ))}
        </ul>
        {agents.length > 0 && available === 0 && (
          <div className="agents-hint">No agent CLIs found on PATH.</div>
        )}
      </div>

      <div className="agents-section">
        <h3>Worktrees ({worktrees.length})</h3>
        <ul className="wt-cards">
          {worktrees.map((w) => (
            <li key={w.path} className="wt-card">
              <div className="wt-card__top">
                <span className="wt-card__branch">{w.branch ?? w.head.slice(0, 7)}</span>
                {w.isMain && <span className="wt-tag">main</span>}
                {w.locked && <span className="wt-tag">🔒</span>}
              </div>
              <div className="wt-card__path" title={w.path}>
                {w.path}
              </div>
            </li>
          ))}
        </ul>
        <div className="agents-hint">
          Launching an agent in a worktree (pty + live status) is the next step.
        </div>
      </div>
    </div>
  );
}
