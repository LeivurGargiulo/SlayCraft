import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/database/client.js';
import { managerStatus } from '../../../src/database/schema.js';
import { registerManagerStatusPersistence } from '../../../src/services/persistence/manager-status-listener.js';
import { EventBus } from '../../../src/core/event-bus/event-bus.js';
import type { AppEventMap } from '../../../src/core/event-bus/events.js';
import { createLogger } from '../../../src/core/logger/logger.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

describe('registerManagerStatusPersistence', () => {
  it('inserts a manager_status row when ManagerConnected is published', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    registerManagerStatusPersistence(eventBus, db, createSilentLogger());

    const occurredAt = new Date('2026-01-01T00:00:00.000Z');
    eventBus.publish('ManagerConnected', {
      occurredAt,
      host: 'localhost',
      port: 25565,
      username: 'MFO-Manager',
    });

    const [row] = db.select().from(managerStatus).all();
    expect(row).toMatchObject({
      connected: true,
      host: 'localhost',
      port: 25565,
      username: 'MFO-Manager',
    });
    expect(row?.lastConnectedAt).toEqual(occurredAt);
  });

  it('updates the same row to disconnected when ManagerDisconnected is published', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    registerManagerStatusPersistence(eventBus, db, createSilentLogger());

    eventBus.publish('ManagerConnected', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      host: 'localhost',
      port: 25565,
      username: 'MFO-Manager',
    });
    eventBus.publish('ManagerDisconnected', {
      occurredAt: new Date('2026-01-01T00:05:00.000Z'),
      reason: 'socketClosed',
    });

    const rows = db.select().from(managerStatus).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ connected: false, lastDisconnectReason: 'socketClosed' });
  });

  it('stops updating the database after unsubscribing', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    const unsubscribe = registerManagerStatusPersistence(eventBus, db, createSilentLogger());

    unsubscribe();
    eventBus.publish('ManagerConnected', {
      occurredAt: new Date(),
      host: 'localhost',
      port: 25565,
      username: 'MFO-Manager',
    });

    expect(db.select().from(managerStatus).all()).toHaveLength(0);
  });
});
