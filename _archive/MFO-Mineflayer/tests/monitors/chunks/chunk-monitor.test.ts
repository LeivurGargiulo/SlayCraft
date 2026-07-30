import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'mineflayer';
import { ChunkMonitor } from '../../../src/monitors/chunks/chunk-monitor.js';
import type { FarmDefinition } from '../../../src/core/registry/farm-definition.js';

function createFarm(overrides: Partial<FarmDefinition> = {}): FarmDefinition {
  return {
    id: 'iron',
    dimension: 'overworld',
    teleport: { x: 120, y: 80, z: -500 },
    carpetWorker: 'worker_iron',
    containers: [{ type: 'chest', position: { x: 123, y: 79, z: -501 } }],
    entityScan: { radius: 16, allow: [] },
    workerExpectation: { position: { x: 120, y: 80, z: -500 }, toleranceBlocks: 5 },
    ...overrides,
  };
}

function createFakeBot(blockAt: (pos: { x: number; y: number; z: number }) => unknown): Bot {
  return { blockAt } as unknown as Bot;
}

describe('ChunkMonitor', () => {
  it('supports every farm', () => {
    expect(new ChunkMonitor().supports()).toBe(true);
  });

  it('emits ChunkLoaded when every checked position resolves a block', async () => {
    const bot = createFakeBot(() => ({}));
    const monitor = new ChunkMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: undefined as never,
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'ChunkLoaded', payload: { farmId: 'iron' } });
  });

  it('emits ChunkUnloaded listing every position with no loaded block', async () => {
    const blockAt = vi.fn((pos: { x: number; y: number; z: number }) =>
      pos.x === 123 ? undefined : {},
    );
    const bot = createFakeBot(blockAt);
    const monitor = new ChunkMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: undefined as never,
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'ChunkUnloaded',
      payload: { farmId: 'iron', unloadedPositions: [{ x: 123, y: 79, z: -501 }] },
    });
  });

  it('checks the target, worker, and every storage position', async () => {
    const blockAt = vi.fn(() => ({}));
    const bot = createFakeBot(blockAt);
    const monitor = new ChunkMonitor();

    await monitor.execute({
      bot,
      farm: createFarm(),
      logger: undefined as never,
      signal: new AbortController().signal,
    });

    expect(blockAt).toHaveBeenCalledTimes(3);
  });
});
