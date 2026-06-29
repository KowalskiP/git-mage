import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useRepos } from "../../store/repos";
import { Explorer } from "./Explorer";
import type { BranchList, LocalBranch, RepoMeta } from "../../types/git";

const invokeMock = vi.mocked(invoke);

const repo: RepoMeta = {
  id: 1,
  path: "/tmp/r",
  name: "r",
  alias: null,
  favorite: false,
  lastOpened: 0,
};

function seed(local: LocalBranch[], remote: string[] = []) {
  const branchTree: BranchList = { local, remote };
  useRepos.setState({
    selected: repo,
    branchTree,
    branches: local.map((b) => b.name),
    status: {
      branch: local.find((b) => b.current)?.name ?? null,
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicted: [],
      mergeInProgress: false,
      rebaseInProgress: false,
      sequencer: "",
    },
  });
}

beforeEach(() => {
  invokeMock.mockImplementation((async () => undefined) as never);
});

describe("Explorer", () => {
  it("renders local branches grouped into folders with ahead/behind", () => {
    seed([
      { name: "main", current: true, ahead: 2, behind: 0 },
      { name: "feature/login", current: false, ahead: 0, behind: 1 },
    ]);
    const { container } = render(<Explorer />);

    // "main" appears in the header and as a branch leaf — assert the leaf exists.
    const names = [...container.querySelectorAll(".exp-branch__name")].map((n) => n.textContent);
    expect(names).toContain("main");
    expect(names).toContain("login");
    expect(screen.getByText("feature")).toBeInTheDocument(); // folder
    expect(screen.getByText("↑2")).toBeInTheDocument();
    expect(screen.getByText("↓1")).toBeInTheDocument();
  });

  it("checks out a branch on double-click (non-current only)", async () => {
    seed([
      { name: "main", current: true, ahead: 0, behind: 0 },
      { name: "dev", current: false, ahead: 0, behind: 0 },
    ]);
    render(<Explorer />);

    fireEvent.doubleClick(screen.getByText("dev"));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("checkout", { path: "/tmp/r", refname: "dev" }),
    );
  });

  it("does not check out the current branch on double-click", () => {
    seed([{ name: "main", current: true, ahead: 0, behind: 0 }]);
    const { container } = render(<Explorer />);

    const row = container.querySelector(".exp-branch")!;
    fireEvent.doubleClick(row);
    expect(invokeMock).not.toHaveBeenCalledWith("checkout", expect.anything());
  });

  it("closes the repo via the header ✕", async () => {
    seed([{ name: "main", current: true, ahead: 0, behind: 0 }]);
    function Harness() {
      const sel = useRepos((s) => s.selected);
      return sel ? <Explorer /> : <div>empty-state</div>;
    }
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("Close repository"));

    await waitFor(() => expect(screen.getByText("empty-state")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledWith("unwatch_repo", { path: "/tmp/r" });
    expect(useRepos.getState().selected).toBeNull();
  });
});
