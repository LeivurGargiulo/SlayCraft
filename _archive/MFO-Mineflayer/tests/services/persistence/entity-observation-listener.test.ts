import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/database/client.js';
import { entityObservations } from '../../../src/database/schema.js';
import { registerEntityObservationPersistence } from '../../../src/services/persistence/entity-observation-listener.js';
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

describe('registerEntityObservationPersistence', () => {
  it('inserts a row on EntityDetected', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    registerEntityObservationPersistence(eventBus, db, createSilentLogger());

    eventBus.publish('EntityDetected', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      farmId: 'guardian',
      entityType: 'hostile',
      name: 'zombie',
      position: { x: 1, y: 64, z: 1 },
      expected: false,
    });

    const [row] = db.select().from(entityObservations).all();
    expect(row).toMatchObject({
      farmId: 'guardian',
      entityType: 'hostile',
      name: 'zombie',
      customName: null,
      expected: false,
    });
  });

  it('stops inserting after unsubscribing', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    const unsubscribe = registerEntityObservationPersistence(eventBus, db, createSilentLogger());

    unsubscribe();
    eventBus.publish('EntityDetected', {
      occurredAt: new Date(),
      farmId: 'guardian',
      entityType: 'hostile',
      name: 'zombie',
      position: { x: 1, y: 64, z: 1 },
      expected: false,
    });

    expect(db.select().from(entityObservations).all()).toHaveLength(0);
  });
});
