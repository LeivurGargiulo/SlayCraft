import { describe, it, expect } from "vitest";
import { nextIndex } from "./gallery";

describe("nextIndex", () => {
  it("wraps forward past the end", () => {
    expect(nextIndex(2, 3, 1)).toBe(0);
  });

  it("wraps backward past the start", () => {
    expect(nextIndex(0, 3, -1)).toBe(2);
  });

  it("steps normally within range", () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
  });
});
