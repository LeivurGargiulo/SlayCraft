import { Vec3 } from 'vec3';
import type { Vector3 } from '../../shared/types/vector3.js';
import type { Monitor, MonitorContext, MonitorResult } from '../monitor.js';

function toVector3(position: Vec3): Vector3 {
  return { x: position.x, y: position.y, z: position.z };
}

/** Checks the farm's Carpet worker is present, near its expected position, and alive (TECHNICAL_SPEC "Worker Monitor"). */
export class WorkerMonitor implements Monitor {
  readonly id = 'workers';

  supports(): boolean {
    return true;
  }

  execute(context: MonitorContext): Promise<MonitorResult> {
    const { bot, farm } = context;
    const occurredAt = new Date();

    const worker = Object.values(bot.entities).find(
      (entity) => entity.type === 'player' && entity.username === farm.carpetWorker,
    );

    if (!worker) {
      return Promise.resolve({
        events: [
          {
            type: 'WorkerMissing',
            payload: { occurredAt, farmId: farm.id, username: farm.carpetWorker },
          },
        ],
      });
    }

    const expected = new Vec3(
      farm.workerExpectation.position.x,
      farm.workerExpectation.position.y,
      farm.workerExpectation.position.z,
    );
    const atExpectedPosition =
      expected.distanceTo(worker.position) <= farm.workerExpectation.toleranceBlocks;
    const alive = worker.health === undefined || worker.health > 0;

    return Promise.resolve({
      events: [
        {
          type: 'WorkerVerified',
          payload: {
            occurredAt,
            farmId: farm.id,
            username: farm.carpetWorker,
            position: toVector3(worker.position),
            atExpectedPosition,
            alive,
          },
        },
      ],
    });
  }
}
