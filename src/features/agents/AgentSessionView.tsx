import { useRepos } from "../../store/repos";
import { AgentTerminal } from "./AgentTerminal";

export function AgentSessionView({ sessionId }: { sessionId: string }) {
  const session = useRepos((s) => s.sessions.find((x) => x.id === sessionId));
  const openSession = useRepos((s) => s.openSession);
  const killSession = useRepos((s) => s.killSession);

  return (
    <div className="agent-view">
      <div className="agent-view__bar">
        <span className="agent-view__title">
          {session?.agentName ?? "Agent"} · <span className="ref ref--local">{session?.branch}</span>
        </span>
        <span className={"agent-view__status agent-view__status--" + (session?.status ?? "running")}>
          {session?.status ?? "running"}
        </span>
        <div className="agent-view__actions">
          <button className="tbtn" onClick={() => openSession(null)}>
            Close
          </button>
          <button className="tbtn link-btn--danger" onClick={() => killSession(sessionId)}>
            Kill
          </button>
        </div>
      </div>
      <AgentTerminal sessionId={sessionId} />
    </div>
  );
}
