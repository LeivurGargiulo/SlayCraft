import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import { ScanFarmJob } from '../../src/monitors/scan-farm-job.js';
import { TeleportError } from '../../src/manager/teleport/teleport-error.js';
import type { TeleportService } from '../../src/manager/teleport/teleport-service.js';
import type { ManagerConnection } from '../../src/manager/connection/manager-connection.js';
import { EventBus } from '../../src/core/event-bus/event-bus.js';
import type { AppEventMap } from '../../src/core/event-bus/events.js';
import { createLogger } from '../../src/core/logger/logger.js';
import type { FarmDefinition } from '../../src/core/registry/farm-definition.js';
import type { Monitor, MonitorEvent } from '../../src/monitors/monitor.js';
import type { JobContext } from '../../src/core/scheduler/job.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

function createFarm(): FarmDefinition {
  return {
    id: 'iron',
    dimension: 'overworld',
    teleport: { x: 120, y: 80, z: -500 },
    carpetWorker: 'worker_iron',
    containers: [{ type: 'chest', position: { x: 123, y: 79, z: -501 } }],
    entityScan: { radius: 16, allow: [] },
    workerExpectation: { position: { x: 120, y: 80, z: -500 }, toleranceBlocks: 5 },
  };
}

function createFakeTeleportService(): {
  teleport: ReturnType<typeof vi.fn>;
  service: TeleportService;
} {
  const teleport = vi.fn(() => Promise.resolve());
  return { teleport, service: { teleport } as unknown as TeleportService };
}

function createFakeConnection(bot: Bot | undefined): ManagerConnection {
  return { getBot: () => bot } as unknown as ManagerConnection;
}

function createFakeMonitor(
  id: string,
  options: { supports?: boolean; events?: readonly MonitorEvent[] } = {},
): { monitor: Monitor; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(() => Promise.resolve({ events: options.events ?? [] }));
  const monitor: Monitor = {
    id,
    supports: () => options.supports ?? true,
    execute,
  };
  return { monitor, execute };
}

function createContext(): JobContext {
  return { correlationId: 'test-correlation-id', signal: new AbortController().signal };
}

describe('ScanFarmJob', () => {
  it('teleports to the farm before running monitors', async () => {
    const farm = createFarm();
    const { teleport, service } = createFakeTeleportService();
    const { monitor } = createFakeMonitor('storage');
    const job = new ScanFarmJob({
      farm,
      monitors: [monitor],
      connection: createFakeConnection({} as Bot),
      teleportService: service,
      eventBus: new EventBus<AppEventMap>(),
      logger: createSilentLogger(),
    });

    const context = createContext();
    await job.run(context);

    expect(teleport).toHaveBeenCalledWith(farm.teleport, farm.dimension, context.signal, farm.id);
  });

  it('only runs monitors that support the farm', async () => {
    const { service } = createFakeTeleportService();
    const { monitor: supported, execute: supportedExecute } = createFakeMonitor('storage', {
      supports: true,
    });
    const { monitor: unsupported, execute: unsupportedExecute } = createFakeMonitor('entities', {
      supports: false,
    });
    const job = new ScanFarmJob({
      farm: createFarm(),
      monitors: [supported, unsupported],
      connection: createFakeConnection({} as Bot),
      teleportService: service,
      eventBus: new EventBus<AppEventMap>(),
      logger: createSilentLogger(),
    });

    await job.run(createContext());

    expect(supportedExecute).toHaveBeenCalledTimes(1);
    expect(unsupportedExecute).not.toHaveBeenCalled();
  });

  it('publishes every event a monitor returns onto the event bus', async () => {
    const { service } = createFakeTeleportService();
    const events: MonitorEvent[] = [
      {
        type: 'StorageUpdated',
        payload: {
          occurredAt: new Date(),
          farmId: 'iron',
          averageFillPercent: 50,
          containerCount: 1,
        },
      },
    ];
    const { monitor } = createFakeMonitor('storage', { events });
    const eventBus = new EventBus<AppEventMap>();
    const received: AppEventMap['StorageUpdated'][] = [];
    eventBus.subscribe('StorageUpdated', (event) => {
      received.push(event);
    });

    const job = new ScanFarmJob({
      farm: createFarm(),
      monitors: [monitor],
      connection: createFakeConnection({} as Bot),
      teleportService: service,
      eventBus,
      logger: createSilentLogger(),
    });

    await job.run(createContext());

    expect(received).toEqual([events[0]?.payload]);
  });

  it('throws if the manager disconnects between teleport and monitor execution', async () => {
    const { service } = createFakeTeleportService();
    const { monitor, execute } = createFakeMonitor('storage');
    const job = new ScanFarmJob({
      farm: createFarm(),
      monitors: [monitor],
      connection: createFakeConnection(undefined),
      teleportService: service,
      eventBus: new EventBus<AppEventMap>(),
      logger: createSilentLogger(),
    });

    await expect(job.run(createContext())).rejects.toThrow(TeleportError);
    expect(execute).not.toHaveBeenCalled();
  });
});
