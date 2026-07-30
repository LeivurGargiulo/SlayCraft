import { describe, expect, it } from 'vitest';
import type { Bot } from 'mineflayer';
import type { Entity } from 'prismarine-entity';
import { EntityMonitor } from '../../../src/monitors/entities/entity-monitor.js';
import { createLogger } from '../../../src/core/logger/logger.js';
import type { FarmDefinition } from '../../../src/core/registry/farm-definition.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

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
    id: 'guardian',
    dimension: 'overworld',
    teleport: { x: 0, y: 64, z: 0 },
    carpetWorker: 'worker_guardian',
    containers: [],
    entityScan: { radius: 16, allow: ['guardian'] },
    workerExpectation: { position: { x: 0, y: 64, z: 0 }, toleranceBlocks: 5 },
    ...overrides,
  };
}

function createFakeBot(self: Entity, entities: readonly Entity[]): Bot {
  const entityMap: Record<string, Entity> = {};
  for (const entity of [self, ...entities]) {
    entityMap[String(entity.id)] = entity;
  }
  return { entity: self, entities: entityMap } as unknown as Bot;
}

const selfEntity = fakeEntity({
  id: 0,
  type: 'player',
  username: 'MFO-Manager',
  position: { x: 0, y: 64, z: 0 } as Entity['position'],
});

describe('EntityMonitor', () => {
  it('supports every farm', () => {
    expect(new EntityMonitor().supports()).toBe(true);
  });

  it('ignores the Manager itself and entities outside the scan radius', async () => {
    const farFriendly = fakeEntity({
      id: 2,
      type: 'mob',
      name: 'guardian',
      position: { x: 100, y: 64, z: 100 } as Entity['position'],
    });
    const bot = createFakeBot(selfEntity, [farFriendly]);
    const monitor = new EntityMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toEqual([]);
  });

  it('marks an entity on the allow list as expected', async () => {
    const guardian = fakeEntity({
      id: 2,
      type: 'mob',
      name: 'guardian',
      position: { x: 1, y: 64, z: 1 } as Entity['position'],
    });
    const bot = createFakeBot(selfEntity, [guardian]);
    const monitor = new EntityMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'EntityDetected',
      payload: { name: 'guardian', expected: true },
    });
  });

  it('marks a mob not on the allow list as unexpected without a player alert', async () => {
    const zombie = fakeEntity({
      id: 2,
      type: 'hostile',
      name: 'zombie',
      position: { x: 1, y: 64, z: 1 } as Entity['position'],
    });
    const bot = createFakeBot(selfEntity, [zombie]);
    const monitor = new EntityMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'EntityDetected',
      payload: { name: 'zombie', expected: false },
    });
  });

  it('treats the configured carpet worker player as expected', async () => {
    const worker = fakeEntity({
      id: 2,
      type: 'player',
      username: 'worker_guardian',
      position: { x: 1, y: 64, z: 1 } as Entity['position'],
    });
    const bot = createFakeBot(selfEntity, [worker]);
    const monitor = new EntityMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      type: 'EntityDetected',
      payload: { name: 'worker_guardian', expected: true },
    });
  });

  it('emits UnknownPlayerDetected for a player who is not the worker', async () => {
    const intruder = fakeEntity({
      id: 2,
      type: 'player',
      username: 'SomePlayer',
      position: { x: 1, y: 64, z: 1 } as Entity['position'],
    });
    const bot = createFakeBot(selfEntity, [intruder]);
    const monitor = new EntityMonitor();

    const result = await monitor.execute({
      bot,
      farm: createFarm(),
      logger: createSilentLogger(),
      signal: new AbortController().signal,
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      type: 'EntityDetected',
      payload: { name: 'SomePlayer', expected: false },
    });
    expect(result.events[1]).toMatchObject({
      type: 'UnknownPlayerDetected',
      payload: { username: 'SomePlayer', farmId: 'guardian' },
    });
  });
});
