import { describe, it, expect } from "vitest";
import { clamp, parallaxOffset } from "./scroll";

describe("clamp", () => {
  it("clamps within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("parallaxOffset", () => {
  it("scales scroll position by speed", () => {
    expect(parallaxOffset(100, 0.5, 1000)).toBe(50);
  });

  it("clamps to maxOffset", () => {
    expect(parallaxOffset(10000, 0.5, 200)).toBe(200);
  });
});
