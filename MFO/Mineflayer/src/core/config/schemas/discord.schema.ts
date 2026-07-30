import { z } from 'zod';

export const discordConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Slash commands register to this guild for fast propagation; omitted falls back to slow global registration. */
  guildId: z.string().min(1).optional(),
  /** Channel alert/health/screenshot notifications post to. Required in practice when enabled, not enforced here since disabled installs ship this file empty. */
  notifyChannelId: z.string().min(1).optional(),
  /** User IDs allowed to run commands. Empty means unrestricted — deliberate default for a first local run; operators should populate this before exposing the bot. */
  whitelist: z.array(z.string()).default([]),
});

export type DiscordConfig = z.infer<typeof discordConfigSchema>;
