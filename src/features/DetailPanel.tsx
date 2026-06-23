import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRepos } from "../store/repos";
import { commitDetail as fetchDetail } from "../ipc/commands";
import type { CommitDetail, FileEntry } from "../types/git";
import { FileTree } from "./FileTree";

interface Props {
  onOpenFile: (file: string, sha: string, wip: boolean) => void;
  selectedFile: string | null;
}

const STATUS_TITLES: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  T: "Type changed",
};

const code = (status: string) => (status === "??" ? "U" : status[0]);

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="status-section">
      <h3>
        {title} <span className="count">{count}</span>
      </h3>
      {children}
    </section>
  );
}

function CommitBox() {
  const stagedCount = useRepos((s) => s.status?.staged.length ?? 0);
  const commit = useRepos((s) => s.commit);
  const [msg, setMsg] = useState("");
  const [amend, setAmend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canCommit = (stagedCount > 0 || amend) && msg.trim().length > 0;

  async function doCommit() {
    setBusy(true);
    setErr(null);
    try {
      await commit(msg, amend);
      setMsg("");
      setAmend(false);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="commit-box">
      <textarea
        className="commit-msg"
        placeholder="Commit message"
        value={msg}
        rows={3}
        onChange={(e) => setMsg(e.target.value)}
      />
      {err && <div className="commit-err">{err}</div>}
      <div className="commit-actions">
        <label className="amend">
          <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />
          Amend
        </label>
        <button className="btn" disabled={!canCommit || busy} onClick={doCommit}>
          {busy ? "Committing…" : amend ? "Amend commit" : `Commit ${stagedCount} file${stagedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

export function DetailPanel({ onOpenFile, selectedFile }: Props) {
  const selectedSha = useRepos((s) => s.selectedSha);
  const graph = useRepos((s) => s.graph);
  const status = useRepos((s) => s.status);
  const repo = useRepos((s) => s.selected);
  const stage = useRepos((s) => s.stage);
  const unstage = useRepos((s) => s.unstage);
  const stageAll = useRepos((s) => s.stageAll);
  const unstageAll = useRepos((s) => s.unstageAll);

  const [mode, setMode] = useState<"path" | "tree">("path");
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const row = useMemo(() => graph.find((r) => r.sha === selectedSha) ?? null, [graph, selectedSha]);
  const isWip = row?.wip ?? false;

  useEffect(() => {
    if (!repo || !selectedSha || isWip) {
      setDetail(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetchDetail(repo.path, selectedSha)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [repo, selectedSha, isWip]);

  const commitFiles = detail?.files ?? [];
  const commitGroups = useMemo(() => {
    const m = new Map<string, FileEntry[]>();
    for (const f of commitFiles) {
      const k = code(f.status);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return [...m.entries()].map(([k, files]) => ({ title: STATUS_TITLES[k] ?? k, files }));
  }, [commitFiles]);

  if (!selectedSha || !row) {
    return <div className="detail-panel detail-panel--empty">Select a commit</div>;
  }

  const onSelect = (f: string) => onOpenFile(f, selectedSha, isWip);
  const wipTotal = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;
  const headerCount = isWip ? wipTotal : commitFiles.length;

  return (
    <div className="detail-panel">
      <div className="detail-head">
        {isWip ? (
          <>
            <h3>Working Directory</h3>
            <div className="detail-sub">
              {wipTotal} uncommitted change{wipTotal === 1 ? "" : "s"}
            </div>
          </>
        ) : (
          <>
            <h3 className="detail-summary">{detail?.summary ?? row.summary}</h3>
            {detail?.body && <pre className="detail-body">{detail.body}</pre>}
            <div className="detail-meta">
              <span>{detail?.author ?? row.author}</span>
              <span className="detail-sha">{row.sha.slice(0, 7)}</span>
            </div>
            {detail && (
              <div className="detail-sub">
                {new Date(detail.time * 1000).toLocaleString()}
                {detail.parents[0] ? ` · parent ${detail.parents[0].slice(0, 7)}` : ""}
              </div>
            )}
          </>
        )}
      </div>

      <div className="detail-toolbar">
        {isWip ? (
          <div className="bulk">
            <button className="link-btn" onClick={() => stageAll()}>
              Stage all
            </button>
            <button className="link-btn" onClick={() => unstageAll()}>
              Unstage all
            </button>
          </div>
        ) : (
          <span className="detail-count">
            {headerCount} file{headerCount === 1 ? "" : "s"}
          </span>
        )}
        <div className="seg">
          <button
            className={"seg__btn" + (mode === "path" ? " seg__btn--on" : "")}
            onClick={() => setMode("path")}
          >
            Path
          </button>
          <button
            className={"seg__btn" + (mode === "tree" ? " seg__btn--on" : "")}
            onClick={() => setMode("tree")}
          >
            Tree
          </button>
        </div>
      </div>

      <div className="detail-files">
        {loading ? (
          <div className="graph-msg">Loading…</div>
        ) : isWip ? (
          <>
            <Section title="Staged" count={status?.staged.length ?? 0}>
              <FileTree
                files={status?.staged ?? []}
                mode={mode}
                selected={selectedFile}
                onSelect={onSelect}
                action="unstage"
                onAction={(f) => unstage([f])}
              />
            </Section>
            <Section title="Unstaged" count={status?.unstaged.length ?? 0}>
              <FileTree
                files={status?.unstaged ?? []}
                mode={mode}
                selected={selectedFile}
                onSelect={onSelect}
                action="stage"
                onAction={(f) => stage([f])}
              />
            </Section>
            <Section title="Untracked" count={status?.untracked.length ?? 0}>
              <FileTree
                files={status?.untracked ?? []}
                mode={mode}
                selected={selectedFile}
                onSelect={onSelect}
                action="stage"
                onAction={(f) => stage([f])}
              />
            </Section>
            {wipTotal === 0 && <div className="clean">✓ Working tree clean</div>}
          </>
        ) : mode === "tree" ? (
          <FileTree files={commitFiles} mode="tree" selected={selectedFile} onSelect={onSelect} />
        ) : (
          <>
            {commitGroups.map((g) => (
              <Section key={g.title} title={g.title} count={g.files.length}>
                <FileTree files={g.files} mode="path" selected={selectedFile} onSelect={onSelect} />
              </Section>
            ))}
            {commitFiles.length === 0 && <div className="filetree-empty">No files</div>}
          </>
        )}
      </div>

      {isWip && <CommitBox />}
    </div>
  );
}
