import { useRepos } from "../../store/repos";
import type { FileEntry } from "../../types/git";

function FileRow({ entry }: { entry: FileEntry }) {
  return (
    <li className="file-row">
      <span className={"file-row__code code-" + entry.status.replace("?", "q")}>
        {entry.status}
      </span>
      <span className="file-row__path">{entry.path}</span>
    </li>
  );
}

function Section({ title, files }: { title: string; files: FileEntry[] }) {
  if (files.length === 0) return null;
  return (
    <section className="status-section">
      <h3>
        {title} <span className="count">{files.length}</span>
      </h3>
      <ul className="file-list">
        {files.map((f) => (
          <FileRow key={f.path} entry={f} />
        ))}
      </ul>
    </section>
  );
}

export function StatusPanel() {
  const { selected, status, refreshStatus, error } = useRepos();
  if (!selected) return null;

  const clean =
    status &&
    status.staged.length === 0 &&
    status.unstaged.length === 0 &&
    status.untracked.length === 0;

  return (
    <div className="status-panel">
      <header className="status-panel__header">
        <div>
          <h2>{selected.alias ?? selected.name}</h2>
          <div className="branch">
            {status?.branch ?? "…"}
            {status?.upstream && <span className="upstream"> → {status.upstream}</span>}
          </div>
        </div>
        <button className="btn" onClick={refreshStatus}>
          Refresh
        </button>
      </header>

      <div className="path">{selected.path}</div>

      {error && <div className="error">{error}</div>}

      {status && (
        <div className="status-body">
          <Section title="Staged" files={status.staged} />
          <Section title="Unstaged" files={status.unstaged} />
          <Section title="Untracked" files={status.untracked} />
          {clean && <div className="clean">✓ Working tree clean</div>}
        </div>
      )}
    </div>
  );
}
