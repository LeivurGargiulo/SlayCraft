import { describe, it, expect } from "vitest";
import { matchesFilters, compareProjects, type ProjectSummary } from "./filterSort";

const projects: ProjectSummary[] = [
  { status: "completed", author: "lei", biome: "llanura", date: "2026-02-10", title: "Granja de hierro" },
  { status: "in-progress", author: "facu", biome: "nether", date: "2026-05-03", title: "Catedral del Nether" },
];

describe("matchesFilters", () => {
  it("matches everything when no filters are set", () => {
    expect(matchesFilters(projects[0], {})).toBe(true);
  });

  it("filters by status", () => {
    expect(matchesFilters(projects[0], { status: "in-progress" })).toBe(false);
    expect(matchesFilters(projects[1], { status: "in-progress" })).toBe(true);
  });

  it("filters by author and biome together", () => {
    expect(matchesFilters(projects[1], { author: "facu", biome: "nether" })).toBe(true);
    expect(matchesFilters(projects[1], { author: "facu", biome: "llanura" })).toBe(false);
  });
});

describe("compareProjects", () => {
  it("sorts by date descending by default", () => {
    expect(compareProjects(projects[0], projects[1], "date-desc")).toBeGreaterThan(0);
  });

  it("sorts by title ascending", () => {
    expect(compareProjects(projects[1], projects[0], "title-asc")).toBeLessThan(0);
  });
});
