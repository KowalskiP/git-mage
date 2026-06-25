import { useEffect, useState } from "react";
import { useRepos } from "../store/repos";
import { CommitGraph } from "./graph/CommitGraph";
import { DetailPanel } from "./DetailPanel";
import { DiffView } from "./DiffView";
import { HunkView } from "./HunkView";
import { ConflictEditor } from "./ConflictEditor";
import { Toolbar } from "./Toolbar";
import { TerminalDock } from "./terminal/TerminalDock";

export function RepoView() {
  const selected = useRepos((s) => s.selected);
  const selectedSha = useRepos((s) => s.selectedSha);

  const [open, setOpen] = useState<{
    file: string;
    sha: string;
    wip: boolean;
    staged: boolean;
  } | null>(null);
  const [conflictFile, setConflictFile] = useState<string | null>(null);

  // Close overlays when the selected commit changes.
  useEffect(() => {
    setOpen(null);
    setConflictFile(null);
  }, [selectedSha]);

  if (!selected) return null;

  return (
    <div className="repo-view">
      <Toolbar />
      <div className="repo-view__body">
        <CommitGraph />
        <DetailPanel
          onOpenFile={(file, sha, wip, staged) => {
            setConflictFile(null);
            setOpen({ file, sha, wip, staged });
          }}
          onOpenConflict={(file) => {
            setOpen(null);
            setConflictFile(file);
          }}
          selectedFile={conflictFile ?? open?.file ?? null}
        />
        {conflictFile ? (
          <ConflictEditor
            repoPath={selected.path}
            file={conflictFile}
            onClose={() => setConflictFile(null)}
          />
        ) : open ? (
          open.wip ? (
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
          )
        ) : null}
      </div>
      <TerminalDock />
    </div>
  );
}
