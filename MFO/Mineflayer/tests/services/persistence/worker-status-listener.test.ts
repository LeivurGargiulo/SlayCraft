import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/database/client.js';
import { workers } from '../../../src/database/schema.js';
import { registerWorkerStatusPersistence } from '../../../src/services/persistence/worker-status-listener.js';
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

describe('registerWorkerStatusPersistence', () => {
  it('inserts a present row on WorkerVerified', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    registerWorkerStatusPersistence(eventBus, db, createSilentLogger());

    eventBus.publish('WorkerVerified', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      farmId: 'iron',
      username: 'worker_iron',
      position: { x: 120, y: 80, z: -500 },
      atExpectedPosition: true,
      alive: true,
    });

    const [row] = db.select().from(workers).all();
    expect(row).toMatchObject({
      farmId: 'iron',
      present: true,
      atExpectedPosition: true,
      alive: true,
    });
  });

  it('updates the same row to missing on WorkerMissing', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    registerWorkerStatusPersistence(eventBus, db, createSilentLogger());

    eventBus.publish('WorkerVerified', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      farmId: 'iron',
      username: 'worker_iron',
      position: { x: 120, y: 80, z: -500 },
      atExpectedPosition: true,
      alive: true,
    });
    eventBus.publish('WorkerMissing', {
      occurredAt: new Date('2026-01-01T00:05:00.000Z'),
      farmId: 'iron',
      username: 'worker_iron',
    });

    const rows = db.select().from(workers).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ present: false, atExpectedPosition: null, alive: null });
  });

  it('stops updating after unsubscribing', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    const unsubscribe = registerWorkerStatusPersistence(eventBus, db, createSilentLogger());

    unsubscribe();
    eventBus.publish('WorkerVerified', {
      occurredAt: new Date(),
      farmId: 'iron',
      username: 'worker_iron',
      position: { x: 120, y: 80, z: -500 },
      atExpectedPosition: true,
      alive: true,
    });

    expect(db.select().from(workers).all()).toHaveLength(0);
  });
});
