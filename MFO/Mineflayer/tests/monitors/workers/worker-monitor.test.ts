import { describe, expect, it } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { WorkerMonitor } from '../../../src/monitors/workers/worker-monitor.js';
import type { FarmDefinition } from '../../../src/core/registry/farm-definition.js';

function fakeEntity(overrides: Partial<Entity> & { position: Entity['position'] }): Entity {
  return {
    id: 1,
    type: 'mob',
    getCustomName: () => null,
    ...overrides,
  } as unknown as Entity;
}

function createFarm(overrides: Partial<FarmDefinition> = {}): FarmDefinition {
  return {
    id: 'iron',
    dimension: 'overworld',
    teleport: { x: 120, y: 80, z: -500 },
    carpetWorker: 'worker_iron',
    containers: [],
    entityScan: { radius: 16, allow: [] },
    workerExpectation: { position: { x: 120, y: 80, z: -500 }, toleranceBlocks: 5 },
    ...overrides,
  };
}

function createFakeBot(entities: readonly Entity[]): Bot {
  const entityMap: Record<string, Entity> = {};
  for (const entity of entities) entityMap[String(entity.id)] = entity;
  return { entities: entityMap } as unknown as Bot;
}

describe('WorkerMonitor', () => {
  it('supports every farm', () => {
    expect(new WorkerMonitor().supports()).toBe(true);
  });

  it('emits WorkerMissing when the carpet worker is not among the entities', async () => {
    const bot = createFakeBot([]);
    const monitor = new WorkerMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: undefined as never,
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'WorkerMissing',
      payload: { username: 'worker_iron' },
    });
  });

  it('emits WorkerVerified with atExpectedPosition true when within tolerance', async () => {
    const worker = fakeEntity({
      id: 2,
      type: 'player',
      username: 'worker_iron',
      position: { x: 121, y: 80, z: -500 } as Entity['position'],
    });
    const bot = createFakeBot([worker]);
    const monitor = new WorkerMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: undefined as never,
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'WorkerVerified',
      payload: { atExpectedPosition: true, alive: true },
    });
  });

  it('emits WorkerVerified with atExpectedPosition false when outside tolerance', async () => {
    const worker = fakeEntity({
      id: 2,
      type: 'player',
      username: 'worker_iron',
      position: { x: 200, y: 80, z: -500 } as Entity['position'],
    });
    const bot = createFakeBot([worker]);
    const monitor = new WorkerMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: undefined as never,
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'WorkerVerified',
      payload: { atExpectedPosition: false },
    });
  });

  it('treats a worker with zero health as not alive', async () => {
    const worker = fakeEntity({
      id: 2,
      type: 'player',
      username: 'worker_iron',
      health: 0,
      position: { x: 120, y: 80, z: -500 } as Entity['position'],
    });
    const bot = createFakeBot([worker]);
    const monitor = new WorkerMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: undefined as never,
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'WorkerVerified', payload: { alive: false } });
  });
});
