import { type ReactElement, useMemo, useState } from "react";
import type { FileEntry } from "../types/git";

const code = (status: string) => (status === "??" ? "U" : status[0]);

export type RowAction = "stage" | "unstage";

interface Props {
  files: FileEntry[];
  mode: "path" | "tree";
  selected: string | null;
  onSelect: (path: string) => void;
  action?: RowAction;
  onAction?: (path: string) => void;
}

function Row({
  file,
  label,
  pad,
  selected,
  onSelect,
  action,
  onAction,
}: {
  file: FileEntry;
  label: string;
  pad?: number;
  selected: string | null;
  onSelect: (p: string) => void;
  action?: RowAction;
  onAction?: (p: string) => void;
}) {
  return (
    <li
      className={"file-row file-row--btn" + (file.path === selected ? " file-row--active" : "")}
      style={pad ? { paddingLeft: pad } : undefined}
      onClick={() => onSelect(file.path)}
      title={file.path}
    >
      <span className={"fstat fstat-" + code(file.status)}>{code(file.status)}</span>
      <span className="file-row__path">{label}</span>
      {action && (
        <button
          className="row-action"
          title={action === "stage" ? "Stage" : "Unstage"}
          onClick={(e) => {
            e.stopPropagation();
            onAction?.(file.path);
          }}
        >
          {action === "stage" ? "+" : "−"}
        </button>
      )}
    </li>
  );
}

export function FileTree({ files, mode, selected, onSelect, action, onAction }: Props) {
  if (files.length === 0) return <div className="filetree-empty">No files</div>;
  if (mode === "path") {
    return (
      <ul className="file-list">
        {files.map((f) => (
          <Row
            key={f.path}
            file={f}
            label={f.path}
            selected={selected}
            onSelect={onSelect}
            action={action}
            onAction={onAction}
          />
        ))}
      </ul>
    );
  }
  return (
    <TreeView
      files={files}
      selected={selected}
      onSelect={onSelect}
      action={action}
      onAction={onAction}
    />
  );
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

function TreeView({ files, selected, onSelect, action, onAction }: Omit<Props, "mode">) {
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
      const pad = 8 + depth * 14;
      if (n.file) {
        return [
          <Row
            key={n.path}
            file={n.file}
            label={n.name}
            pad={pad}
            selected={selected}
            onSelect={onSelect}
            action={action}
            onAction={onAction}
          />,
        ];
      }
      const open = !collapsed.has(n.path);
      const rows: ReactElement[] = [
        <li
          key={n.path}
          className="treedir"
          style={{ paddingLeft: pad }}
          onClick={() => toggle(n.path)}
        >
          <span className="treedir__chev">{open ? "▾" : "▸"}</span>
          {n.name}
        </li>,
      ];
      if (open) rows.push(...render(n.children, depth + 1));
      return rows;
    });

  return <ul className="file-list">{render(tree, 0)}</ul>;
}
