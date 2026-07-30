import type { Db } from '../../database/client.js';
import { entityObservations } from '../../database/schema.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';

export function registerEntityObservationPersistence(
  eventBus: EventBus<AppEventMap>,
  db: Db,
  logger: Logger,
): () => void {
  const log = logger.child({ module: 'services.persistence.entity-observation' });

  return eventBus.subscribe('EntityDetected', (event) => {
    db.insert(entityObservations)
      .values({
        farmId: event.farmId,
        entityType: event.entityType,
        name: event.name,
        customName: event.customName ?? null,
        x: event.position.x,
        y: event.position.y,
        z: event.position.z,
        expected: event.expected,
        occurredAt: event.occurredAt,
      })
      .run();
    log.debug({ farmId: event.farmId, name: event.name }, 'recorded entity observation');
  });
}
