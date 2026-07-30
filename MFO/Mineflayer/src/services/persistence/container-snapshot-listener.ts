import type { Db } from '../../database/client.js';
import { containerSnapshots } from '../../database/schema.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';

/** One row per ContainerScanned event — the history Production reads deltas from. */
export function registerContainerSnapshotPersistence(
  eventBus: EventBus<AppEventMap>,
  db: Db,
  logger: Logger,
): () => void {
  const log = logger.child({ module: 'services.persistence.container-snapshot' });

  return eventBus.subscribe('ContainerScanned', (event) => {
    const totalItemCount = event.items.reduce((sum, item) => sum + item.count, 0);
    db.insert(containerSnapshots)
      .values({
        farmId: event.farmId,
        containerType: event.containerType,
        x: event.position.x,
        y: event.position.y,
        z: event.position.z,
        capacity: event.capacity,
        occupiedSlots: event.occupiedSlots,
        fillPercent: event.fillPercent,
        totalItemCount,
        itemsJson: JSON.stringify(event.items),
        occurredAt: event.occurredAt,
      })
      .run();
    log.debug({ farmId: event.farmId, totalItemCount }, 'recorded container snapshot');
  });
}
