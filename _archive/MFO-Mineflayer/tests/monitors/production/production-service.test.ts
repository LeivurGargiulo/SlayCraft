import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/database/client.js';
import { containerSnapshots, production } from '../../../src/database/schema.js';
import { ProductionService } from '../../../src/monitors/production/production-service.js';
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

function insertSnapshot(
  db: ReturnType<typeof createDatabase>['db'],
  farmId: string,
  totalItemCount: number,
  occurredAt: Date,
): void {
  db.insert(containerSnapshots)
    .values({
      farmId,
      containerType: 'chest',
      x: 0,
      y: 0,
      z: 0,
      capacity: 27,
      occupiedSlots: 1,
      fillPercent: 10,
      totalItemCount,
      itemsJson: '[]',
      occurredAt,
    })
    .run();
}

describe('ProductionService', () => {
  it('does nothing on the first-ever scan (no prior batch to diff against)', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new ProductionService(eventBus, db, createSilentLogger()).register();

    insertSnapshot(db, 'iron', 1000, new Date('2026-01-01T00:00:00.000Z'));
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      farmId: 'iron',
      averageFillPercent: 10,
      containerCount: 1,
    });

    expect(db.select().from(production).all()).toHaveLength(0);
  });

  it('computes a positive delta and rate between two scans, and publishes ProductionUpdated', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new ProductionService(eventBus, db, createSilentLogger()).register();
    const received: AppEventMap['ProductionUpdated'][] = [];
    eventBus.subscribe('ProductionUpdated', (event) => {
      received.push(event);
    });

    insertSnapshot(db, 'iron', 1000, new Date('2026-01-01T00:00:00.000Z'));
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      farmId: 'iron',
      averageFillPercent: 10,
      containerCount: 1,
    });

    insertSnapshot(db, 'iron', 1240, new Date('2026-01-01T00:01:00.000Z'));
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date('2026-01-01T00:01:00.000Z'),
      farmId: 'iron',
      averageFillPercent: 12,
      containerCount: 1,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      farmId: 'iron',
      deltaItems: 240,
      windowMs: 60_000,
      itemsPerMinute: 240,
      itemsPerHour: 14_400,
      rollingAverageItemsPerHour: 14_400,
    });

    const rows = db.select().from(production).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ farmId: 'iron', deltaItems: 240 });
  });

  it('keeps separate history per farm', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new ProductionService(eventBus, db, createSilentLogger()).register();

    insertSnapshot(db, 'iron', 1000, new Date('2026-01-01T00:00:00.000Z'));
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      farmId: 'iron',
      averageFillPercent: 10,
      containerCount: 1,
    });
    insertSnapshot(db, 'gold', 500, new Date('2026-01-01T00:00:00.000Z'));
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      farmId: 'gold',
      averageFillPercent: 5,
      containerCount: 1,
    });
    insertSnapshot(db, 'iron', 1100, new Date('2026-01-01T00:01:00.000Z'));
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date('2026-01-01T00:01:00.000Z'),
      farmId: 'iron',
      averageFillPercent: 11,
      containerCount: 1,
    });

    const rows = db.select().from(production).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.farmId).toBe('iron');
  });
});
