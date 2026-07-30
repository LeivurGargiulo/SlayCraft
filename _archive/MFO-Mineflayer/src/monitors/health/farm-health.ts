import type { FarmHealthStatus } from '../../shared/types/farm-health.js';

export interface FarmHealthInput {
  readonly managerConnected: boolean;
  /** undefined until the farm's first WorkerVerified/WorkerMissing ever arrives. */
  readonly workerPresent?: boolean;
  readonly chunksLoaded?: boolean;
  readonly storageFillPercent?: number;
  readonly itemsPerHour?: number;
}

export interface FarmHealthResult {
  readonly status: FarmHealthStatus;
  readonly reason?: string;
}

const STORAGE_FULL_PERCENT = 100;

/** Pure decision tree, TECHNICAL_SPEC §13 (see shared/types/farm-health.ts for the OFFLINE/UNKNOWN split). */
export function computeFarmHealth(input: FarmHealthInput): FarmHealthResult {
  if (!input.managerConnected) return { status: 'OFFLINE' };
  if (input.workerPresent === undefined) return { status: 'UNKNOWN' };
  if (!input.workerPresent) return { status: 'CRITICAL', reason: 'worker_missing' };
  if (input.chunksLoaded === false) return { status: 'CRITICAL', reason: 'chunk_unloaded' };
  if ((input.storageFillPercent ?? 0) >= STORAGE_FULL_PERCENT) {
    return { status: 'WARNING', reason: 'storage_full' };
  }
  if (input.itemsPerHour === 0) return { status: 'WARNING', reason: 'output_zero' };
  return { status: 'HEALTHY' };
}
