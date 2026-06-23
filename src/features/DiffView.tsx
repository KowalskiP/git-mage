interface Props {
  title: string;
  diff: string;
  loading: boolean;
  onClose: () => void;
}

function lineClass(ln: string): string {
  if (ln.startsWith("+++") || ln.startsWith("---")) return "dl dl-meta";
  if (ln.startsWith("@@")) return "dl dl-hunk";
  if (
    ln.startsWith("diff ") ||
    ln.startsWith("index ") ||
    ln.startsWith("new file") ||
    ln.startsWith("deleted file") ||
    ln.startsWith("similarity ") ||
    ln.startsWith("rename ")
  )
    return "dl dl-meta";
  if (ln.startsWith("+")) return "dl dl-add";
  if (ln.startsWith("-")) return "dl dl-del";
  return "dl";
}

export function DiffView({ title, diff, loading, onClose }: Props) {
  const lines = diff.split("\n");
  return (
    <div className="diff-overlay">
      <div className="diff-header">
        <span className="diff-title">{title}</span>
        <button className="diff-close" onClick={onClose} title="Close diff">
          ✕
        </button>
      </div>
      <div className="diff-body">
        {loading ? (
          <div className="graph-msg">Loading diff…</div>
        ) : diff.trim() === "" ? (
          <div className="graph-msg">No textual changes (binary file or no diff).</div>
        ) : (
          <pre className="diff-pre">
            {lines.map((ln, i) => (
              <div key={i} className={lineClass(ln)}>
                {ln || " "}
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
