import { describe, it, expect } from "vitest";
import { nameFromUrl } from "./CloneModal";

describe("nameFromUrl", () => {
  it("extracts the repo name from an https URL", () => {
    expect(nameFromUrl("https://github.com/user/repo.git")).toBe("repo");
    expect(nameFromUrl("https://github.com/user/repo")).toBe("repo");
  });

  it("handles scp-style git URLs", () => {
    expect(nameFromUrl("git@github.com:user/my-repo.git")).toBe("my-repo");
  });

  it("strips a trailing slash", () => {
    expect(nameFromUrl("https://example.com/group/proj/")).toBe("proj");
  });

  it("handles local paths", () => {
    expect(nameFromUrl("/tmp/src.git")).toBe("src");
  });

  it("returns empty string for blank input", () => {
    expect(nameFromUrl("")).toBe("");
    expect(nameFromUrl("   ")).toBe("");
  });
});
