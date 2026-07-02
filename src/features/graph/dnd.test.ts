import { describe, it, expect } from "vitest";
import { buildDropMenu } from "./dnd";

describe("buildDropMenu", () => {
  it("offers merge + rebase when a local branch is dropped on another local branch", () => {
    const acts = buildDropMenu(
      { name: "feature", kind: "local" },
      { sha: "abcdef1234", branch: { name: "main", kind: "local" }, current: "main" },
    );
    expect(acts.find((a) => a.type === "merge")).toMatchObject({ from: "feature", into: "main" });
    expect(acts.find((a) => a.type === "rebase")).toMatchObject({ branch: "feature", onto: "main" });
    // plus generic rebase-onto-commit + 3 resets
    expect(acts.filter((a) => a.type === "reset")).toHaveLength(3);
  });

  it("marks hard reset as danger", () => {
    const acts = buildDropMenu(
      { name: "dev", kind: "local" },
      { sha: "0123456789", current: "dev" },
    );
    const hard = acts.find((a) => a.type === "reset" && a.mode === "hard");
    expect(hard).toBeDefined();
    expect((hard as { danger?: boolean }).danger).toBe(true);
  });

  it("does not offer branch-integration when dropped on its own branch", () => {
    const acts = buildDropMenu(
      { name: "main", kind: "local" },
      { sha: "aaaaaaa", branch: { name: "main", kind: "local" }, current: "main" },
    );
    // no merge (into itself); still generic rebase/reset present
    expect(acts.some((a) => a.type === "merge")).toBe(false);
    expect(acts.some((a) => a.type === "rebase")).toBe(true);
  });

  it("integrates a remote branch only into the current branch", () => {
    const acts = buildDropMenu(
      { name: "origin/main", kind: "remote" },
      { sha: "beef123", current: "work" },
    );
    expect(acts).toHaveLength(2);
    expect(acts[0]).toMatchObject({ type: "merge", from: "origin/main", into: "work" });
    expect(acts[1]).toMatchObject({ type: "rebase", branch: "work", onto: "origin/main" });
  });

  it("offers nothing for a remote source with no current branch", () => {
    expect(buildDropMenu({ name: "origin/x", kind: "remote" }, { sha: "1", current: null })).toEqual(
      [],
    );
  });
});
