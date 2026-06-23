import { useEffect, useState } from "react";
import { useRepos } from "../store/repos";
import { commitDiff, wipDiff } from "../ipc/commands";
import { CommitGraph } from "./graph/CommitGraph";
import { DetailPanel } from "./DetailPanel";
import { DiffView } from "./DiffView";

export function RepoView() {
  const selected = useRepos((s) => s.selected);
  const selectedSha = useRepos((s) => s.selectedSha);

  const [openFile, setOpenFile] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);

  // Close the diff overlay when the selected commit changes.
  useEffect(() => {
    setOpenFile(null);
  }, [selectedSha]);

  if (!selected) return null;

  async function open(file: string, sha: string, wip: boolean) {
    const repoPath = selected!.path;
    setOpenFile(file);
    setDiff("");
    setDiffLoading(true);
    try {
      setDiff(wip ? await wipDiff(repoPath, file) : await commitDiff(repoPath, sha, file));
    } catch (e) {
      setDiff(String(e));
    } finally {
      setDiffLoading(false);
    }
  }

  return (
    <div className="repo-view">
      <div className="repo-view__body">
        <CommitGraph />
        <DetailPanel onOpenFile={open} selectedFile={openFile} />
        {openFile && (
          <DiffView
            title={openFile}
            diff={diff}
            loading={diffLoading}
            onClose={() => setOpenFile(null)}
          />
        )}
      </div>
    </div>
  );
}
