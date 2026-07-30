import type { Vector3 } from '../../shared/types/vector3.js';
import type { ContainerType } from '../config/index.js';

export interface ContainerDefinition {
  readonly type: ContainerType;
  readonly position: Vector3;
}

export interface EntityScanDefinition {
  readonly radius: number;
  /** Entity type names (e.g. 'villager', 'minecart') allowed beyond the farm's own worker. */
  readonly allow: readonly string[];
}

export interface WorkerExpectationDefinition {
  /** Falls back to the farm's teleport point when omitted in config. */
  readonly position: Vector3;
  readonly toleranceBlocks: number;
}

export interface FarmDefinition {
  readonly id: string;
  readonly dimension: string;
  readonly teleport: Vector3;
  readonly carpetWorker: string;
  readonly containers: readonly ContainerDefinition[];
  readonly entityScan: EntityScanDefinition;
  readonly workerExpectation: WorkerExpectationDefinition;
}
