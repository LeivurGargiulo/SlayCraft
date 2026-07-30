import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Db } from '../../database/client.js';
import type { FarmRegistry } from '../../core/registry/farm-registry.js';
import type { FarmDefinition } from '../../core/registry/farm-definition.js';
import type { AlertService } from '../../services/alerts/alert-service.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';
import type { DiscordConfig } from '../../core/config/index.js';
import {
  averageFillPercent,
  getAlerts,
  getLatestHealth,
  getLatestProduction,
  getLatestStorageBatch,
  getWorkerStatus,
} from '../../database/queries.js';

export interface DiscordBotDeps {
  readonly config: DiscordConfig;
  /** From process.env.DISCORD_BOT_TOKEN, never committed to discord.yml. */
  readonly token: string | undefined;
  readonly farmRegistry: FarmRegistry;
  readonly db: Db;
  readonly alertService: AlertService;
  readonly enqueueScan: (farm: FarmDefinition) => string;
  readonly eventBus: EventBus<AppEventMap>;
  readonly logger: Logger;
}

export interface DiscordBotHandle {
  readonly stop: () => Promise<void>;
}

const COMMANDS = [
  new SlashCommandBuilder().setName('help').setDescription('List available commands'),
  new SlashCommandBuilder()
    .setName('farm')
    .setDescription('Farm overview')
    .addStringOption((opt) => opt.setName('farm').setDescription('Farm id').setRequired(true)),
  new SlashCommandBuilder()
    .setName('storage')
    .setDescription('Storage fill status')
    .addStringOption((opt) => opt.setName('farm').setDescription('Farm id').setRequired(true)),
  new SlashCommandBuilder()
    .setName('health')
    .setDescription('Farm health status')
    .addStringOption((opt) => opt.setName('farm').setDescription('Farm id').setRequired(true)),
  new SlashCommandBuilder()
    .setName('production')
    .setDescription('Production rate')
    .addStringOption((opt) => opt.setName('farm').setDescription('Farm id').setRequired(true)),
  new SlashCommandBuilder()
    .setName('alerts')
    .setDescription('Recent alerts, or acknowledge one')
    .addStringOption((opt) =>
      opt.setName('farm').setDescription('Farm id (omit for all farms)').setRequired(false),
    )
    .addIntegerOption((opt) =>
      opt.setName('ack').setDescription('Alert id to acknowledge').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('workers')
    .setDescription('Carpet worker status')
    .addStringOption((opt) => opt.setName('farm').setDescription('Farm id').setRequired(true)),
  new SlashCommandBuilder()
    .setName('scan')
    .setDescription('Trigger a farm scan')
    .addStringOption((opt) =>
      opt.setName('farm').setDescription('Farm id (omit for all farms)').setRequired(false),
    ),
].map((builder) => builder.toJSON());

function unknownFarmMessage(farmRegistry: FarmRegistry, farmId: string): string {
  const known = farmRegistry
    .getAll()
    .map((farm) => farm.id)
    .join(', ');
  return `Unknown farm \`${farmId}\`. Known farms: ${known || '(none configured)'}`;
}

/** Commands become jobs/queries exactly like the REST API (TECHNICAL_SPEC §16) — Discord never touches Mineflayer directly. */
export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
  deps: DiscordBotDeps,
): Promise<void> {
  const { config, farmRegistry, db, alertService, enqueueScan } = deps;

  if (config.whitelist.length > 0 && !config.whitelist.includes(interaction.user.id)) {
    await interaction.reply({
      content: 'You are not authorized to use this bot.',
      ephemeral: true,
    });
    return;
  }

  switch (interaction.commandName) {
    case 'help': {
      await interaction.reply(
        '`/farm`, `/storage`, `/health`, `/production`, `/alerts`, `/workers`, `/scan`, `/help`',
      );
      return;
    }
    case 'farm': {
      const farmId = interaction.options.getString('farm', true);
      const farm = farmRegistry.get(farmId);
      if (!farm) {
        await interaction.reply(unknownFarmMessage(farmRegistry, farmId));
        return;
      }
      const health = getLatestHealth(db, farm.id);
      const worker = getWorkerStatus(db, farm.id);
      await interaction.reply(
        `**${farm.id}** (${farm.dimension})\n` +
          `Health: ${health?.status ?? 'UNKNOWN'}\n` +
          `Worker present: ${worker ? String(worker.present) : 'unknown'}`,
      );
      return;
    }
    case 'storage': {
      const farmId = interaction.options.getString('farm', true);
      const farm = farmRegistry.get(farmId);
      if (!farm) {
        await interaction.reply(unknownFarmMessage(farmRegistry, farmId));
        return;
      }
      const batch = getLatestStorageBatch(db, farm.id, farm.containers.length);
      const avg = averageFillPercent(batch);
      await interaction.reply(
        avg === null
          ? `No storage data yet for **${farm.id}**.`
          : `**${farm.id}** storage: ${String(avg)}% full across ${String(batch.length)} container(s).`,
      );
      return;
    }
    case 'health': {
      const farmId = interaction.options.getString('farm', true);
      const farm = farmRegistry.get(farmId);
      if (!farm) {
        await interaction.reply(unknownFarmMessage(farmRegistry, farmId));
        return;
      }
      const latest = getLatestHealth(db, farm.id);
      await interaction.reply(
        latest
          ? `**${farm.id}**: ${latest.status}${latest.reason ? ` (${latest.reason})` : ''}`
          : `No health data yet for **${farm.id}**.`,
      );
      return;
    }
    case 'production': {
      const farmId = interaction.options.getString('farm', true);
      const farm = farmRegistry.get(farmId);
      if (!farm) {
        await interaction.reply(unknownFarmMessage(farmRegistry, farmId));
        return;
      }
      const latest = getLatestProduction(db, farm.id);
      await interaction.reply(
        latest
          ? `**${farm.id}**: ${latest.itemsPerHour.toFixed(1)} items/hour (rolling avg ${latest.rollingAverageItemsPerHour.toFixed(1)})`
          : `No production data yet for **${farm.id}**.`,
      );
      return;
    }
    case 'alerts': {
      const ackId = interaction.options.getInteger('ack');
      if (ackId !== null) {
        await interaction.reply(
          alertService.acknowledge(ackId)
            ? `Acknowledged alert #${String(ackId)}.`
            : `Alert #${String(ackId)} not found or not open.`,
        );
        return;
      }

      const farmId = interaction.options.getString('farm');
      if (farmId !== null && !farmRegistry.get(farmId)) {
        await interaction.reply(unknownFarmMessage(farmRegistry, farmId));
        return;
      }
      const rows = getAlerts(db, farmId ?? undefined, 10);
      await interaction.reply(
        rows.length === 0
          ? 'No alerts.'
          : rows
              .map((a) => `[${a.state}] ${a.type}${a.farmId ? ` (${a.farmId})` : ''}: ${a.message}`)
              .join('\n'),
      );
      return;
    }
    case 'workers': {
      const farmId = interaction.options.getString('farm', true);
      const farm = farmRegistry.get(farmId);
      if (!farm) {
        await interaction.reply(unknownFarmMessage(farmRegistry, farmId));
        return;
      }
      const worker = getWorkerStatus(db, farm.id);
      await interaction.reply(
        worker
          ? `**${farm.carpetWorker}** on ${farm.id}: present=${String(worker.present)} atExpectedPosition=${String(worker.atExpectedPosition)} alive=${String(worker.alive)}`
          : `No worker data yet for **${farm.id}**.`,
      );
      return;
    }
    case 'scan': {
      const farmId = interaction.options.getString('farm');
      if (farmId !== null) {
        const farm = farmRegistry.get(farmId);
        if (!farm) {
          await interaction.reply(unknownFarmMessage(farmRegistry, farmId));
          return;
        }
        enqueueScan(farm);
        await interaction.reply(`Queued a scan of **${farm.id}**.`);
        return;
      }
      const farms = farmRegistry.getAll();
      for (const farm of farms) enqueueScan(farm);
      await interaction.reply(`Queued a scan of all ${String(farms.length)} farm(s).`);
      return;
    }
  }
}

/** Alert/health notifications (ARCHITECTURE.md "Discord" -> Notifications), same subscribe/react shape as services/persistence listeners. */
function registerNotifications(
  postToChannel: (content: string) => Promise<void>,
  eventBus: EventBus<AppEventMap>,
): () => void {
  const unsubscribers = [
    eventBus.subscribe('AlertOpened', (event) => {
      void postToChannel(
        `\u{1F6A8} **${event.type}**${event.farmId ? ` (${event.farmId})` : ''}: ${event.message}`,
      );
    }),
    eventBus.subscribe('FarmHealthChanged', (event) => {
      void postToChannel(
        `Farm **${event.farmId}** health -> **${event.status}**${event.reason ? ` (${event.reason})` : ''}`,
      );
    }),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

/** No-op handle for a disabled/unconfigured adapter, so bootstrap can call stop() unconditionally on shutdown. */
function noopHandle(): DiscordBotHandle {
  return { stop: () => Promise.resolve() };
}

export function startDiscordBot(deps: DiscordBotDeps): DiscordBotHandle {
  const { config, token } = deps;
  const logger = deps.logger.child({ module: 'integrations.discord' });

  if (!config.enabled) {
    logger.info('discord adapter disabled');
    return noopHandle();
  }
  if (!token) {
    logger.warn('discord enabled but DISCORD_BOT_TOKEN is not set; skipping');
    return noopHandle();
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  let unsubscribeNotifications: (() => void) | undefined;

  client.once('ready', (readyClient) => {
    logger.info({ user: readyClient.user.tag }, 'discord bot connected');

    const rest = new REST({ version: '10' }).setToken(token);
    const route = config.guildId
      ? Routes.applicationGuildCommands(readyClient.user.id, config.guildId)
      : Routes.applicationCommands(readyClient.user.id);
    rest.put(route, { body: COMMANDS }).catch((error: unknown) => {
      logger.error({ err: error }, 'failed to register slash commands');
    });

    if (config.notifyChannelId) {
      const channelId = config.notifyChannelId;
      const postToChannel = async (content: string): Promise<void> => {
        const channel = await readyClient.channels.fetch(channelId).catch(() => null);
        if (!channel?.isSendable()) return;
        await channel.send(content);
      };
      unsubscribeNotifications = registerNotifications(postToChannel, deps.eventBus);
    } else {
      logger.warn('discord notifyChannelId not configured; notifications will not be posted');
    }
  });

  client.on('interactionCreate', (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    handleInteraction(interaction, deps).catch((error: unknown) => {
      logger.error({ err: error, command: interaction.commandName }, 'command failed');
    });
  });

  client.login(token).catch((error: unknown) => {
    logger.error({ err: error }, 'failed to log in to discord');
  });

  return {
    stop: async () => {
      unsubscribeNotifications?.();
      await client.destroy();
    },
  };
}
