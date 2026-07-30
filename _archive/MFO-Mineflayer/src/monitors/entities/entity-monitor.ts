import { Vec3 } from 'vec3';
import type { Entity } from 'prismarine-entity';
import type { FarmDefinition } from '../../core/registry/farm-definition.js';
import type { Vector3 } from '../../shared/types/vector3.js';
import type { Monitor, MonitorContext, MonitorEvent, MonitorResult } from '../monitor.js';

function isExpected(entity: Entity, farm: FarmDefinition): boolean {
  if (entity.type === 'player') return entity.username === farm.carpetWorker;
  return entity.name !== undefined && farm.entityScan.allow.includes(entity.name);
}

function toVector3(position: Vec3): Vector3 {
  return { x: position.x, y: position.y, z: position.z };
}

/** Scans a radius around the farm's teleport point for mobs, players, and other entities. */
export class EntityMonitor implements Monitor {
  readonly id = 'entities';

  supports(): boolean {
    return true;
  }

  execute(context: MonitorContext): Promise<MonitorResult> {
    const { bot, farm } = context;
    const center = new Vec3(farm.teleport.x, farm.teleport.y, farm.teleport.z);
    const events: MonitorEvent[] = [];

    for (const entity of Object.values(bot.entities)) {
      if (entity === bot.entity) continue;
      if (center.distanceTo(entity.position) > farm.entityScan.radius) continue;

      const expected = isExpected(entity, farm);
      const customName = entity.getCustomName()?.toString();
      const name = entity.username ?? entity.name ?? 'unknown';

      events.push({
        type: 'EntityDetected',
        payload: {
          occurredAt: new Date(),
          farmId: farm.id,
          entityType: entity.type,
          name,
          ...(customName !== undefined ? { customName } : {}),
          position: toVector3(entity.position),
          expected,
        },
      });

      if (entity.type === 'player' && !expected) {
        events.push({
          type: 'UnknownPlayerDetected',
          payload: {
            occurredAt: new Date(),
            farmId: farm.id,
            username: name,
            position: toVector3(entity.position),
          },
        });
      }
    }

    return Promise.resolve({ events });
  }
}
