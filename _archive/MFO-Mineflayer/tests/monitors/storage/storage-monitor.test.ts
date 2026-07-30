import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import { StorageMonitor } from '../../../src/monitors/storage/storage-monitor.js';
import { createLogger } from '../../../src/core/logger/logger.js';
import type { FarmDefinition } from '../../../src/core/registry/farm-definition.js';
import type { ScannedItem } from '../../../src/core/event-bus/events.js';

interface FakeContainer {
  readonly capacity: number;
  readonly items: readonly ScannedItem[];
}

type ContainerBehavior = FakeContainer | 'missing-block' | 'open-error';

function positionKey(position: { x: number; y: number; z: number }): string {
  return `${String(position.x)},${String(position.y)},${String(position.z)}`;
}

function createFakeBot(containers: Record<string, ContainerBehavior>): {
  bot: Bot;
  closeWindow: ReturnType<typeof vi.fn>;
} {
  const closeWindow = vi.fn();
  const blockAt = vi.fn((position: { x: number; y: number; z: number }) => {
    const key = positionKey(position);
    if (containers[key] === 'missing-block') return null;
    return { __key: key };
  });
  const openContainer = vi.fn((block: { __key: string }) => {
    const behavior = containers[block.__key];
    if (behavior === undefined || behavior === 'open-error' || behavior === 'missing-block') {
      return Promise.reject(new Error('cannot open container'));
    }
    return Promise.resolve({
      inventoryStart: behavior.capacity,
      containerItems: () =>
        behavior.items.map((item) => ({ name: item.itemId, count: item.count })),
    });
  });
  const bot = { blockAt, openContainer, closeWindow } as unknown as Bot;
  return { bot, closeWindow };
}

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

function farmWithContainers(
  positions: readonly { x: number; y: number; z: number }[],
): FarmDefinition {
  return {
    id: 'iron',
    dimension: 'overworld',
    teleport: { x: 120, y: 80, z: -500 },
    carpetWorker: 'worker_iron',
    containers: positions.map((position) => ({ type: 'chest', position })),
    entityScan: { radius: 16, allow: [] },
    workerExpectation: { position: { x: 120, y: 80, z: -500 }, toleranceBlocks: 5 },
  };
}

describe('StorageMonitor', () => {
  it('supports farms with configured containers only', () => {
    const monitor = new StorageMonitor();
    expect(monitor.supports(farmWithContainers([{ x: 1, y: 2, z: 3 }]))).toBe(true);
    expect(monitor.supports(farmWithContainers([]))).toBe(false);
  });

  it('produces a ContainerScanned event and an aggregate StorageUpdated event', async () => {
    const farm = farmWithContainers([{ x: 123, y: 79, z: -501 }]);
    const { bot, closeWindow } = createFakeBot({
      '123,79,-501': { capacity: 27, items: [{ itemId: 'iron_ingot', count: 64 }] },
    });
    const monitor = new StorageMonitor();

    const result = await monitor.execute({
      bot,
      farm,
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      type: 'ContainerScanned',
      payload: {
        farmId: 'iron',
        containerType: 'chest',
        position: { x: 123, y: 79, z: -501 },
        capacity: 27,
        occupiedSlots: 1,
        fillPercent: 3.7,
        items: [{ itemId: 'iron_ingot', count: 64 }],
      },
    });
    expect(result.events[1]).toMatchObject({
      type: 'StorageUpdated',
      payload: { farmId: 'iron', containerCount: 1 },
    });
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it('skips a container with no loaded block and continues', async () => {
    const farm = farmWithContainers([
      { x: 1, y: 1, z: 1 },
      { x: 2, y: 2, z: 2 },
    ]);
    const { bot } = createFakeBot({
      '1,1,1': 'missing-block',
      '2,2,2': { capacity: 27, items: [] },
    });
    const monitor = new StorageMonitor();

    const result = await monitor.execute({
      bot,
      farm,
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      type: 'ContainerScanned',
      payload: { position: { x: 2, y: 2, z: 2 } },
    });
  });

  it('skips a container that fails to open and continues', async () => {
    const farm = farmWithContainers([
      { x: 1, y: 1, z: 1 },
      { x: 2, y: 2, z: 2 },
    ]);
    const { bot } = createFakeBot({
      '1,1,1': 'open-error',
      '2,2,2': { capacity: 27, items: [] },
    });
    const monitor = new StorageMonitor();

    const result = await monitor.execute({
      bot,
      farm,
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(2);
  });

  it('returns no events when the farm has no containers', async () => {
    const monitor = new StorageMonitor();
    const result = await monitor.execute({
      bot: createFakeBot({}).bot,
      farm: farmWithContainers([]),
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toEqual([]);
  });

  it('respects an already-aborted signal', async () => {
    const farm = farmWithContainers([{ x: 1, y: 1, z: 1 }]);
    const { bot } = createFakeBot({ '1,1,1': { capacity: 27, items: [] } });
    const monitor = new StorageMonitor();
    const controller = new AbortController();
    controller.abort();

    await expect(
      monitor.execute({ bot, farm, logger: createSilentLogger(), signal: controller.signal }),
    ).rejects.toThrow();
  });
});
