import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { projectDataSchema, playerDataSchema, taskSchema, galleryDataSchema } from "./content/schemas";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: ({ image }) =>
    projectDataSchema.extend({
      coverImage: image(),
      images: z.array(image()).optional(),
    }),
});

const players = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/players" }),
  schema: ({ image }) => playerDataSchema.extend({ skinImage: image() }),
});

const tasks = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/tasks" }),
  schema: taskSchema,
});

const gallery = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/gallery" }),
  schema: ({ image }) => galleryDataSchema.extend({ image: image() }),
});

export const collections = { projects, players, tasks, gallery };
