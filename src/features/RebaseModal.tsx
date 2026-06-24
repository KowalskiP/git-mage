import { useEffect, useState } from "react";
import { useRepos } from "../store/repos";
import { rebaseTodoCommits } from "../ipc/commands";
import type { RebaseCommit } from "../types/git";

type Action = "pick" | "squash" | "fixup" | "drop";

interface Row extends RebaseCommit {
  action: Action;
}

interface Props {
  repoPath: string;
  base: string;
  onClose: () => void;
}

export function RebaseModal({ repoPath, base, onClose }: Props) {
  const rebaseInteractive = useRepos((s) => s.rebaseInteractive);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    rebaseTodoCommits(repoPath, base)
      .then((items) => setRows(items.map((i) => ({ ...i, action: "pick" as Action }))))
      .catch((e) => setErr(String(e)));
  }, [repoPath, base]);

  const setAction = (idx: number, action: Action) =>
    setRows((r) => r && r.map((row, i) => (i === idx ? { ...row, action } : row)));

  const move = (idx: number, dir: -1 | 1) =>
    setRows((r) => {
      if (!r) return r;
      const j = idx + dir;
      if (j < 0 || j >= r.length) return r;
      const copy = [...r];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });

  async function start() {
    if (!rows) return;
    // The first kept (non-drop) commit must be a pick — squash/fixup need a predecessor.
    const todoRows = rows.map((r) => ({ ...r }));
    const firstKept = todoRows.findIndex((r) => r.action !== "drop");
    if (firstKept >= 0 && (todoRows[firstKept].action === "squash" || todoRows[firstKept].action === "fixup")) {
      todoRows[firstKept].action = "pick";
    }
    const todo = todoRows.map((r) => `${r.action} ${r.sha} ${r.subject}`).join("\n") + "\n";
    setBusy(true);
    await rebaseInteractive(base, todo);
    setBusy(false);
    onClose();
  }

  const allDropped = !!rows && rows.length > 0 && rows.every((r) => r.action === "drop");

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <h3>Interactive rebase</h3>
        {err && <div className="commit-err">{err}</div>}
        {!rows && !err && <div className="graph-msg">Loading…</div>}
        {rows && rows.length === 0 && <div className="graph-msg">No commits above this one.</div>}
        {rows && rows.length > 0 && (
          <ul className="rebase-list">
            {rows.map((row, i) => (
              <li
                key={row.sha}
                className={"rebase-row" + (row.action === "drop" ? " rebase-row--drop" : "")}
              >
                <span className="rebase-move">
                  <button className="link-btn" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button
                    className="link-btn"
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                </span>
                <select
                  className="rebase-action"
                  value={row.action}
                  onChange={(e) => setAction(i, e.target.value as Action)}
                >
                  <option value="pick">pick</option>
                  <option value="squash" disabled={i === 0}>
                    squash
                  </option>
                  <option value="fixup" disabled={i === 0}>
                    fixup
                  </option>
                  <option value="drop">drop</option>
                </select>
                <span className="rebase-sha">{row.sha.slice(0, 7)}</span>
                <span className="rebase-subject">{row.subject}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button className="tbtn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="tbtn tbtn--primary"
            disabled={busy || !rows || rows.length === 0 || allDropped}
            onClick={start}
          >
            {busy ? "Rebasing…" : "Start rebase"}
          </button>
        </div>
      </div>
    </div>
  );
}
