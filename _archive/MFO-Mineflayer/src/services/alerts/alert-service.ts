import { eq } from 'drizzle-orm';
import type { Db } from '../../database/client.js';
import { alerts } from '../../database/schema.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AlertSeverity, AppEventMap } from '../../core/event-bus/events.js';
import type { AlertsConfig } from '../../core/config/index.js';
import type { Logger } from '../../core/logger/index.js';

const SEVERITY: Record<string, AlertSeverity> = {
  storage_warning: 'warning',
  storage_full: 'critical',
  worker_missing: 'critical',
  chunk_unloaded: 'critical',
  production_stopped: 'warning',
  manager_disconnected: 'critical',
  unexpected_player: 'warning',
  unexpected_entity: 'warning',
};

/** Health reasons that map 1:1 onto an alert type this service opens/resolves. */
const HEALTH_REASON_ALERT_TYPES: Record<string, string> = {
  worker_missing: 'worker_missing',
  chunk_unloaded: 'chunk_unloaded',
  output_zero: 'production_stopped',
};
const HEALTH_TRACKED_ALERT_TYPES = ['worker_missing', 'chunk_unloaded', 'production_stopped'];

/**
 * Alert types whose dedup key is fully derivable from `(type, farmId)` alone — used to
 * rehydrate `openAlertIds` from the DB on startup. `unexpected_player`/`unexpected_entity`
 * are excluded: their key also embeds a username/entity name that isn't a separate column
 * (only baked into `message` text), so they can't be reconstructed from a row. Same as
 * before this fix, those two types never auto-resolve either way — a restart just means a
 * still-present unexpected entity/player can re-open a duplicate row instead of being
 * recognized as already open.
 */
const DETERMINISTIC_ALERT_TYPES = new Set([
  'manager_disconnected',
  'storage_warning',
  'storage_full',
  'worker_missing',
  'chunk_unloaded',
  'production_stopped',
]);

/**
 * Consumes health/metrics/events, opens and resolves alerts (TECHNICAL_SPEC §4/ARCHITECTURE
 * "Alert Engine"). Acknowledgement isn't wired here — no command source (Discord/API) exists
 * yet to trigger it; same deliberate-unwired precedent as Phase 2's ScanFarmJob.
 */
export class AlertService {
  private readonly eventBus: EventBus<AppEventMap>;
  private readonly db: Db;
  private readonly logger: Logger;
  private readonly config: AlertsConfig;
  private readonly openAlertIds = new Map<string, number>();

  constructor(eventBus: EventBus<AppEventMap>, db: Db, logger: Logger, config: AlertsConfig) {
    this.eventBus = eventBus;
    this.db = db;
    this.logger = logger.child({ module: 'services.alerts' });
    this.config = config;
    this.rehydrateOpenAlerts();
  }

  /**
   * `openAlertIds` is otherwise process-local, in-memory state — without this, an alert left
   * OPEN by a previous process (e.g. the manager was disconnected when the app last stopped)
   * can never be resolved, since `resolve()` only looks up IDs this instance itself opened.
   */
  private rehydrateOpenAlerts(): void {
    const openRows = this.db.select().from(alerts).where(eq(alerts.state, 'OPEN')).all();
    for (const row of openRows) {
      if (!DETERMINISTIC_ALERT_TYPES.has(row.type)) continue;
      const key = row.farmId === null ? `global:${row.type}` : `${row.farmId}:${row.type}`;
      this.openAlertIds.set(key, row.id);
    }
  }

  register(): () => void {
    const unsubscribers = [
      this.eventBus.subscribe('StorageUpdated', (event) => {
        this.handleStorageUpdated(event.farmId, event.averageFillPercent);
      }),
      this.eventBus.subscribe('FarmHealthChanged', (event) => {
        this.handleFarmHealthChanged(event.farmId, event.reason);
      }),
      this.eventBus.subscribe('ManagerConnected', () => {
        this.resolve('global:manager_disconnected', 'manager_disconnected', undefined);
      }),
      this.eventBus.subscribe('ManagerDisconnected', () => {
        this.open(
          'global:manager_disconnected',
          'manager_disconnected',
          undefined,
          'manager disconnected',
        );
      }),
      this.eventBus.subscribe('UnknownPlayerDetected', (event) => {
        this.open(
          `${event.farmId}:unexpected_player:${event.username}`,
          'unexpected_player',
          event.farmId,
          `unexpected player ${event.username} detected`,
        );
      }),
      this.eventBus.subscribe('EntityDetected', (event) => {
        if (event.expected || event.entityType === 'player') return;
        this.open(
          `${event.farmId}:unexpected_entity:${event.name}`,
          'unexpected_entity',
          event.farmId,
          `unexpected entity ${event.name} detected`,
        );
      }),
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }

  private handleStorageUpdated(farmId: string, averageFillPercent: number): void {
    const warningKey = `${farmId}:storage_warning`;
    if (averageFillPercent >= this.config.storageWarningPercent) {
      this.open(
        warningKey,
        'storage_warning',
        farmId,
        `storage at ${String(averageFillPercent)}% (>= ${String(this.config.storageWarningPercent)}%)`,
      );
    } else {
      this.resolve(warningKey, 'storage_warning', farmId);
    }

    const fullKey = `${farmId}:storage_full`;
    if (averageFillPercent >= this.config.storageFullPercent) {
      this.open(fullKey, 'storage_full', farmId, `storage at ${String(averageFillPercent)}%, full`);
    } else {
      this.resolve(fullKey, 'storage_full', farmId);
    }
  }

  private handleFarmHealthChanged(farmId: string, reason: string | undefined): void {
    const activeType = reason !== undefined ? HEALTH_REASON_ALERT_TYPES[reason] : undefined;
    for (const type of HEALTH_TRACKED_ALERT_TYPES) {
      const key = `${farmId}:${type}`;
      if (type === activeType) {
        this.open(key, type, farmId, `${type} (farm ${farmId})`);
      } else {
        this.resolve(key, type, farmId);
      }
    }
  }

  /** Manual acknowledgement from Discord/REST (TECHNICAL_SPEC alert lifecycle: Open -> Acknowledged). Returns false if the alert doesn't exist or isn't OPEN. */
  acknowledge(alertId: number): boolean {
    const row = this.db.select().from(alerts).where(eq(alerts.id, alertId)).get();
    if (row?.state !== 'OPEN') return false;

    this.db
      .update(alerts)
      .set({ state: 'ACKNOWLEDGED', acknowledgedAt: new Date() })
      .where(eq(alerts.id, alertId))
      .run();
    this.logger.info({ alertId }, 'alert acknowledged');
    return true;
  }

  private open(key: string, type: string, farmId: string | undefined, message: string): void {
    if (this.openAlertIds.has(key)) return;

    const occurredAt = new Date();
    const severity = SEVERITY[type] ?? 'warning';
    const inserted = this.db
      .insert(alerts)
      .values({
        farmId: farmId ?? null,
        type,
        severity,
        state: 'OPEN',
        message,
        openedAt: occurredAt,
      })
      .returning({ id: alerts.id })
      .get();

    this.openAlertIds.set(key, inserted.id);
    this.eventBus.publish('AlertOpened', {
      occurredAt,
      alertId: inserted.id,
      ...(farmId !== undefined ? { farmId } : {}),
      type,
      severity,
      message,
    });
    this.logger.warn({ farmId, type, alertId: inserted.id }, 'alert opened');
  }

  private resolve(key: string, type: string, farmId: string | undefined): void {
    const alertId = this.openAlertIds.get(key);
    if (alertId === undefined) return;

    const occurredAt = new Date();
    this.db
      .update(alerts)
      .set({ state: 'RESOLVED', resolvedAt: occurredAt })
      .where(eq(alerts.id, alertId))
      .run();

    this.openAlertIds.delete(key);
    this.eventBus.publish('AlertResolved', {
      occurredAt,
      alertId,
      ...(farmId !== undefined ? { farmId } : {}),
      type,
    });
    this.logger.info({ farmId, type, alertId }, 'alert resolved');
  }
}
