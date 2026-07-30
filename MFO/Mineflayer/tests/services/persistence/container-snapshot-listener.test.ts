import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/database/client.js';
import { containerSnapshots } from '../../../src/database/schema.js';
import { registerContainerSnapshotPersistence } from '../../../src/services/persistence/container-snapshot-listener.js';
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

describe('registerContainerSnapshotPersistence', () => {
  it('inserts a row with the summed item count and serialized items on ContainerScanned', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    registerContainerSnapshotPersistence(eventBus, db, createSilentLogger());

    eventBus.publish('ContainerScanned', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      farmId: 'iron',
      containerType: 'chest',
      position: { x: 123, y: 79, z: -501 },
      capacity: 27,
      occupiedSlots: 2,
      fillPercent: 7.4,
      items: [
        { itemId: 'iron_ingot', count: 640 },
        { itemId: 'iron_nugget', count: 12 },
      ],
    });

    const [row] = db.select().from(containerSnapshots).all();
    expect(row).toMatchObject({
      farmId: 'iron',
      containerType: 'chest',
      x: 123,
      y: 79,
      z: -501,
      totalItemCount: 652,
    });
    expect(JSON.parse(row?.itemsJson ?? '[]')).toEqual([
      { itemId: 'iron_ingot', count: 640 },
      { itemId: 'iron_nugget', count: 12 },
    ]);
  });

  it('stops inserting after unsubscribing', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    const unsubscribe = registerContainerSnapshotPersistence(eventBus, db, createSilentLogger());

    unsubscribe();
    eventBus.publish('ContainerScanned', {
      occurredAt: new Date(),
      farmId: 'iron',
      containerType: 'chest',
      position: { x: 0, y: 0, z: 0 },
      capacity: 27,
      occupiedSlots: 0,
      fillPercent: 0,
      items: [],
    });

    expect(db.select().from(containerSnapshots).all()).toHaveLength(0);
  });
});
