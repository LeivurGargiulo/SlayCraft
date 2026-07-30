import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/database/client.js';
import { health } from '../../../src/database/schema.js';
import { HealthService } from '../../../src/monitors/health/health-service.js';
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

describe('HealthService', () => {
  it('marks every known farm OFFLINE the instant the manager disconnects', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new HealthService(eventBus, db, createSilentLogger(), ['iron', 'gold']).register();

    eventBus.publish('ManagerDisconnected', { occurredAt: new Date(), reason: 'socketClosed' });

    const rows = db.select().from(health).all();
    expect(rows.map((r) => ({ farmId: r.farmId, status: r.status }))).toEqual([
      { farmId: 'iron', status: 'OFFLINE' },
      { farmId: 'gold', status: 'OFFLINE' },
    ]);
  });

  it('walks every branch of the decision tree as scan signals arrive', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new HealthService(eventBus, db, createSilentLogger(), ['iron']).register();
    const received: AppEventMap['FarmHealthChanged'][] = [];
    eventBus.subscribe('FarmHealthChanged', (event) => {
      received.push(event);
    });

    eventBus.publish('ManagerConnected', {
      occurredAt: new Date(),
      host: 'localhost',
      port: 25565,
      username: 'MFO-Manager',
    });
    eventBus.publish('WorkerMissing', {
      occurredAt: new Date(),
      farmId: 'iron',
      username: 'worker_iron',
    });
    eventBus.publish('WorkerVerified', {
      occurredAt: new Date(),
      farmId: 'iron',
      username: 'worker_iron',
      position: { x: 0, y: 0, z: 0 },
      atExpectedPosition: true,
      alive: true,
    });
    eventBus.publish('ChunkUnloaded', {
      occurredAt: new Date(),
      farmId: 'iron',
      unloadedPositions: [],
    });
    eventBus.publish('ChunkLoaded', { occurredAt: new Date(), farmId: 'iron' });
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      averageFillPercent: 100,
      containerCount: 1,
    });
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      averageFillPercent: 40,
      containerCount: 1,
    });
    eventBus.publish('ProductionUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      deltaItems: 0,
      windowMs: 60_000,
      itemsPerMinute: 0,
      itemsPerHour: 0,
      rollingAverageItemsPerHour: 0,
    });
    eventBus.publish('ProductionUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      deltaItems: 120,
      windowMs: 60_000,
      itemsPerMinute: 2,
      itemsPerHour: 120,
      rollingAverageItemsPerHour: 120,
    });

    expect(received.map((event) => [event.status, event.reason])).toEqual([
      ['UNKNOWN', undefined],
      ['CRITICAL', 'worker_missing'],
      ['HEALTHY', undefined],
      ['CRITICAL', 'chunk_unloaded'],
      ['HEALTHY', undefined],
      ['WARNING', 'storage_full'],
      ['HEALTHY', undefined],
      ['WARNING', 'output_zero'],
      ['HEALTHY', undefined],
    ]);
  });

  it('does not persist or publish again when the recomputed status is unchanged', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new HealthService(eventBus, db, createSilentLogger(), ['iron']).register();
    const received: AppEventMap['FarmHealthChanged'][] = [];
    eventBus.subscribe('FarmHealthChanged', (event) => {
      received.push(event);
    });

    eventBus.publish('ManagerConnected', {
      occurredAt: new Date(),
      host: 'localhost',
      port: 25565,
      username: 'MFO-Manager',
    });
    eventBus.publish('WorkerMissing', {
      occurredAt: new Date(),
      farmId: 'iron',
      username: 'worker_iron',
    });
    eventBus.publish('WorkerMissing', {
      occurredAt: new Date(),
      farmId: 'iron',
      username: 'worker_iron',
    });

    expect(received.map((event) => event.status)).toEqual(['UNKNOWN', 'CRITICAL']);
    expect(db.select().from(health).all()).toHaveLength(2);
  });
});
