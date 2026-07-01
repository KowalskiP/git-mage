import { useEffect, useState } from "react";
import { useRepos } from "../../store/repos";
import { fileHistory } from "../../ipc/commands";
import { useT } from "../../i18n/useT";
import type { FileLog } from "../../types/git";

/** Commits that touched a file; jump to one in the graph or blame it. */
export function FileHistoryView() {
  const t = useT();
  const target = useRepos((s) => s.historyView);
  const setHistoryView = useRepos((s) => s.setHistoryView);
  const setBlameView = useRepos((s) => s.setBlameView);
  const selectNode = useRepos((s) => s.selectNode);
  const graph = useRepos((s) => s.graph);
  const repoPath = useRepos((s) => s.selected?.path ?? "");
  const [log, setLog] = useState<FileLog[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!target || !repoPath) return;
    setLog(null);
    setErr("");
    let alive = true;
    fileHistory(repoPath, target.file, target.rev, 200)
      .then((l) => alive && setLog(l))
      .catch((e) => alive && setErr(String(e)));
    return () => {
      alive = false;
    };
  }, [target, repoPath]);

  if (!target) return null;
  const close = () => setHistoryView(null);

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="fhist" onClick={(e) => e.stopPropagation()}>
        <div className="fhist__head">
          <span className="fhist__title">
            {t("diff.history")} · {target.file}
          </span>
          <button className="diff-close" onClick={close} title="Close">
            ✕
          </button>
        </div>
        <div className="fhist__body">
          {err && <div className="graph-msg error">{err}</div>}
          {!log && !err && <div className="graph-msg">{t("common.loading")}</div>}
          {log && log.length === 0 && <div className="graph-msg">{t("hist.none")}</div>}
          {log?.map((c) => {
            const inGraph = graph.some((r) => r.sha === c.sha);
            return (
              <div key={c.sha} className="fhist__row">
                <button
                  className="fhist__open"
                  disabled={!inGraph}
                  title={inGraph ? "Show in graph" : "Not in the loaded graph"}
                  onClick={() => {
                    selectNode(c.sha);
                    close();
                  }}
                >
                  <span className="fhist__sha">{c.sha.slice(0, 7)}</span>
                  <span className="fhist__summary">{c.summary}</span>
                  <span className="fhist__meta">
                    {c.author} · {new Date(c.time * 1000).toLocaleDateString()}
                  </span>
                </button>
                <button
                  className="link-btn"
                  onClick={() => {
                    setHistoryView(null);
                    setBlameView({ file: target.file, rev: c.sha });
                  }}
                >
                  Blame
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
