import { z } from 'zod';

const monitorIds = ['storage', 'entities', 'workers', 'chunks'] as const;

export type MonitorId = (typeof monitorIds)[number];

export const managerConfigSchema = z.object({
  monitors: z.array(z.enum(monitorIds)).default([...monitorIds]),
  server: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(25565),
    version: z.string().min(1).optional(),
    /**
     * Tolerance for gaps between the server's `keep_alive` packets before mineflayer treats
     * the connection as dead (`minecraft-protocol`'s hardcoded default is 30s, too tight for
     * a modded server under tick lag — a busy farm-heavy server is exactly what MFO watches).
     */
    keepAliveTimeoutMs: z.number().int().positive().default(60_000),
  }),
  bot: z.object({
    username: z.string().min(1),
    auth: z.enum(['offline', 'microsoft']).default('offline'),
  }),
  reconnect: z
    .object({
      enabled: z.boolean().default(true),
      initialDelayMs: z.number().int().positive().default(5000),
      maxDelayMs: z.number().int().positive().default(60000),
      maxAttempts: z.number().int().positive().optional(),
    })
    .default({ enabled: true, initialDelayMs: 5000, maxDelayMs: 60000 }),
  scan: z
    .object({
      enabled: z.boolean().default(true),
      intervalMs: z.number().int().positive().default(300_000),
    })
    .default({ enabled: true, intervalMs: 300_000 }),
  api: z
    .object({
      host: z.string().min(1).default('0.0.0.0'),
      port: z.number().int().min(1).max(65535).default(3000),
    })
    .default({ host: '0.0.0.0', port: 3000 }),
});

export type ManagerConfig = z.infer<typeof managerConfigSchema>;
