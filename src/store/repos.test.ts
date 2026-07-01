import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useRepos } from "./repos";
import type { RepoMeta } from "../types/git";

const invokeMock = vi.mocked(invoke);

const repo = (over: Partial<RepoMeta> = {}): RepoMeta => ({
  id: 1,
  path: "/tmp/r",
  name: "r",
  alias: null,
  favorite: false,
  lastOpened: 0,
  ...over,
});

// Command-appropriate defaults so select()'s fan-out of loaders never throws.
// Async so the real-invoke contract (always returns a Promise) holds.
async function defaultInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    case "list_repos":
    case "stash_list":
    case "worktree_list":
    case "remote_list":
    case "submodule_list":
    case "profiles_list":
    case "graph_load":
    case "forge_pulls":
    case "forge_issues":
      return [];
    case "branch_list":
      return { local: [{ name: "main", current: true, ahead: 0, behind: 0 }], remote: [] };
    case "repo_status":
      return {
        branch: "main",
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
      };
    case "lfs_status":
      return { installed: false, version: "", used: false, patterns: [], files: [] };
    case "signing_config":
      return { sign: false, format: "openpgp", key: "" };
    case "gitflow_status":
      return {
        initialized: false,
        main: "main",
        develop: "develop",
        featurePrefix: "",
        releasePrefix: "",
        hotfixPrefix: "",
        current: "",
        currentKind: "",
        currentName: "",
      };
    case "forge_detect":
      return { provider: "", host: "", owner: "", repo: "", hasToken: false };
    case "open_repo":
    case "clone_repo":
    case "init_repo":
      return repo({ path: String(args?.dir ?? args?.path ?? "/tmp/new"), name: "new" });
    case "profile_save":
      return args?.profile;
    default:
      return undefined;
  }
}

beforeEach(() => {
  invokeMock.mockImplementation(defaultInvoke as never);
});

describe("loadBranches", () => {
  it("populates branchTree and derives the flat branch list", async () => {
    useRepos.setState({ selected: repo() });
    invokeMock.mockImplementation((async (cmd: string) =>
      cmd === "branch_list"
        ? { local: [{ name: "main", current: true, ahead: 1, behind: 0 }], remote: ["origin/main"] }
        : defaultInvoke(cmd)) as never);

    await useRepos.getState().loadBranches();

    const s = useRepos.getState();
    expect(s.branchTree.local[0].ahead).toBe(1);
    expect(s.branchTree.remote).toEqual(["origin/main"]);
    expect(s.branches).toEqual(["main"]);
  });
});

describe("closeRepo", () => {
  it("clears the selection and unwatches the repo", async () => {
    useRepos.setState({ selected: repo({ path: "/tmp/x" }), branches: ["a"] });
    await useRepos.getState().closeRepo();

    expect(invokeMock).toHaveBeenCalledWith("unwatch_repo", { path: "/tmp/x" });
    const s = useRepos.getState();
    expect(s.selected).toBeNull();
    expect(s.branches).toEqual([]);
    expect(s.branchTree).toEqual({ local: [], remote: [] });
  });

  it("no-ops with no repo open", async () => {
    await useRepos.getState().closeRepo();
    expect(invokeMock).not.toHaveBeenCalledWith("unwatch_repo", expect.anything());
  });
});

describe("applyProfile", () => {
  const prof = {
    id: 1,
    name: "Work",
    userName: "W",
    userEmail: "w@e.com",
    signingKey: "",
    signingFormat: "",
    sshKeyPath: "",
  };

  it("applies to the open repo locally (global=false)", async () => {
    useRepos.setState({ selected: repo({ path: "/tmp/x", name: "x" }) });
    await useRepos.getState().applyProfile(prof);

    expect(invokeMock).toHaveBeenCalledWith("profile_apply", {
      path: "/tmp/x",
      profile: prof,
      global: false,
    });
    expect(useRepos.getState().info).toContain("Work");
  });

  it("applies globally without an open repo", async () => {
    await useRepos.getState().applyProfile(prof, true);
    expect(invokeMock).toHaveBeenCalledWith("profile_apply", {
      path: "",
      profile: prof,
      global: true,
    });
    expect(useRepos.getState().info).toContain("global");
  });
});

describe("clone / init", () => {
  it("cloneRepo registers and selects the new repo, then closes the dialog", async () => {
    useRepos.setState({ cloneOpen: true });
    await useRepos.getState().cloneRepo("https://x/y.git", "/tmp/dest/y");

    expect(invokeMock).toHaveBeenCalledWith("clone_repo", {
      url: "https://x/y.git",
      dir: "/tmp/dest/y",
    });
    const s = useRepos.getState();
    expect(s.cloneOpen).toBe(false);
    expect(s.selected?.path).toBe("/tmp/dest/y");
  });

  it("initRepo registers and selects the new repo", async () => {
    await useRepos.getState().initRepo("/tmp/fresh");
    expect(invokeMock).toHaveBeenCalledWith("init_repo", { dir: "/tmp/fresh" });
    expect(useRepos.getState().selected?.path).toBe("/tmp/fresh");
  });
});

describe("profile CRUD", () => {
  it("saveProfile then reloads the list", async () => {
    const p = {
      id: 0,
      name: "New",
      userName: "",
      userEmail: "",
      signingKey: "",
      signingFormat: "",
      sshKeyPath: "",
    };
    await useRepos.getState().saveProfile(p);
    expect(invokeMock).toHaveBeenCalledWith("profile_save", { profile: p });
    expect(invokeMock).toHaveBeenCalledWith("profiles_list");
  });

  it("deleteProfile then reloads the list", async () => {
    await useRepos.getState().deleteProfile(5);
    expect(invokeMock).toHaveBeenCalledWith("profile_delete", { id: 5 });
    expect(invokeMock).toHaveBeenCalledWith("profiles_list");
  });
});

describe("createPull", () => {
  it("creates a PR, opens it in the browser and closes the dialog", async () => {
    useRepos.setState({ selected: repo({ path: "/tmp/x" }), prOpen: true });
    invokeMock.mockImplementation((async (cmd: string) =>
      cmd === "forge_create_pull" ? "https://forge/pr/1" : defaultInvoke(cmd)) as never);

    await useRepos.getState().createPull("Title", "Body", "feat", "main");

    expect(invokeMock).toHaveBeenCalledWith("forge_create_pull", {
      path: "/tmp/x",
      title: "Title",
      body: "Body",
      source: "feat",
      target: "main",
    });
    expect(invokeMock).toHaveBeenCalledWith("open_external", { url: "https://forge/pr/1" });
    expect(useRepos.getState().prOpen).toBe(false);
  });
});

describe("undo", () => {
  it("invokes undo and surfaces the description", async () => {
    useRepos.setState({ selected: repo({ path: "/tmp/x" }) });
    invokeMock.mockImplementation((async (cmd: string) =>
      cmd === "undo" ? "Undid the last commit" : defaultInvoke(cmd)) as never);

    await useRepos.getState().undo();

    expect(invokeMock).toHaveBeenCalledWith("undo", { path: "/tmp/x" });
    expect(useRepos.getState().info).toBe("Undid the last commit");
  });
});

describe("profile auto-apply per repo", () => {
  const prof = {
    id: 3,
    name: "Work",
    userName: "W",
    userEmail: "w@e.com",
    signingKey: "",
    signingFormat: "",
    sshKeyPath: "",
  };

  it("remembers the applied profile for the repo", async () => {
    useRepos.setState({ selected: repo({ path: "/tmp/x" }) });
    await useRepos.getState().applyProfile(prof);

    expect(useRepos.getState().profileByRepo["/tmp/x"]).toBe(3);
    expect(invokeMock).toHaveBeenCalledWith("set_setting", {
      key: "profile.byRepo",
      value: JSON.stringify({ "/tmp/x": 3 }),
    });
  });

  it("auto-applies the remembered profile when a repo opens", async () => {
    useRepos.setState({ profiles: [prof], profileByRepo: { "/tmp/x": 3 } });
    await useRepos.getState().select(repo({ id: 2, path: "/tmp/x", name: "x" }));

    expect(invokeMock).toHaveBeenCalledWith("profile_apply", {
      path: "/tmp/x",
      profile: prof,
      global: false,
    });
  });
});

describe("ui toggles", () => {
  it("toggleReposDrawer flips and forces state", () => {
    const st = useRepos.getState();
    const start = st.reposDrawerOpen;
    st.toggleReposDrawer();
    expect(useRepos.getState().reposDrawerOpen).toBe(!start);
    st.toggleReposDrawer(true);
    expect(useRepos.getState().reposDrawerOpen).toBe(true);
  });
});
