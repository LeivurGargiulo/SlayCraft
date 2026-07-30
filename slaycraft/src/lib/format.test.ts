import { describe, it, expect } from "vitest";
import { formatCoordinates, formatFecha } from "./format";

describe("formatCoordinates", () => {
  it("formats x/y/z including negative values", () => {
    expect(formatCoordinates({ x: 120, y: 64, z: -340 })).toBe("X: 120 Y: 64 Z: -340");
  });
});

describe("formatFecha", () => {
  it("formats a date in Argentine Spanish", () => {
    expect(formatFecha(new Date("2026-02-10T00:00:00Z"))).toMatch(/10\s+\w+\s+feb\.?\s+\w+\s+2026/i);
  });
});
