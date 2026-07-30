import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import {
  handleInteraction,
  type DiscordBotDeps,
} from '../../../src/integrations/discord/discord-bot.js';
import { createDatabase } from '../../../src/database/client.js';
import { health } from '../../../src/database/schema.js';
import { FarmRegistry } from '../../../src/core/registry/farm-registry.js';
import { AlertService } from '../../../src/services/alerts/alert-service.js';
import { EventBus } from '../../../src/core/event-bus/event-bus.js';
import type { AppEventMap } from '../../../src/core/event-bus/events.js';
import { createLogger } from '../../../src/core/logger/logger.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

function createDeps(overrides: Partial<DiscordBotDeps> = {}): DiscordBotDeps {
  const { db } = createDatabase(':memory:');
  const logger = createSilentLogger();
  const eventBus = new EventBus<AppEventMap>();
  const alertService = new AlertService(eventBus, db, logger, {
    storageWarningPercent: 90,
    storageFullPercent: 100,
  });
  const farmRegistry = new FarmRegistry({
    farms: {
      iron: {
        dimension: 'overworld',
        teleport: { x: 1, y: 2, z: 3 },
        carpetWorker: 'worker_iron',
        storage: [],
        entities: { radius: 16, allow: [] },
        worker: { toleranceBlocks: 5 },
      },
    },
  });
  return {
    config: { enabled: true, whitelist: [], ...overrides.config },
    token: 'unused',
    farmRegistry,
    db,
    alertService,
    enqueueScan: vi.fn(() => 'fake-correlation-id'),
    eventBus,
    logger,
    ...overrides,
  };
}

function createMockInteraction(
  commandName: string,
  options: {
    getString?: (name: string) => string | null;
    getInteger?: (name: string) => number | null;
  },
  userId = 'user-1',
): { interaction: ChatInputCommandInteraction; reply: ReturnType<typeof vi.fn> } {
  const reply = vi.fn();
  const interaction = {
    commandName,
    user: { id: userId },
    options: {
      getString: options.getString ?? (() => null),
      getInteger: options.getInteger ?? (() => null),
    },
    reply,
  } as unknown as ChatInputCommandInteraction;
  return { interaction, reply };
}

describe('handleInteraction', () => {
  it('rejects a user not on the whitelist', async () => {
    const deps = createDeps({ config: { enabled: true, whitelist: ['allowed-user'] } });
    const { interaction, reply } = createMockInteraction('help', {}, 'someone-else');

    await handleInteraction(interaction, deps);

    expect(reply).toHaveBeenCalledWith({
      content: 'You are not authorized to use this bot.',
      ephemeral: true,
    });
  });

  it('reports UNKNOWN health for a farm with no health rows yet', async () => {
    const deps = createDeps();
    const { interaction, reply } = createMockInteraction('health', { getString: () => 'iron' });

    await handleInteraction(interaction, deps);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining('No health data yet'));
  });

  it('reports the latest health status when one has been recorded', async () => {
    const deps = createDeps();
    deps.db
      .insert(health)
      .values({ farmId: 'iron', status: 'HEALTHY', occurredAt: new Date() })
      .run();
    const { interaction, reply } = createMockInteraction('health', { getString: () => 'iron' });

    await handleInteraction(interaction, deps);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining('HEALTHY'));
  });

  it('rejects an unknown farm id', async () => {
    const deps = createDeps();
    const { interaction, reply } = createMockInteraction('health', { getString: () => 'gold' });

    await handleInteraction(interaction, deps);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Unknown farm'));
  });

  it('enqueues a scan for every farm when /scan is called with no farm option', async () => {
    const deps = createDeps();
    const { interaction, reply } = createMockInteraction('scan', {});

    await handleInteraction(interaction, deps);

    expect(deps.enqueueScan).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('all 1 farm'));
  });

  it('acknowledges an open alert via /alerts ack', async () => {
    const deps = createDeps();
    const opened: number[] = [];
    deps.eventBus.subscribe('AlertOpened', (event) => opened.push(event.alertId));
    deps.alertService.register();
    deps.eventBus.publish('UnknownPlayerDetected', {
      occurredAt: new Date(),
      farmId: 'iron',
      username: 'Intruder',
      position: { x: 0, y: 0, z: 0 },
    });
    const [alertId] = opened;
    if (alertId === undefined) throw new Error('expected an alert to have opened');

    const { interaction, reply } = createMockInteraction('alerts', { getInteger: () => alertId });

    await handleInteraction(interaction, deps);

    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Acknowledged'));
  });
});
