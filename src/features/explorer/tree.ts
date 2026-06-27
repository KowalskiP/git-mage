// Build a folder tree from slash-delimited ref names (GitKraken groups
// `feature/x`, `feature/y` under a collapsible "feature" folder). Generic over
// the leaf payload so both local branches (LocalBranch) and remote-tracking
// refs (string) reuse it.

export interface TreeNode<T> {
  /** Last path segment, shown as the row label. */
  name: string;
  /** Full slash-joined path from the root (folder path or branch name). */
  path: string;
  /** Present when this node is a ref itself (a leaf). */
  leaf?: T;
  children: TreeNode<T>[];
}

export interface TreeItem<T> {
  /** Path split on "/", e.g. ["feature", "login"]. */
  segments: string[];
  data: T;
}

/** Assemble a sorted tree (folders first, then leaves, each alphabetical). */
export function buildTree<T>(items: TreeItem<T>[]): TreeNode<T>[] {
  const roots: TreeNode<T>[] = [];
  for (const it of items) {
    if (it.segments.length === 0) continue;
    let level = roots;
    let path = "";
    it.segments.forEach((seg, idx) => {
      path = path ? `${path}/${seg}` : seg;
      let node = level.find((n) => n.name === seg);
      if (!node) {
        node = { name: seg, path, children: [] };
        level.push(node);
      }
      if (idx === it.segments.length - 1) node.leaf = it.data;
      level = node.children;
    });
  }
  sort(roots);
  return roots;
}

function sort<T>(nodes: TreeNode<T>[]) {
  nodes.sort((a, b) => {
    const af = a.children.length > 0 && !a.leaf;
    const bf = b.children.length > 0 && !b.leaf;
    if (af !== bf) return af ? -1 : 1; // folders first
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) if (n.children.length) sort(n.children);
}
