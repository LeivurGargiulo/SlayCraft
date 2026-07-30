import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bot, BotOptions } from 'mineflayer';
import {
  ManagerConnection,
  type BotFactory,
} from '../../../src/manager/connection/manager-connection.js';
import { EventBus } from '../../../src/core/event-bus/event-bus.js';
import type { AppEventMap } from '../../../src/core/event-bus/events.js';
import { createLogger } from '../../../src/core/logger/logger.js';
import type { ManagerConfig } from '../../../src/core/config/index.js';

function createFakeBot(): Bot {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { end: vi.fn() }) as unknown as Bot;
}

function createTrackingBotFactory(): { factory: BotFactory; bots: Bot[]; calls: BotOptions[] } {
  const bots: Bot[] = [];
  const calls: BotOptions[] = [];
  const factory: BotFactory = (options) => {
    calls.push(options);
    const bot = createFakeBot();
    bots.push(bot);
    return bot;
  };
  return { factory, bots, calls };
}

function createConfig(reconnectOverrides: Partial<ManagerConfig['reconnect']> = {}): ManagerConfig {
  return {
    monitors: ['storage', 'entities', 'workers', 'chunks'],
    server: { host: 'localhost', port: 25565, keepAliveTimeoutMs: 60_000 },
    bot: { username: 'MFO-Manager', auth: 'offline' },
    reconnect: { enabled: true, initialDelayMs: 1000, maxDelayMs: 60000, ...reconnectOverrides },
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

function nthBot(bots: Bot[], index: number): Bot {
  const bot = bots[index];
  if (bot === undefined) throw new Error(`expected a bot at index ${String(index)}`);
  return bot;
}

describe('ManagerConnection', () => {
  it('publishes ManagerConnected when the bot spawns', () => {
    const { factory, bots } = createTrackingBotFactory();
    const eventBus = new EventBus<AppEventMap>();
    const received: AppEventMap['ManagerConnected'][] = [];
    eventBus.subscribe('ManagerConnected', (event) => {
      received.push(event);
    });

    const connection = new ManagerConnection({
      config: createConfig(),
      eventBus,
      logger: createSilentLogger(),
      createBot: factory,
    });

    connection.connect();
    nthBot(bots, 0).emit('spawn');

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ host: 'localhost', port: 25565, username: 'MFO-Manager' });
  });

  it('passes the configured keep-alive tolerance through to mineflayer', () => {
    const { factory, calls } = createTrackingBotFactory();
    const connection = new ManagerConnection({
      config: createConfig(),
      eventBus: new EventBus<AppEventMap>(),
      logger: createSilentLogger(),
      createBot: factory,
    });

    connection.connect();

    expect(calls[0]).toMatchObject({ checkTimeoutInterval: 60_000 });
  });

  describe('reconnect behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('publishes ManagerDisconnected and reconnects with exponential backoff', () => {
      const { factory, bots, calls } = createTrackingBotFactory();
      const eventBus = new EventBus<AppEventMap>();
      const disconnected: AppEventMap['ManagerDisconnected'][] = [];
      eventBus.subscribe('ManagerDisconnected', (event) => {
        disconnected.push(event);
      });

      const connection = new ManagerConnection({
        config: createConfig(),
        eventBus,
        logger: createSilentLogger(),
        createBot: factory,
      });

      connection.connect();
      expect(calls).toHaveLength(1);

      nthBot(bots, 0).emit('end', 'server restart');
      expect(disconnected).toHaveLength(1);
      expect(disconnected[0]?.reason).toBe('server restart');

      vi.advanceTimersByTime(999);
      expect(calls).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(calls).toHaveLength(2);

      nthBot(bots, 1).emit('end', 'server restart again');
      vi.advanceTimersByTime(1999);
      expect(calls).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(calls).toHaveLength(3);
    });

    it('stops reconnecting once maxAttempts is reached', () => {
      const { factory, calls, bots } = createTrackingBotFactory();
      const eventBus = new EventBus<AppEventMap>();

      const connection = new ManagerConnection({
        config: createConfig({ maxAttempts: 1 }),
        eventBus,
        logger: createSilentLogger(),
        createBot: factory,
      });

      connection.connect();
      nthBot(bots, 0).emit('end', 'first disconnect');
      vi.advanceTimersByTime(1000);
      expect(calls).toHaveLength(2);

      nthBot(bots, 1).emit('end', 'second disconnect');
      vi.advanceTimersByTime(60000);
      expect(calls).toHaveLength(2);
    });

    it('does not reconnect after shutdown', () => {
      const { factory, calls, bots } = createTrackingBotFactory();
      const eventBus = new EventBus<AppEventMap>();

      const connection = new ManagerConnection({
        config: createConfig(),
        eventBus,
        logger: createSilentLogger(),
        createBot: factory,
      });

      connection.connect();
      connection.shutdown();
      nthBot(bots, 0).emit('end', 'closed by shutdown');
      vi.advanceTimersByTime(60000);

      expect(calls).toHaveLength(1);
    });
  });
});
