import { useState } from "react";
import { useRepos } from "../../store/repos";
import { statusLabel } from "./status";

export function AgentsPanel() {
  const agents = useRepos((s) => s.agents);
  const worktrees = useRepos((s) => s.worktrees);
  const selected = useRepos((s) => s.selected);
  const sessions = useRepos((s) => s.sessions);
  const newSession = useRepos((s) => s.newSession);
  const killSession = useRepos((s) => s.killSession);
  const openSession = useRepos((s) => s.openSession);
  const openSessionId = useRepos((s) => s.openSessionId);
  const busy = useRepos((s) => s.busy);

  const available = agents.filter((a) => a.available);
  const [agentId, setAgentId] = useState("");
  const [branch, setBranch] = useState("");

  if (!selected) {
    return <div className="agents-hint agents-hint--pad">Select a repository to manage agent sessions.</div>;
  }

  const effectiveAgent = agentId || available[0]?.id || "";
  const canStart = !!effectiveAgent && branch.trim().length > 0 && !busy;

  async function start() {
    if (!canStart) return;
    const b = branch.trim();
    setBranch("");
    await newSession(effectiveAgent, b);
  }

  return (
    <div className="agents-panel">
      <div className="agents-section">
        <h3>New agent session</h3>
        {available.length === 0 ? (
          <div className="agents-hint">No agent CLIs found on PATH.</div>
        ) : (
          <div className="new-session">
            <select
              className="rebase-action"
              value={effectiveAgent}
              onChange={(e) => setAgentId(e.target.value)}
            >
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              className="new-branch__input"
              placeholder="new branch name"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start()}
            />
            <button className="tbtn tbtn--primary" disabled={!canStart} onClick={start}>
              Start
            </button>
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="agents-section">
          <h3>Sessions ({sessions.length})</h3>
          <ul className="session-list">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={"session-row" + (s.id === openSessionId ? " session-row--active" : "")}
                onClick={() => openSession(s.id)}
              >
                <span className={"session-dot session-dot--" + s.status} />
                <span className="session-info">
                  <span className="session-branch">{s.branch}</span>
                  <span className="session-agent">
                    {s.agentName} · {statusLabel(s.status)}
                  </span>
                </span>
                <button
                  className="link-btn link-btn--danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    killSession(s.id);
                  }}
                >
                  Kill
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
              <div className="wt-card__meta">
                {w.ahead > 0 && <span>↑{w.ahead}</span>}
                {w.behind > 0 && <span>↓{w.behind}</span>}
                <span>{w.changes > 0 ? `${w.changes} uncommitted` : "clean"}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
