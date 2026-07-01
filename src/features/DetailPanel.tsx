import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRepos } from "../store/repos";
import { commitDetail as fetchDetail } from "../ipc/commands";
import type { CommitDetail, FileEntry } from "../types/git";
import { FileTree } from "./FileTree";
import { useT } from "../i18n/useT";

interface Props {
  onOpenFile: (file: string, sha: string, wip: boolean, staged: boolean) => void;
  onOpenConflict: (file: string) => void;
  selectedFile: string | null;
}

const STATUS_KEY: Record<string, string> = {
  M: "status.modified",
  A: "status.added",
  D: "status.deleted",
  R: "status.renamed",
  C: "status.copied",
  T: "status.typeChanged",
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

export function DetailPanel({ onOpenFile, onOpenConflict, selectedFile }: Props) {
  const t = useT();
  const selectedSha = useRepos((s) => s.selectedSha);
  const graph = useRepos((s) => s.graph);
  const status = useRepos((s) => s.status);
  const repo = useRepos((s) => s.selected);
  const stage = useRepos((s) => s.stage);
  const unstage = useRepos((s) => s.unstage);
  const stageAll = useRepos((s) => s.stageAll);
  const unstageAll = useRepos((s) => s.unstageAll);
  const resolveConflict = useRepos((s) => s.resolveConflict);
  const mergeContinue = useRepos((s) => s.mergeContinue);
  const mergeAbort = useRepos((s) => s.mergeAbort);
  const rebaseContinue = useRepos((s) => s.rebaseContinue);
  const rebaseAbort = useRepos((s) => s.rebaseAbort);
  const sequencerContinue = useRepos((s) => s.sequencerContinue);
  const sequencerAbort = useRepos((s) => s.sequencerAbort);

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
    return [...m.entries()].map(([k, files]) => ({
      title: STATUS_KEY[k] ? t(STATUS_KEY[k]) : k,
      files,
    }));
  }, [commitFiles, t]);

  if (!selectedSha || !row) {
    return <div className="detail-panel detail-panel--empty">{t("detail.selectCommit")}</div>;
  }

  const openUnstaged = (f: string) => onOpenFile(f, selectedSha, isWip, false);
  const openStaged = (f: string) => onOpenFile(f, selectedSha, isWip, true);
  const wipTotal = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;
  const headerCount = isWip ? wipTotal : commitFiles.length;
  const conflicted = status?.conflicted ?? [];
  const mergeInProgress = status?.mergeInProgress ?? false;
  const rebaseInProgress = status?.rebaseInProgress ?? false;
  const sequencer = status?.sequencer ?? "";
  const opInProgress = mergeInProgress || rebaseInProgress || !!sequencer;
  const opLabel = sequencer || (rebaseInProgress ? "Rebase" : "Merge");
  const opContinue = sequencer
    ? sequencerContinue
    : rebaseInProgress
      ? rebaseContinue
      : mergeContinue;
  const opAbort = sequencer ? sequencerAbort : rebaseInProgress ? rebaseAbort : mergeAbort;
  const opContinueLabel = sequencer
    ? `Continue ${sequencer}`
    : rebaseInProgress
      ? "Continue rebase"
      : "Commit merge";

  return (
    <div className="detail-panel">
      <div className="detail-head">
        {isWip ? (
          <>
            <h3>{t("detail.workingDir")}</h3>
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
              {detail?.signature && (
                <span
                  className={"sig-badge sig-badge--" + detail.signature}
                  title={
                    (detail.signer ? `Signed by ${detail.signer}` : "Signed") +
                    ` · signature ${detail.signature}`
                  }
                >
                  {detail.signature === "good" ? "🔏 Signed" : `🔏 ${detail.signature}`}
                </span>
              )}
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
            {t("detail.path")}
          </button>
          <button
            className={"seg__btn" + (mode === "tree" ? " seg__btn--on" : "")}
            onClick={() => setMode("tree")}
          >
            {t("detail.tree")}
          </button>
        </div>
      </div>

      {isWip && opInProgress && (
        <div className="merge-banner">
          <span className="merge-banner__label">
            {opLabel} in progress
            {conflicted.length > 0
              ? ` — ${conflicted.length} conflict${conflicted.length === 1 ? "" : "s"} left`
              : " — all resolved"}
          </span>
          <div className="merge-banner__actions">
            <button className="tbtn" onClick={() => opAbort()}>
              Abort
            </button>
            <button
              className="tbtn tbtn--primary"
              disabled={conflicted.length > 0}
              onClick={() => opContinue()}
            >
              {opContinueLabel}
            </button>
          </div>
        </div>
      )}

      <div className="detail-files">
        {loading ? (
          <div className="graph-msg">{t("common.loading")}</div>
        ) : isWip ? (
          <>
            {conflicted.length > 0 && (
              <section className="status-section">
                <h3>
                  Conflicted <span className="count count--danger">{conflicted.length}</span>
                </h3>
                <ul className="file-list">
                  {conflicted.map((f) => (
                    <li
                      key={f.path}
                      className={"file-row" + (f.path === selectedFile ? " file-row--active" : "")}
                      title={f.path}
                    >
                      <span className="fstat fstat-D">!</span>
                      <span className="file-row__path" onClick={() => onOpenConflict(f.path)}>
                        {f.path}
                      </span>
                      <span className="conflict-actions">
                        <button className="link-btn" onClick={() => resolveConflict(f.path, true)}>
                          ours
                        </button>
                        <button className="link-btn" onClick={() => resolveConflict(f.path, false)}>
                          theirs
                        </button>
                        <button
                          className="link-btn"
                          title="Mark resolved"
                          onClick={() => stage([f.path])}
                        >
                          ✓
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <Section title="Staged" count={status?.staged.length ?? 0}>
              <FileTree
                files={status?.staged ?? []}
                mode={mode}
                selected={selectedFile}
                onSelect={openStaged}
                action="unstage"
                onAction={(f) => unstage([f])}
              />
            </Section>
            <Section title="Unstaged" count={status?.unstaged.length ?? 0}>
              <FileTree
                files={status?.unstaged ?? []}
                mode={mode}
                selected={selectedFile}
                onSelect={openUnstaged}
                action="stage"
                onAction={(f) => stage([f])}
              />
            </Section>
            <Section title="Untracked" count={status?.untracked.length ?? 0}>
              <FileTree
                files={status?.untracked ?? []}
                mode={mode}
                selected={selectedFile}
                onSelect={openUnstaged}
                action="stage"
                onAction={(f) => stage([f])}
              />
            </Section>
            {wipTotal === 0 && <div className="clean">✓ Working tree clean</div>}
          </>
        ) : mode === "tree" ? (
          <FileTree files={commitFiles} mode="tree" selected={selectedFile} onSelect={openUnstaged} />
        ) : (
          <>
            {commitGroups.map((g) => (
              <Section key={g.title} title={g.title} count={g.files.length}>
                <FileTree files={g.files} mode="path" selected={selectedFile} onSelect={openUnstaged} />
              </Section>
            ))}
            {commitFiles.length === 0 && <div className="filetree-empty">{t("detail.noFiles")}</div>}
          </>
        )}
      </div>

      {isWip && <CommitBox />}
    </div>
  );
}
