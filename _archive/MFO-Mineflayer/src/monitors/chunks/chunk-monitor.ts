import { Vec3 } from 'vec3';
import type { Vector3 } from '../../shared/types/vector3.js';
import type { Monitor, MonitorContext, MonitorResult } from '../monitor.js';

/** Positions whose chunk must be loaded for a farm scan to be meaningful: target, worker, storage. */
function chunkCheckPositions(context: MonitorContext): readonly Vector3[] {
  const { farm } = context;
  return [
    farm.teleport,
    farm.workerExpectation.position,
    ...farm.containers.map((c) => c.position),
  ];
}

/** Verifies target/worker/storage chunks are loaded (TECHNICAL_SPEC "Chunk Monitor"), reusing bot.blockAt's null-when-unloaded contract already established by StorageMonitor. */
export class ChunkMonitor implements Monitor {
  readonly id = 'chunks';

  supports(): boolean {
    return true;
  }

  execute(context: MonitorContext): Promise<MonitorResult> {
    const { bot, farm } = context;
    const occurredAt = new Date();

    const unloadedPositions = chunkCheckPositions(context).filter(
      (position) => !bot.blockAt(new Vec3(position.x, position.y, position.z)),
    );

    if (unloadedPositions.length > 0) {
      return Promise.resolve({
        events: [
          { type: 'ChunkUnloaded', payload: { occurredAt, farmId: farm.id, unloadedPositions } },
        ],
      });
    }

    return Promise.resolve({
      events: [{ type: 'ChunkLoaded', payload: { occurredAt, farmId: farm.id } }],
    });
  }
}
