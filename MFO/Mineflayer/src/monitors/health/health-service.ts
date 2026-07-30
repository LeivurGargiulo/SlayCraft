import type { Db } from '../../database/client.js';
import { health } from '../../database/schema.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';
import { computeFarmHealth, type FarmHealthInput, type FarmHealthResult } from './farm-health.js';

/**
 * Aggregates Worker/Chunk/Storage/Production/Manager state per farm and recomputes
 * FarmHealth (TECHNICAL_SPEC §13) on every relevant event. Persists and publishes only on an
 * actual status/reason change, not on every recomputation.
 */
export class HealthService {
  private readonly eventBus: EventBus<AppEventMap>;
  private readonly db: Db;
  private readonly logger: Logger;
  private readonly farmIds: readonly string[];
  private readonly inputs = new Map<string, FarmHealthInput>();
  private readonly lastResult = new Map<string, FarmHealthResult>();

  constructor(eventBus: EventBus<AppEventMap>, db: Db, logger: Logger, farmIds: readonly string[]) {
    this.eventBus = eventBus;
    this.db = db;
    this.logger = logger.child({ module: 'monitors.health' });
    this.farmIds = farmIds;
  }

  register(): () => void {
    const unsubscribers = [
      this.eventBus.subscribe('ManagerConnected', () => {
        this.setManagerConnected(true);
      }),
      this.eventBus.subscribe('ManagerDisconnected', () => {
        this.setManagerConnected(false);
      }),
      this.eventBus.subscribe('WorkerVerified', (event) => {
        this.update(event.farmId, { workerPresent: true });
      }),
      this.eventBus.subscribe('WorkerMissing', (event) => {
        this.update(event.farmId, { workerPresent: false });
      }),
      this.eventBus.subscribe('ChunkLoaded', (event) => {
        this.update(event.farmId, { chunksLoaded: true });
      }),
      this.eventBus.subscribe('ChunkUnloaded', (event) => {
        this.update(event.farmId, { chunksLoaded: false });
      }),
      this.eventBus.subscribe('StorageUpdated', (event) => {
        this.update(event.farmId, { storageFillPercent: event.averageFillPercent });
      }),
      this.eventBus.subscribe('ProductionUpdated', (event) => {
        this.update(event.farmId, { itemsPerHour: event.itemsPerHour });
      }),
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }

  private setManagerConnected(connected: boolean): void {
    for (const farmId of this.farmIds) {
      this.update(farmId, { managerConnected: connected });
    }
  }

  private update(farmId: string, patch: Partial<FarmHealthInput>): void {
    const current = this.inputs.get(farmId) ?? { managerConnected: false };
    const next: FarmHealthInput = { ...current, ...patch };
    this.inputs.set(farmId, next);
    this.recompute(farmId, next);
  }

  private recompute(farmId: string, input: FarmHealthInput): void {
    const result = computeFarmHealth(input);
    const previous = this.lastResult.get(farmId);
    if (previous?.status === result.status && previous.reason === result.reason) return;
    this.lastResult.set(farmId, result);

    const occurredAt = new Date();
    this.db
      .insert(health)
      .values({ farmId, status: result.status, reason: result.reason ?? null, occurredAt })
      .run();
    this.eventBus.publish('FarmHealthChanged', {
      occurredAt,
      farmId,
      status: result.status,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
    });
    this.logger.info(
      { farmId, status: result.status, reason: result.reason },
      'farm health changed',
    );
  }
}
