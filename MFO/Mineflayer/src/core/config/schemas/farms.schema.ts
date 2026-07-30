import { z } from 'zod';

const vector3TupleSchema = z.tuple([z.number(), z.number(), z.number()]);

const containerTypeSchema = z.enum(['chest', 'double_chest', 'barrel', 'shulker_box']);

const containerSchema = z.object({
  type: containerTypeSchema,
  position: vector3TupleSchema,
});

const entityScanSchema = z
  .object({
    radius: z.number().positive().default(16),
    allow: z.array(z.string()).default([]),
  })
  .default({ radius: 16, allow: [] });

const workerExpectationSchema = z
  .object({
    position: vector3TupleSchema.optional(),
    toleranceBlocks: z.number().positive().default(5),
  })
  .default({ toleranceBlocks: 5 });

const farmSchema = z.object({
  dimension: z.string().min(1),
  teleport: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  carpetWorker: z.string().min(1),
  storage: z.array(containerSchema).default([]),
  entities: entityScanSchema,
  worker: workerExpectationSchema,
});

export const farmsConfigSchema = z.object({
  farms: z.record(z.string(), farmSchema).default({}),
});

export type FarmsConfig = z.infer<typeof farmsConfigSchema>;
export type FarmConfig = z.infer<typeof farmSchema>;
export type ContainerType = z.infer<typeof containerTypeSchema>;
