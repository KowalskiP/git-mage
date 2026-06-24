import { useCallback, useEffect, useState } from "react";
import { useRepos } from "../store/repos";
import { fileHunks } from "../ipc/commands";
import type { Hunk } from "../types/git";

interface Props {
  repoPath: string;
  file: string;
  /** True when viewing the staged side (buttons unstage); false stages. */
  staged: boolean;
  onClose: () => void;
}

function lineClass(ln: string): string {
  if (ln.startsWith("+")) return "dl dl-add";
  if (ln.startsWith("-")) return "dl dl-del";
  return "dl";
}

export function HunkView({ repoPath, file, staged, onClose }: Props) {
  const [hunks, setHunks] = useState<Hunk[] | null>(null);
  const [err, setErr] = useState("");
  const stageHunk = useRepos((s) => s.stageHunk);
  const unstageHunk = useRepos((s) => s.unstageHunk);
  const stageFile = useRepos((s) => s.stage);

  const load = useCallback(() => {
    setHunks(null);
    setErr("");
    fileHunks(repoPath, file, staged)
      .then(setHunks)
      .catch((e) => setErr(String(e)));
  }, [repoPath, file, staged]);

  useEffect(() => {
    load();
  }, [load]);

  async function apply(patch: string) {
    if (staged) await unstageHunk(patch);
    else await stageHunk(patch);
    load();
  }

  return (
    <div className="diff-overlay">
      <div className="diff-header">
        <span className="diff-title">{file}</span>
        <span className="hunk-mode">{staged ? "Staged — unstage hunks" : "Unstaged — stage hunks"}</span>
        <button className="diff-close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <div className="diff-body hunk-body">
        {err && <div className="graph-msg error">{err}</div>}
        {!err && hunks === null && <div className="graph-msg">Loading…</div>}
        {!err && hunks && hunks.length === 0 && (
          <div className="hunk-empty">
            <div>{staged ? "No staged hunks in this file." : "No unstaged hunks (new/untracked or fully staged)."}</div>
            {!staged && (
              <button
                className="tbtn tbtn--primary"
                onClick={async () => {
                  await stageFile([file]);
                  onClose();
                }}
              >
                Stage entire file
              </button>
            )}
          </div>
        )}
        {!err &&
          hunks &&
          hunks.map((h, i) => (
            <div className="hunk" key={i}>
              <div className="hunk__head">
                <span className="hunk__hdr">{h.header}</span>
                <button className="tbtn" onClick={() => apply(h.patch)}>
                  {staged ? "Unstage hunk" : "Stage hunk"}
                </button>
              </div>
              <pre className="hunk__lines">
                {h.lines.map((ln, j) => (
                  <div key={j} className={lineClass(ln)}>
                    {ln || " "}
                  </div>
                ))}
              </pre>
            </div>
          ))}
      </div>
    </div>
  );
}
