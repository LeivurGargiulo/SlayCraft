import type { Db } from '../../database/client.js';
import { workers } from '../../database/schema.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';

/** One row per farm, upserted on every WorkerVerified/WorkerMissing — mirrors manager-status-listener.ts. */
export function registerWorkerStatusPersistence(
  eventBus: EventBus<AppEventMap>,
  db: Db,
  logger: Logger,
): () => void {
  const log = logger.child({ module: 'services.persistence.worker-status' });

  const unsubscribeVerified = eventBus.subscribe('WorkerVerified', (event) => {
    const values = {
      farmId: event.farmId,
      present: true,
      atExpectedPosition: event.atExpectedPosition,
      alive: event.alive,
      lastSeenAt: event.occurredAt,
      updatedAt: event.occurredAt,
    };
    db.insert(workers)
      .values(values)
      .onConflictDoUpdate({ target: workers.farmId, set: values })
      .run();
    log.debug({ farmId: event.farmId }, 'recorded worker verified status');
  });

  const unsubscribeMissing = eventBus.subscribe('WorkerMissing', (event) => {
    const values = {
      farmId: event.farmId,
      present: false,
      atExpectedPosition: null,
      alive: null,
      updatedAt: event.occurredAt,
    };
    db.insert(workers)
      .values(values)
      .onConflictDoUpdate({
        target: workers.farmId,
        set: { present: false, atExpectedPosition: null, alive: null, updatedAt: event.occurredAt },
      })
      .run();
    log.debug({ farmId: event.farmId }, 'recorded worker missing status');
  });

  return () => {
    unsubscribeVerified();
    unsubscribeMissing();
  };
}
