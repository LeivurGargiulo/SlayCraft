import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import {
  ManagerConnection,
  type BotFactory,
} from '../../../src/manager/connection/manager-connection.js';
import { TeleportService } from '../../../src/manager/teleport/teleport-service.js';
import { TeleportError } from '../../../src/manager/teleport/teleport-error.js';
import { EventBus } from '../../../src/core/event-bus/event-bus.js';
import type { AppEventMap } from '../../../src/core/event-bus/events.js';
import { createLogger } from '../../../src/core/logger/logger.js';
import type { ManagerConfig } from '../../../src/core/config/index.js';

function createFakeBot(): Bot {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { chat: vi.fn(), entity: {} }) as unknown as Bot;
}

function createConfig(): ManagerConfig {
  return {
    monitors: ['storage', 'entities', 'workers', 'chunks'],
    server: { host: 'localhost', port: 25565, keepAliveTimeoutMs: 60_000 },
    bot: { username: 'MFO-Manager', auth: 'offline' },
    reconnect: { enabled: true, initialDelayMs: 1000, maxDelayMs: 60000 },
    scan: { enabled: true, intervalMs: 300_000 },
    api: { host: '0.0.0.0', port: 3000 },
  };
}

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

function connectWithFakeBot(bot: Bot): ManagerConnection {
  const factory: BotFactory = () => bot;
  const eventBus = new EventBus<AppEventMap>();
  const connection = new ManagerConnection({
    config: createConfig(),
    eventBus,
    logger: createSilentLogger(),
    createBot: factory,
  });
  connection.connect();
  bot.emit('spawn');
  return connection;
}

describe('TeleportService', () => {
  it('sends a dimension-qualified teleport command and resolves once the server confirms', async () => {
    const bot = createFakeBot();
    const connection = connectWithFakeBot(bot);
    const service = new TeleportService({
      connection,
      eventBus: new EventBus<AppEventMap>(),
      logger: createSilentLogger(),
    });

    const promise = service.teleport({ x: 1, y: 2, z: 3 }, 'the_nether');
    expect(bot.chat).toHaveBeenCalledWith('/execute in minecraft:the_nether run tp @s 1 2 3');

    bot.emit('forcedMove');
    await expect(promise).resolves.toBeUndefined();
  });

  it('publishes ManagerMoved with the position, dimension, and farmId once confirmed', async () => {
    const bot = createFakeBot();
    const connection = connectWithFakeBot(bot);
    const eventBus = new EventBus<AppEventMap>();
    const received: unknown[] = [];
    eventBus.subscribe('ManagerMoved', (event) => received.push(event));
    const service = new TeleportService({ connection, eventBus, logger: createSilentLogger() });

    const promise = service.teleport({ x: 1, y: 2, z: 3 }, 'the_nether', undefined, 'iron');
    bot.emit('forcedMove');
    await promise;

    expect(received).toMatchObject([
      { position: { x: 1, y: 2, z: 3 }, dimension: 'the_nether', farmId: 'iron' },
    ]);
  });

  it('rejects when the manager is not connected', async () => {
    const eventBus = new EventBus<AppEventMap>();
    const connection = new ManagerConnection({
      config: createConfig(),
      eventBus,
      logger: createSilentLogger(),
      createBot: () => createFakeBot(),
    });
    const service = new TeleportService({
      connection,
      eventBus: new EventBus<AppEventMap>(),
      logger: createSilentLogger(),
    });

    await expect(service.teleport({ x: 0, y: 0, z: 0 }, 'overworld')).rejects.toThrow(
      TeleportError,
    );
  });

  it('rejects when the AbortSignal fires before confirmation', async () => {
    const bot = createFakeBot();
    const connection = connectWithFakeBot(bot);
    const service = new TeleportService({
      connection,
      eventBus: new EventBus<AppEventMap>(),
      logger: createSilentLogger(),
    });
    const controller = new AbortController();

    const promise = service.teleport({ x: 0, y: 0, z: 0 }, 'overworld', controller.signal);
    controller.abort();

    await expect(promise).rejects.toThrow(TeleportError);
  });

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects with TeleportError when the server never confirms', async () => {
      const bot = createFakeBot();
      const connection = connectWithFakeBot(bot);
      const service = new TeleportService({
        connection,
        eventBus: new EventBus<AppEventMap>(),
        logger: createSilentLogger(),
        timeoutMs: 1000,
      });

      const promise = service.teleport({ x: 0, y: 0, z: 0 }, 'overworld');
      const assertion = expect(promise).rejects.toThrow(TeleportError);

      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    });
  });
});
