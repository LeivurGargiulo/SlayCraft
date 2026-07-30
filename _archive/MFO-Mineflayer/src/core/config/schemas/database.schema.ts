import { z } from 'zod';

const defaultBackupConfig = {
  enabled: true,
  intervalMs: 21_600_000,
  directory: 'data/backups',
  retainCount: 7,
};

export const databaseConfigSchema = z.object({
  path: z.string().min(1).default('data/mfo.sqlite'),
  backup: z
    .object({
      enabled: z.boolean().default(true),
      intervalMs: z.number().int().positive().default(21_600_000),
      directory: z.string().min(1).default('data/backups'),
      retainCount: z.number().int().positive().default(7),
    })
    .default(defaultBackupConfig),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
