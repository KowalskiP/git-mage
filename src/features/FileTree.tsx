import { type ReactElement, useMemo, useState } from "react";
import type { FileEntry } from "../types/git";

function code(status: string) {
  return status === "??" ? "U" : status[0];
}

function StatusBadge({ status }: { status: string }) {
  const c = code(status);
  return <span className={"fstat fstat-" + c}>{c}</span>;
}

interface Props {
  files: FileEntry[];
  mode: "path" | "tree";
  selected: string | null;
  onSelect: (path: string) => void;
}

export function FileTree({ files, mode, selected, onSelect }: Props) {
  if (files.length === 0) return <div className="filetree-empty">No files</div>;
  if (mode === "path") {
    return (
      <ul className="filelist">
        {files.map((f) => (
          <li
            key={f.path}
            className={"fileitem" + (f.path === selected ? " fileitem--active" : "")}
            onClick={() => onSelect(f.path)}
            title={f.path}
          >
            <StatusBadge status={f.status} />
            <span className="fileitem__path">{f.path}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <TreeView files={files} selected={selected} onSelect={onSelect} />;
}

interface TNode {
  name: string;
  path: string;
  file?: FileEntry;
  children: TNode[];
}

function buildTree(files: FileEntry[]): TNode[] {
  const root: TNode = { name: "", path: "", children: [] };
  for (const f of files) {
    const parts = f.path.split("/");
    let cur = root;
    let acc = "";
    parts.forEach((part, idx) => {
      acc = acc ? acc + "/" + part : part;
      const isFile = idx === parts.length - 1;
      let child = cur.children.find((c) => c.name === part && !!c.file === isFile);
      if (!child) {
        child = { name: part, path: acc, children: [], file: isFile ? f : undefined };
        cur.children.push(child);
      }
      cur = child;
    });
  }
  const sortRec = (n: TNode) => {
    n.children.sort(
      (a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.name.localeCompare(b.name),
    );
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root.children;
}

function TreeView({ files, selected, onSelect }: Omit<Props, "mode">) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (p: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      n.has(p) ? n.delete(p) : n.add(p);
      return n;
    });

  const render = (nodes: TNode[], depth: number): ReactElement[] =>
    nodes.flatMap((n) => {
      const pad = { paddingLeft: 8 + depth * 14 };
      if (n.file) {
        return [
          <li
            key={n.path}
            className={"fileitem" + (n.path === selected ? " fileitem--active" : "")}
            style={pad}
            onClick={() => onSelect(n.path)}
            title={n.path}
          >
            <StatusBadge status={n.file.status} />
            <span className="fileitem__path">{n.name}</span>
          </li>,
        ];
      }
      const open = !collapsed.has(n.path);
      const rows: ReactElement[] = [
        <li key={n.path} className="treedir" style={pad} onClick={() => toggle(n.path)}>
          <span className="treedir__chev">{open ? "▾" : "▸"}</span>
          {n.name}
        </li>,
      ];
      if (open) rows.push(...render(n.children, depth + 1));
      return rows;
    });

  return <ul className="filelist">{render(tree, 0)}</ul>;
}
