import { z } from 'zod';

export const alertsConfigSchema = z.object({
  storageWarningPercent: z.number().min(0).max(100).default(90),
  storageFullPercent: z.number().min(0).max(100).default(100),
});

export type AlertsConfig = z.infer<typeof alertsConfigSchema>;
