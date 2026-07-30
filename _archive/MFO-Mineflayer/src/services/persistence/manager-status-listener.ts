import { eq } from 'drizzle-orm';
import type { Db } from '../../database/client.js';
import { managerStatus } from '../../database/schema.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';

const MANAGER_STATUS_ID = 1;

export function registerManagerStatusPersistence(
  eventBus: EventBus<AppEventMap>,
  db: Db,
  logger: Logger,
): () => void {
  const log = logger.child({ module: 'services.persistence.manager-status' });

  const unsubscribeConnected = eventBus.subscribe('ManagerConnected', (event) => {
    const values = {
      id: MANAGER_STATUS_ID,
      connected: true,
      host: event.host,
      port: event.port,
      username: event.username,
      lastConnectedAt: event.occurredAt,
      updatedAt: event.occurredAt,
    };
    db.insert(managerStatus)
      .values(values)
      .onConflictDoUpdate({ target: managerStatus.id, set: values })
      .run();
    log.debug({ host: event.host, port: event.port }, 'recorded manager connected status');
  });

  const unsubscribeDisconnected = eventBus.subscribe('ManagerDisconnected', (event) => {
    db.update(managerStatus)
      .set({
        connected: false,
        lastDisconnectedAt: event.occurredAt,
        lastDisconnectReason: event.reason,
        updatedAt: event.occurredAt,
      })
      .where(eq(managerStatus.id, MANAGER_STATUS_ID))
      .run();
    log.debug({ reason: event.reason }, 'recorded manager disconnected status');
  });

  return () => {
    unsubscribeConnected();
    unsubscribeDisconnected();
  };
}
