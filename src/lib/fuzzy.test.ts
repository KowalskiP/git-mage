import { describe, it, expect } from "vitest";
import { fuzzyScore } from "./fuzzy";

describe("fuzzyScore", () => {
  it("returns 0 for an empty query (matches everything)", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
    expect(fuzzyScore("   ", "anything")).toBe(0);
  });

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyScore("xyz", "fetch")).toBeNull();
    expect(fuzzyScore("fp", "pull")).toBeNull(); // 'f' missing
  });

  it("matches subsequences in order", () => {
    expect(fuzzyScore("ft", "fetch")).not.toBeNull();
    expect(fuzzyScore("fp", "fetch / pull")).not.toBeNull();
  });

  it("scores contiguous + word-start matches higher", () => {
    const contiguous = fuzzyScore("fet", "fetch")!;
    const scattered = fuzzyScore("fct", "fetch cart")!;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it("prefers shorter targets when otherwise equal", () => {
    const short = fuzzyScore("ab", "ab")!;
    const long = fuzzyScore("ab", "ab" + "x".repeat(50))!;
    expect(short).toBeGreaterThan(long);
  });
});
