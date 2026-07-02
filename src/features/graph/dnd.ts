// Drag-and-drop on the commit graph (GitKraken-style): drag a branch ref onto
// another branch or a commit to merge / rebase / reset. The decision logic is a
// pure function so it can be unit-tested without the DOM.

export interface DragRef {
  name: string;
  kind: "local" | "remote";
}

export interface DropTarget {
  sha: string;
  /** A branch ref living on the target commit, if any. */
  branch?: DragRef;
  /** Currently checked-out branch (for remote-source integrations). */
  current: string | null;
}

export type DropAction =
  | { type: "merge"; from: string; into: string; label: string }
  | { type: "rebase"; branch: string; onto: string; label: string }
  | {
      type: "reset";
      branch: string;
      sha: string;
      mode: "soft" | "mixed" | "hard";
      label: string;
      danger?: boolean;
    };

/** Actions offered when dropping `src` onto `target`. Empty = no-op drop. */
export function buildDropMenu(src: DragRef, target: DropTarget): DropAction[] {
  const out: DropAction[] = [];
  const short = target.sha.slice(0, 7);
  const t = target.branch;

  if (src.kind === "local") {
    // Onto a different local branch: integrate the two.
    if (t && t.kind === "local" && t.name !== src.name) {
      out.push({
        type: "merge",
        from: src.name,
        into: t.name,
        label: `Merge ${src.name} into ${t.name}`,
      });
      out.push({
        type: "rebase",
        branch: src.name,
        onto: t.name,
        label: `Rebase ${src.name} onto ${t.name}`,
      });
    }
    // Generic: reposition the dragged branch onto the target commit.
    out.push({
      type: "rebase",
      branch: src.name,
      onto: target.sha,
      label: `Rebase ${src.name} onto ${short}`,
    });
    for (const mode of ["soft", "mixed", "hard"] as const) {
      out.push({
        type: "reset",
        branch: src.name,
        sha: target.sha,
        mode,
        label: `Reset ${src.name} to ${short} (${mode})`,
        danger: mode === "hard",
      });
    }
  } else if (target.current) {
    // A remote branch can't be checked out/moved; only integrate it into HEAD.
    out.push({
      type: "merge",
      from: src.name,
      into: target.current,
      label: `Merge ${src.name} into ${target.current}`,
    });
    out.push({
      type: "rebase",
      branch: target.current,
      onto: src.name,
      label: `Rebase ${target.current} onto ${src.name}`,
    });
  }
  return out;
}
