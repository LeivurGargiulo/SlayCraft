import type { FarmConfig, FarmsConfig } from '../config/index.js';
import type { Vector3 } from '../../shared/types/vector3.js';
import type { FarmDefinition } from './farm-definition.js';

function toVector3([x, y, z]: readonly [number, number, number]): Vector3 {
  return { x, y, z };
}

function buildFarm(id: string, config: FarmConfig): FarmDefinition {
  const teleport = { x: config.teleport.x, y: config.teleport.y, z: config.teleport.z };

  return {
    id,
    dimension: config.dimension,
    teleport,
    carpetWorker: config.carpetWorker,
    containers: config.storage.map((container) => ({
      type: container.type,
      position: toVector3(container.position),
    })),
    entityScan: { radius: config.entities.radius, allow: config.entities.allow },
    workerExpectation: {
      position: config.worker.position ? toVector3(config.worker.position) : teleport,
      toleranceBlocks: config.worker.toleranceBlocks,
    },
  };
}

/** Immutable, built once from validated config at startup. */
export class FarmRegistry {
  private readonly farms: ReadonlyMap<string, FarmDefinition>;

  constructor(config: FarmsConfig) {
    this.farms = new Map(
      Object.entries(config.farms).map(([id, farm]) => [id, buildFarm(id, farm)]),
    );
  }

  getAll(): readonly FarmDefinition[] {
    return [...this.farms.values()];
  }

  get(id: string): FarmDefinition | undefined {
    return this.farms.get(id);
  }
}
