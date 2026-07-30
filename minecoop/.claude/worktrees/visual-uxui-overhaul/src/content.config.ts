import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const proyectos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/proyectos' }),
  schema: ({ image }) =>
    z.object({
      images: z.array(image()).min(1),
    }),
});

const granjas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/granjas' }),
  schema: ({ image }) =>
    z.object({
      images: z.array(image()).min(1),
    }),
});

export const collections = { proyectos, granjas };
