import { describe, expect, it } from 'vitest';
import { FarmRegistry } from '../../../src/core/registry/farm-registry.js';
import type { FarmsConfig } from '../../../src/core/config/index.js';

function config(overrides: Partial<FarmsConfig['farms']['iron']> = {}): FarmsConfig {
  return {
    farms: {
      iron: {
        dimension: 'overworld',
        teleport: { x: 120, y: 80, z: -500 },
        carpetWorker: 'worker_iron',
        storage: [{ type: 'chest', position: [123, 79, -501] }],
        entities: { radius: 16, allow: [] },
        worker: { toleranceBlocks: 5 },
        ...overrides,
      },
    },
  };
}

describe('FarmRegistry', () => {
  it('builds a FarmDefinition per configured farm', () => {
    const registry = new FarmRegistry(config());
    const farms = registry.getAll();

    expect(farms).toHaveLength(1);
    expect(farms[0]).toMatchObject({
      id: 'iron',
      dimension: 'overworld',
      teleport: { x: 120, y: 80, z: -500 },
      carpetWorker: 'worker_iron',
    });
  });

  it('converts container position tuples to Vector3', () => {
    const registry = new FarmRegistry(config());
    const farm = registry.get('iron');

    expect(farm?.containers).toEqual([{ type: 'chest', position: { x: 123, y: 79, z: -501 } }]);
  });

  it('carries the entity scan config through to the FarmDefinition', () => {
    const registry = new FarmRegistry(
      config({ entities: { radius: 24, allow: ['villager', 'minecart'] } }),
    );
    const farm = registry.get('iron');

    expect(farm?.entityScan).toEqual({ radius: 24, allow: ['villager', 'minecart'] });
  });

  it('falls back the worker expectation position to the farm teleport point', () => {
    const registry = new FarmRegistry(config());
    const farm = registry.get('iron');

    expect(farm?.workerExpectation).toEqual({
      position: { x: 120, y: 80, z: -500 },
      toleranceBlocks: 5,
    });
  });

  it('uses an explicit worker expectation position when provided', () => {
    const registry = new FarmRegistry(
      config({ worker: { position: [1, 2, 3], toleranceBlocks: 10 } }),
    );
    const farm = registry.get('iron');

    expect(farm?.workerExpectation).toEqual({
      position: { x: 1, y: 2, z: 3 },
      toleranceBlocks: 10,
    });
  });

  it('returns undefined for an unknown farm id', () => {
    const registry = new FarmRegistry(config());
    expect(registry.get('gold')).toBeUndefined();
  });
});
