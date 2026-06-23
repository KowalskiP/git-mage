import { useEffect, useState } from "react";
import { useRepos } from "../store/repos";
import { CommitGraph } from "./graph/CommitGraph";
import { DetailPanel } from "./DetailPanel";
import { DiffView } from "./DiffView";
import { Toolbar } from "./Toolbar";

export function RepoView() {
  const selected = useRepos((s) => s.selected);
  const selectedSha = useRepos((s) => s.selectedSha);

  const [open, setOpen] = useState<{ file: string; sha: string } | null>(null);

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
          onOpenFile={(file, sha) => setOpen({ file, sha })}
          selectedFile={open?.file ?? null}
        />
        {open && (
          <DiffView
            repoPath={selected.path}
            sha={open.sha}
            file={open.file}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
    </div>
  );
}
