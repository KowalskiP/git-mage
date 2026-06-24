import { useEffect, useState } from "react";
import { useRepos } from "../store/repos";
import { conflictContent } from "../ipc/commands";

type Choice = "ours" | "theirs" | "both";

interface TextSeg {
  kind: "text";
  lines: string[];
}
interface ConflictSeg {
  kind: "conflict";
  ours: string[];
  theirs: string[];
  choice: Choice | null;
}
type Seg = TextSeg | ConflictSeg;

// Split a conflicted file into plain-text runs and conflict blocks. Handles the
// default markers and tolerates diff3 (|||||||  base) by dropping the base part.
function parse(content: string): Seg[] {
  const lines = content.split("\n");
  const segs: Seg[] = [];
  let text: string[] = [];
  const flush = () => {
    if (text.length) segs.push({ kind: "text", lines: text });
    text = [];
  };
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<<")) {
      flush();
      i++;
      const ours: string[] = [];
      while (i < lines.length && !lines[i].startsWith("=======") && !lines[i].startsWith("|||||||")) {
        ours.push(lines[i++]);
      }
      if (i < lines.length && lines[i].startsWith("|||||||")) {
        i++;
        while (i < lines.length && !lines[i].startsWith("=======")) i++;
      }
      i++; // skip =======
      const theirs: string[] = [];
      while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
        theirs.push(lines[i++]);
      }
      i++; // skip >>>>>>>
      segs.push({ kind: "conflict", ours, theirs, choice: null });
    } else {
      text.push(lines[i++]);
    }
  }
  flush();
  return segs;
}

export function ConflictEditor({
  repoPath,
  file,
  onClose,
}: {
  repoPath: string;
  file: string;
  onClose: () => void;
}) {
  const saveResolution = useRepos((s) => s.saveResolution);
  const [segs, setSegs] = useState<Seg[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    conflictContent(repoPath, file)
      .then((c) => setSegs(parse(c)))
      .catch((e) => setErr(String(e)));
  }, [repoPath, file]);

  const choose = (idx: number, choice: Choice) =>
    setSegs((s) => s && s.map((seg, i) => (i === idx && seg.kind === "conflict" ? { ...seg, choice } : seg)));

  const conflicts = (segs?.filter((s) => s.kind === "conflict") as ConflictSeg[] | undefined) ?? [];
  const allResolved = conflicts.length > 0 && conflicts.every((s) => s.choice !== null);

  async function save() {
    if (!segs) return;
    const out: string[] = [];
    for (const seg of segs) {
      if (seg.kind === "text") out.push(...seg.lines);
      else if (seg.choice === "ours") out.push(...seg.ours);
      else if (seg.choice === "theirs") out.push(...seg.theirs);
      else if (seg.choice === "both") out.push(...seg.ours, ...seg.theirs);
    }
    setBusy(true);
    await saveResolution(file, out.join("\n"));
    setBusy(false);
    onClose();
  }

  const dim = (seg: ConflictSeg, side: "ours" | "theirs") =>
    seg.choice && seg.choice !== "both" && seg.choice !== side ? " cflt-dim" : "";

  return (
    <div className="diff-overlay">
      <div className="diff-header">
        <span className="diff-title">{file}</span>
        <span className="hunk-mode">Resolve conflicts — pick a side per block</span>
        <button className="diff-close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <div className="diff-body hunk-body">
        {err && <div className="graph-msg error">{err}</div>}
        {!err && !segs && <div className="graph-msg">Loading…</div>}
        {segs &&
          segs.map((seg, i) =>
            seg.kind === "text" ? (
              seg.lines.join("").trim() === "" ? null : (
                <pre key={i} className="cflt-context">
                  {seg.lines.join("\n")}
                </pre>
              )
            ) : (
              <div key={i} className="cflt">
                <div className="cflt-actions">
                  <button
                    className={"tbtn" + (seg.choice === "ours" ? " tbtn--primary" : "")}
                    onClick={() => choose(i, "ours")}
                  >
                    Ours
                  </button>
                  <button
                    className={"tbtn" + (seg.choice === "theirs" ? " tbtn--primary" : "")}
                    onClick={() => choose(i, "theirs")}
                  >
                    Theirs
                  </button>
                  <button
                    className={"tbtn" + (seg.choice === "both" ? " tbtn--primary" : "")}
                    onClick={() => choose(i, "both")}
                  >
                    Both
                  </button>
                </div>
                <pre className={"cflt-ours" + dim(seg, "ours")}>{seg.ours.join("\n") || " "}</pre>
                <pre className={"cflt-theirs" + dim(seg, "theirs")}>{seg.theirs.join("\n") || " "}</pre>
              </div>
            ),
          )}
      </div>
      <div className="cflt-footer">
        <span className="detail-sub">
          {conflicts.filter((s) => s.choice !== null).length}/{conflicts.length} blocks resolved
        </span>
        <button className="tbtn tbtn--primary" disabled={!allResolved || busy} onClick={save}>
          {busy ? "Saving…" : "Save resolution"}
        </button>
      </div>
    </div>
  );
}
