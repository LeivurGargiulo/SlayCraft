import { z } from 'zod';

export const loggingConfigSchema = z.object({
  level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  pretty: z.boolean().default(true),
  file: z
    .object({
      enabled: z.boolean().default(false),
      path: z.string().min(1).default('logs/mfo.log'),
    })
    .default({ enabled: false, path: 'logs/mfo.log' }),
});

export type LoggingConfig = z.infer<typeof loggingConfigSchema>;
