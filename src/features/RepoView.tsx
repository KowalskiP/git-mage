import { useEffect, useState } from "react";
import { useRepos } from "../store/repos";
import { CommitGraph } from "./graph/CommitGraph";
import { DetailPanel } from "./DetailPanel";
import { DiffView } from "./DiffView";
import { HunkView } from "./HunkView";
import { Toolbar } from "./Toolbar";

export function RepoView() {
  const selected = useRepos((s) => s.selected);
  const selectedSha = useRepos((s) => s.selectedSha);

  const [open, setOpen] = useState<{
    file: string;
    sha: string;
    wip: boolean;
    staged: boolean;
  } | null>(null);

  // Close the diff overlay when the selected commit changes.
  useEffect(() => {
    setOpen(null);
  }, [selectedSha]);

  if (!selected) return null;

  return (
    <div className="repo-view">
      <Toolbar />
      <div className="repo-view__body">
        <CommitGraph />
        <DetailPanel
          onOpenFile={(file, sha, wip, staged) => setOpen({ file, sha, wip, staged })}
          selectedFile={open?.file ?? null}
        />
        {open &&
          (open.wip ? (
            <HunkView
              repoPath={selected.path}
              file={open.file}
              staged={open.staged}
              onClose={() => setOpen(null)}
            />
          ) : (
            <DiffView
              repoPath={selected.path}
              sha={open.sha}
              file={open.file}
              onClose={() => setOpen(null)}
            />
          ))}
      </div>
    </div>
  );
}
