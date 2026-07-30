import { z } from 'zod';

export const dashboardConfigSchema = z.object({
  /** jsonwebtoken `expiresIn` value. Single long-lived token, no refresh flow (confirmed with the user — matches the local/LAN read-only tool framing). */
  jwtExpiry: z.string().min(1).default('7d'),
});

export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
