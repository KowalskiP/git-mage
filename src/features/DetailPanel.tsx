import { useEffect, useMemo, useState } from "react";
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

function FileSection({
  title,
  files,
  selected,
  onSelect,
}: {
  title: string;
  files: FileEntry[];
  selected: string | null;
  onSelect: (p: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <section className="status-section">
      <h3>
        {title} <span className="count">{files.length}</span>
      </h3>
      <ul className="file-list">
        {files.map((f) => (
          <li
            key={f.path}
            className={"file-row file-row--btn" + (f.path === selected ? " file-row--active" : "")}
            onClick={() => onSelect(f.path)}
            title={f.path}
          >
            <span className={"fstat fstat-" + code(f.status)}>{code(f.status)}</span>
            <span className="file-row__path">{f.path}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DetailPanel({ onOpenFile, selectedFile }: Props) {
  const selectedSha = useRepos((s) => s.selectedSha);
  const graph = useRepos((s) => s.graph);
  const status = useRepos((s) => s.status);
  const repo = useRepos((s) => s.selected);

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

  const allFiles: FileEntry[] = useMemo(() => {
    if (isWip) {
      if (!status) return [];
      const map = new Map<string, FileEntry>();
      for (const f of status.staged) map.set(f.path, f);
      for (const f of status.unstaged) map.set(f.path, f);
      for (const f of status.untracked) map.set(f.path, f);
      return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
    }
    return detail?.files ?? [];
  }, [isWip, status, detail]);

  const commitGroups = useMemo(() => {
    const m = new Map<string, FileEntry[]>();
    for (const f of detail?.files ?? []) {
      const k = code(f.status);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return [...m.entries()].map(([k, files]) => ({ title: STATUS_TITLES[k] ?? k, files }));
  }, [detail]);

  if (!selectedSha || !row) {
    return <div className="detail-panel detail-panel--empty">Select a commit</div>;
  }

  const total = allFiles.length;
  const onSelect = (f: string) => onOpenFile(f, selectedSha, isWip);

  return (
    <div className="detail-panel">
      <div className="detail-head">
        {isWip ? (
          <>
            <h3>Working Directory</h3>
            <div className="detail-sub">
              {total} uncommitted change{total === 1 ? "" : "s"}
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
        <span className="detail-count">
          {total} file{total === 1 ? "" : "s"}
        </span>
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
        ) : mode === "tree" ? (
          <FileTree files={allFiles} mode="tree" selected={selectedFile} onSelect={onSelect} />
        ) : isWip ? (
          <>
            <FileSection title="Staged" files={status?.staged ?? []} selected={selectedFile} onSelect={onSelect} />
            <FileSection title="Unstaged" files={status?.unstaged ?? []} selected={selectedFile} onSelect={onSelect} />
            <FileSection title="Untracked" files={status?.untracked ?? []} selected={selectedFile} onSelect={onSelect} />
            {total === 0 && <div className="clean">✓ Working tree clean</div>}
          </>
        ) : (
          <>
            {commitGroups.map((g) => (
              <FileSection
                key={g.title}
                title={g.title}
                files={g.files}
                selected={selectedFile}
                onSelect={onSelect}
              />
            ))}
            {total === 0 && <div className="filetree-empty">No files</div>}
          </>
        )}
      </div>
    </div>
  );
}
