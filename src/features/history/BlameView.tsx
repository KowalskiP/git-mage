import { useEffect, useState } from "react";
import { useRepos } from "../../store/repos";
import { blame } from "../../ipc/commands";
import type { BlameLine } from "../../types/git";

const day = (t: number) => (t ? new Date(t * 1000).toLocaleDateString() : "");

/** Line-by-line blame for a file at a revision (opened from the diff header). */
export function BlameView() {
  const target = useRepos((s) => s.blameView);
  const setBlameView = useRepos((s) => s.setBlameView);
  const repoPath = useRepos((s) => s.selected?.path ?? "");
  const [lines, setLines] = useState<BlameLine[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!target || !repoPath) return;
    setLines(null);
    setErr("");
    let alive = true;
    blame(repoPath, target.file, target.rev)
      .then((l) => alive && setLines(l))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [target, repoPath]);

  if (!target) return null;
  const close = () => setBlameView(null);

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="blame" onClick={(e) => e.stopPropagation()}>
        <div className="blame__head">
          <span className="blame__title">Blame · {target.file}</span>
          <button className="diff-close" onClick={close} title="Close">
            ✕
          </button>
        </div>
        <div className="blame__body">
          {err && <div className="graph-msg error">{err}</div>}
          {!lines && !err && <div className="graph-msg">Loading…</div>}
          {lines?.map((l) => (
            <div key={l.line} className="blame__row">
              <span className="blame__sha" title={`${l.author} · ${day(l.time)}`}>{l.sha}</span>
              <span className="blame__author" title={l.author}>
                {l.author}
              </span>
              <span className="blame__ln">{l.line}</span>
              <span className="blame__code">{l.content || " "}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
