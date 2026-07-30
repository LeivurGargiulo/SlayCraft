import { describe, it, expect } from "vitest";
import { projectDataSchema, playerDataSchema, taskSchema, galleryDataSchema } from "./schemas";

describe("projectDataSchema", () => {
  it("accepts a valid project", () => {
    const result = projectDataSchema.safeParse({
      title: "Granja de hierro",
      author: "lei",
      biome: "llanura",
      coordinates: { x: 100, y: 64, z: -200 },
      status: "completed",
      date: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = projectDataSchema.safeParse({
      title: "Granja de hierro",
      author: "lei",
      biome: "llanura",
      coordinates: { x: 100, y: 64, z: -200 },
      status: "en-pausa",
      date: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });
});

describe("taskSchema", () => {
  it("accepts a task without optional fields", () => {
    const result = taskSchema.safeParse({ title: "Terminar el hub del nether", status: "todo" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = taskSchema.safeParse({ title: "x", status: "bloqueada" });
    expect(result.success).toBe(false);
  });
});

describe("playerDataSchema and galleryDataSchema", () => {
  it("accept valid data", () => {
    expect(
      playerDataSchema.safeParse({ username: "lei", role: "redstone", joinDate: "2025-06-01" }).success
    ).toBe(true);
    expect(
      galleryDataSchema.safeParse({ caption: "Se cayó en lava", date: "2026-01-10" }).success
    ).toBe(true);
  });
});
