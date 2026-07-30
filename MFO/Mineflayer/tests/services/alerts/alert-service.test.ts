import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/database/client.js';
import { alerts } from '../../../src/database/schema.js';
import { AlertService } from '../../../src/services/alerts/alert-service.js';
import { EventBus } from '../../../src/core/event-bus/event-bus.js';
import type { AppEventMap } from '../../../src/core/event-bus/events.js';
import type { AlertsConfig } from '../../../src/core/config/index.js';
import { createLogger } from '../../../src/core/logger/logger.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

function createConfig(overrides: Partial<AlertsConfig> = {}): AlertsConfig {
  return { storageWarningPercent: 90, storageFullPercent: 100, ...overrides };
}

describe('AlertService', () => {
  it('opens a storage_warning alert when the threshold is crossed and resolves it when it clears', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new AlertService(eventBus, db, createSilentLogger(), createConfig()).register();
    const opened: AppEventMap['AlertOpened'][] = [];
    const resolved: AppEventMap['AlertResolved'][] = [];
    eventBus.subscribe('AlertOpened', (e) => opened.push(e));
    eventBus.subscribe('AlertResolved', (e) => resolved.push(e));

    eventBus.publish('StorageUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      averageFillPercent: 95,
      containerCount: 1,
    });
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      farmId: 'iron',
      type: 'storage_warning',
      severity: 'warning',
    });

    eventBus.publish('StorageUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      averageFillPercent: 95,
      containerCount: 1,
    });
    expect(opened).toHaveLength(1);

    eventBus.publish('StorageUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      averageFillPercent: 50,
      containerCount: 1,
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ farmId: 'iron', type: 'storage_warning' });

    const rows = db.select().from(alerts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'storage_warning', state: 'RESOLVED' });
  });

  it('opens both storage_warning and storage_full once fill reaches the full threshold', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new AlertService(eventBus, db, createSilentLogger(), createConfig()).register();

    eventBus.publish('StorageUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      averageFillPercent: 100,
      containerCount: 1,
    });

    const rows = db.select().from(alerts).all();
    expect(rows.map((r) => r.type).sort()).toEqual(['storage_full', 'storage_warning']);
  });

  it('opens and resolves worker_missing from FarmHealthChanged reasons', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new AlertService(eventBus, db, createSilentLogger(), createConfig()).register();

    eventBus.publish('FarmHealthChanged', {
      occurredAt: new Date(),
      farmId: 'iron',
      status: 'CRITICAL',
      reason: 'worker_missing',
    });
    expect(
      db
        .select()
        .from(alerts)
        .all()
        .find((r) => r.type === 'worker_missing')?.state,
    ).toBe('OPEN');

    eventBus.publish('FarmHealthChanged', {
      occurredAt: new Date(),
      farmId: 'iron',
      status: 'HEALTHY',
    });
    expect(
      db
        .select()
        .from(alerts)
        .all()
        .find((r) => r.type === 'worker_missing')?.state,
    ).toBe('RESOLVED');
  });

  it('opens a global manager_disconnected alert with no farmId and resolves it on reconnect', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new AlertService(eventBus, db, createSilentLogger(), createConfig()).register();

    eventBus.publish('ManagerDisconnected', { occurredAt: new Date(), reason: 'socketClosed' });
    let row = db
      .select()
      .from(alerts)
      .all()
      .find((r) => r.type === 'manager_disconnected');
    expect(row).toMatchObject({ farmId: null, state: 'OPEN', severity: 'critical' });

    eventBus.publish('ManagerConnected', {
      occurredAt: new Date(),
      host: 'localhost',
      port: 25565,
      username: 'MFO-Manager',
    });
    row = db
      .select()
      .from(alerts)
      .all()
      .find((r) => r.type === 'manager_disconnected');
    expect(row?.state).toBe('RESOLVED');
  });

  it('opens unexpected_player and unexpected_entity alerts without auto-resolving them', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new AlertService(eventBus, db, createSilentLogger(), createConfig()).register();

    eventBus.publish('UnknownPlayerDetected', {
      occurredAt: new Date(),
      farmId: 'iron',
      username: 'Intruder',
      position: { x: 0, y: 0, z: 0 },
    });
    eventBus.publish('EntityDetected', {
      occurredAt: new Date(),
      farmId: 'iron',
      entityType: 'hostile',
      name: 'zombie',
      position: { x: 0, y: 0, z: 0 },
      expected: false,
    });
    eventBus.publish('EntityDetected', {
      occurredAt: new Date(),
      farmId: 'iron',
      entityType: 'hostile',
      name: 'zombie',
      position: { x: 0, y: 0, z: 0 },
      expected: false,
    });

    const rows = db.select().from(alerts).all();
    expect(rows.map((r) => r.type).sort()).toEqual(['unexpected_entity', 'unexpected_player']);
    expect(rows.every((r) => r.state === 'OPEN')).toBe(true);
  });

  it('does not open an unexpected_entity alert for expected entities or players', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    new AlertService(eventBus, db, createSilentLogger(), createConfig()).register();

    eventBus.publish('EntityDetected', {
      occurredAt: new Date(),
      farmId: 'iron',
      entityType: 'mob',
      name: 'guardian',
      position: { x: 0, y: 0, z: 0 },
      expected: true,
    });
    eventBus.publish('EntityDetected', {
      occurredAt: new Date(),
      farmId: 'iron',
      entityType: 'player',
      name: 'Intruder',
      position: { x: 0, y: 0, z: 0 },
      expected: false,
    });

    expect(db.select().from(alerts).all()).toHaveLength(0);
  });

  it('resolves an OPEN alert left behind by a previous process instance on startup', () => {
    const { db } = createDatabase(':memory:');
    db.insert(alerts)
      .values({
        farmId: null,
        type: 'manager_disconnected',
        severity: 'critical',
        state: 'OPEN',
        message: 'manager disconnected',
        openedAt: new Date(),
      })
      .run();
    db.insert(alerts)
      .values({
        farmId: 'iron',
        type: 'storage_warning',
        severity: 'warning',
        state: 'OPEN',
        message: 'storage at 95%',
        openedAt: new Date(),
      })
      .run();

    const eventBus = new EventBus<AppEventMap>();
    new AlertService(eventBus, db, createSilentLogger(), createConfig()).register();

    eventBus.publish('ManagerConnected', {
      occurredAt: new Date(),
      host: 'localhost',
      port: 25565,
      username: 'MFO-Manager',
    });
    eventBus.publish('StorageUpdated', {
      occurredAt: new Date(),
      farmId: 'iron',
      averageFillPercent: 10,
      containerCount: 1,
    });

    const rows = db.select().from(alerts).all();
    expect(rows.every((r) => r.state === 'RESOLVED')).toBe(true);
  });

  it('acknowledges an open alert and rejects acknowledging it again or a missing id', () => {
    const { db } = createDatabase(':memory:');
    const eventBus = new EventBus<AppEventMap>();
    const service = new AlertService(eventBus, db, createSilentLogger(), createConfig());
    service.register();

    eventBus.publish('UnknownPlayerDetected', {
      occurredAt: new Date(),
      farmId: 'iron',
      username: 'Intruder',
      position: { x: 0, y: 0, z: 0 },
    });
    const [row] = db.select().from(alerts).all();
    if (!row) throw new Error('expected an alert row to have been inserted');
    const alertId = row.id;

    expect(service.acknowledge(alertId)).toBe(true);
    expect(db.select().from(alerts).all()[0]).toMatchObject({ state: 'ACKNOWLEDGED' });
    expect(service.acknowledge(alertId)).toBe(false);
    expect(service.acknowledge(999)).toBe(false);
  });
});
