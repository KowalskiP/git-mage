import { describe, it, expect } from "vitest";
import { buildTree } from "./tree";

const item = (name: string) => ({ segments: name.split("/"), data: name });

describe("buildTree", () => {
  it("keeps flat names as root leaves", () => {
    const tree = buildTree([item("main"), item("dev")]);
    expect(tree.map((n) => n.name)).toEqual(["dev", "main"]); // alphabetical
    expect(tree.every((n) => n.leaf !== undefined && n.children.length === 0)).toBe(true);
  });

  it("groups slash-delimited names into folders", () => {
    const tree = buildTree([item("feature/login"), item("feature/signup")]);
    expect(tree).toHaveLength(1);
    const feature = tree[0];
    expect(feature.name).toBe("feature");
    expect(feature.leaf).toBeUndefined();
    expect(feature.children.map((c) => c.name)).toEqual(["login", "signup"]);
    expect(feature.children[0].path).toBe("feature/login");
    expect(feature.children[0].leaf).toBe("feature/login");
  });

  it("nests multiple folder levels", () => {
    const tree = buildTree([item("feature/ui/navbar")]);
    const navbar = tree[0].children[0].children[0];
    expect(tree[0].name).toBe("feature");
    expect(tree[0].children[0].name).toBe("ui");
    expect(navbar.name).toBe("navbar");
    expect(navbar.path).toBe("feature/ui/navbar");
    expect(navbar.leaf).toBe("feature/ui/navbar");
  });

  it("orders folders before leaves, each alphabetical", () => {
    const tree = buildTree([item("zeta"), item("alpha/x"), item("beta")]);
    expect(tree.map((n) => n.name)).toEqual(["alpha", "beta", "zeta"]);
    expect(tree[0].children.length).toBe(1); // alpha is a folder
    expect(tree[1].leaf).toBe("beta"); // beta is a leaf
  });

  it("ignores empty segment lists", () => {
    const tree = buildTree([{ segments: [], data: "x" }, item("main")]);
    expect(tree.map((n) => n.name)).toEqual(["main"]);
  });
});
