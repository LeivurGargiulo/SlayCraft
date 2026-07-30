import { z } from "astro/zod";

export const projectDataSchema = z.object({
  title: z.string(),
  author: z.string(),
  biome: z.string(),
  coordinates: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  mapPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  status: z.enum(["in-progress", "completed"]),
  date: z.coerce.date(),
  tags: z.array(z.string()).optional(),
});

export const playerDataSchema = z.object({
  username: z.string(),
  role: z.string(),
  joinDate: z.coerce.date(),
});

export const taskSchema = z.object({
  title: z.string(),
  status: z.enum(["todo", "in-progress", "done"]),
  assignee: z.string().optional(),
  priority: z.string().optional(),
  notes: z.string().optional(),
});

export const galleryDataSchema = z.object({
  caption: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).optional(),
});
