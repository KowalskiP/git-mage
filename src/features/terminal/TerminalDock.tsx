import { useEffect, useState } from "react";
import { useRepos } from "../../store/repos";
import { terminalKill, terminalList, terminalOpen } from "../../ipc/commands";
import type { TermSession } from "../../types/git";
import { TermView } from "./TermView";

/**
 * Bottom dock of embedded shells (SPEC §M5). Hiding the dock unmounts the
 * xterm views but leaves the backend pty sessions running; reopening restores
 * them from `terminal_list` and re-primes scrollback from each session buffer.
 * Visibility is toggled from the toolbar via `showTerminal`.
 */
export function TerminalDock() {
  const selected = useRepos((s) => s.selected);
  const show = useRepos((s) => s.showTerminal);
  const toggle = useRepos((s) => s.toggleTerminal);

  const [sessions, setSessions] = useState<TermSession[]>([]);
  const [active, setActive] = useState<string | null>(null);

  const repoPath = selected?.path ?? null;

  // Restore any backend sessions on mount (survives HMR / re-open).
  useEffect(() => {
    terminalList()
      .then((list) => {
        if (list.length) {
          setSessions(list);
          setActive((a) => a ?? list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  async function newTab() {
    if (!repoPath) return;
    const n = sessions.length + 1;
    try {
      const s = await terminalOpen(repoPath, `shell ${n}`);
      setSessions((prev) => [...prev, s]);
      setActive(s.id);
    } catch {
      /* surfaced by shell exit message */
    }
  }

  async function closeTab(id: string) {
    await terminalKill(id).catch(() => {});
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setActive((cur) => (cur === id ? next[next.length - 1]?.id ?? null : cur));
      return next;
    });
  }

  // Opening the dock with no shells yet spawns the first one.
  useEffect(() => {
    if (show && sessions.length === 0 && repoPath) {
      void newTab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, repoPath]);

  if (!show) return null;

  return (
    <div className="term-dock">
      <div className="term-tabs">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={"term-tab" + (s.id === active ? " term-tab--on" : "")}
            onClick={() => setActive(s.id)}
          >
            <span className="term-tab__label">{s.title}</span>
            <button
              className="term-tab__close"
              title="Close terminal"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(s.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="term-tab__new" title="New terminal" onClick={newTab}>
          +
        </button>
        <div className="term-tabs__spacer" />
        <button className="term-tab__new" title="Hide terminal" onClick={toggle}>
          ▾
        </button>
      </div>
      <div className="term-stack">
        {sessions.length === 0 && <div className="term-empty">No terminals — press + to open one.</div>}
        {sessions.map((s) => (
          <div
            key={s.id}
            className="term-pane"
            style={{ display: s.id === active ? "block" : "none" }}
          >
            <TermView sessionId={s.id} visible={show && s.id === active} />
          </div>
        ))}
      </div>
    </div>
  );
}
