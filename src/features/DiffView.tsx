import { useEffect, useRef, useState } from "react";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorView, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { diffSides } from "../ipc/commands";
import type { DiffSides } from "../types/git";

interface Props {
  repoPath: string;
  sha: string;
  file: string;
  onClose: () => void;
}

type State = "loading" | "ready" | "binary" | "error";
type Mode = "split" | "inline";

const readOnly = [
  EditorView.editable.of(false),
  EditorState.readOnly.of(true),
  lineNumbers(),
  EditorView.lineWrapping,
  oneDark,
  EditorView.theme({ "&": { fontSize: "12px" } }),
];

const collapse = { margin: 3, minSize: 4 };

export function DiffView({ repoPath, sha, file, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>("loading");
  const [data, setData] = useState<DiffSides | null>(null);
  const [mode, setMode] = useState<Mode>("split");
  const [err, setErr] = useState("");

  // Fetch the two sides whenever the target file changes.
  useEffect(() => {
    let alive = true;
    setState("loading");
    setData(null);
    diffSides(repoPath, sha, file)
      .then((d) => {
        if (!alive) return;
        if (d.binary) setState("binary");
        else {
          setData(d);
          setState("ready");
        }
      })
      .catch((e) => {
        if (alive) {
          setErr(String(e));
          setState("error");
        }
      });
    return () => {
      alive = false;
    };
  }, [repoPath, sha, file]);

  // (Re)build the CodeMirror view when the data or the mode changes.
  useEffect(() => {
    if (state !== "ready" || !data || !hostRef.current) return;
    const host = hostRef.current;
    host.innerHTML = "";
    let cm: { destroy(): void };
    if (mode === "split") {
      cm = new MergeView({
        a: { doc: data.oldText, extensions: readOnly },
        b: { doc: data.newText, extensions: readOnly },
        parent: host,
        gutter: true,
        highlightChanges: true,
        collapseUnchanged: collapse,
      });
    } else {
      cm = new EditorView({
        doc: data.newText,
        parent: host,
        extensions: [
          ...readOnly,
          unifiedMergeView({
            original: data.oldText,
            mergeControls: false,
            gutter: true,
            collapseUnchanged: collapse,
          }),
        ],
      });
    }
    return () => cm.destroy();
  }, [state, data, mode]);

  return (
    <div className="diff-overlay">
      <div className="diff-header">
        <span className="diff-title">{file}</span>
        <div className="seg seg--diff">
          <button
            className={"seg__btn" + (mode === "split" ? " seg__btn--on" : "")}
            onClick={() => setMode("split")}
          >
            Split
          </button>
          <button
            className={"seg__btn" + (mode === "inline" ? " seg__btn--on" : "")}
            onClick={() => setMode("inline")}
          >
            Inline
          </button>
        </div>
        <button className="diff-close" onClick={onClose} title="Close diff">
          ✕
        </button>
      </div>
      <div className="diff-body">
        {state === "loading" && <div className="graph-msg">Loading diff…</div>}
        {state === "binary" && <div className="graph-msg">Binary file — no text diff.</div>}
        {state === "error" && <div className="graph-msg error">{err}</div>}
        <div ref={hostRef} className="cm-merge" style={{ display: state === "ready" ? "block" : "none" }} />
      </div>
    </div>
  );
}
