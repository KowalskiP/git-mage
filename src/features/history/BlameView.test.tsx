import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useRepos } from "../../store/repos";
import { BlameView } from "./BlameView";
import type { BlameLine, RepoMeta } from "../../types/git";

const invokeMock = vi.mocked(invoke);
const repo: RepoMeta = {
  id: 1,
  path: "/tmp/r",
  name: "r",
  alias: null,
  favorite: false,
  lastOpened: 0,
};

const lines: BlameLine[] = [
  { line: 1, sha: "01234567", author: "Ann", time: 1_700_000_000, content: "first line" },
  { line: 2, sha: "89abcdef", author: "Bob", time: 1_700_000_100, content: "second line" },
];

beforeEach(() => {
  invokeMock.mockImplementation((async (cmd: string) =>
    cmd === "blame" ? lines : undefined) as never);
});

describe("BlameView", () => {
  it("is hidden without a target", () => {
    render(<BlameView />);
    expect(screen.queryByText(/Blame ·/)).not.toBeInTheDocument();
  });

  it("renders blame lines for the target file", async () => {
    useRepos.setState({ selected: repo, blameView: { file: "f.txt", rev: "" } });
    render(<BlameView />);

    await waitFor(() => expect(screen.getByText("first line")).toBeInTheDocument());
    expect(screen.getByText("second line")).toBeInTheDocument();
    expect(screen.getByText("Ann")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("blame", { path: "/tmp/r", file: "f.txt", rev: "" });
  });
});
