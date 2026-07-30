import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '../../database/client.js';
import { containerSnapshots, production } from '../../database/schema.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';

const DEFAULT_ROLLING_WINDOW_SIZE = 10;

function batchTotal(rows: readonly { totalItemCount: number }[]): number {
  return rows.reduce((sum, row) => sum + row.totalItemCount, 0);
}

function latestOccurredAt(rows: readonly { occurredAt: Date }[]): Date {
  let latest = new Date(0);
  for (const row of rows) {
    if (row.occurredAt > latest) latest = row.occurredAt;
  }
  return latest;
}

/**
 * Consumes container_snapshots history (TECHNICAL_SPEC §12), not a bot-facing Monitor — lives under
 * monitors/production per the authoritative folder layout, but has no execute(context)/supports() pair.
 */
export class ProductionService {
  private readonly eventBus: EventBus<AppEventMap>;
  private readonly db: Db;
  private readonly logger: Logger;
  private readonly rollingWindowSize: number;

  constructor(
    eventBus: EventBus<AppEventMap>,
    db: Db,
    logger: Logger,
    rollingWindowSize = DEFAULT_ROLLING_WINDOW_SIZE,
  ) {
    this.eventBus = eventBus;
    this.db = db;
    this.logger = logger.child({ module: 'monitors.production' });
    this.rollingWindowSize = rollingWindowSize;
  }

  register(): () => void {
    return this.eventBus.subscribe('StorageUpdated', (event) => {
      this.handleStorageUpdated(event.farmId, event.containerCount);
    });
  }

  private handleStorageUpdated(farmId: string, containerCount: number): void {
    const currentBatch = this.db
      .select()
      .from(containerSnapshots)
      .where(eq(containerSnapshots.farmId, farmId))
      .orderBy(desc(containerSnapshots.id))
      .limit(containerCount)
      .all();
    if (currentBatch.length === 0) return;

    const minCurrentId = Math.min(...currentBatch.map((row) => row.id));
    const previousBatch = this.db
      .select()
      .from(containerSnapshots)
      .where(and(eq(containerSnapshots.farmId, farmId), lt(containerSnapshots.id, minCurrentId)))
      .orderBy(desc(containerSnapshots.id))
      .limit(containerCount)
      .all();
    if (previousBatch.length === 0) {
      this.logger.debug({ farmId }, 'no prior snapshot batch, skipping production calculation');
      return;
    }

    const currentTotal = batchTotal(currentBatch);
    const previousTotal = batchTotal(previousBatch);
    const currentTimestamp = latestOccurredAt(currentBatch);
    const previousTimestamp = latestOccurredAt(previousBatch);
    const windowMs = currentTimestamp.getTime() - previousTimestamp.getTime();
    if (windowMs <= 0) return;

    const deltaItems = currentTotal - previousTotal;
    const itemsPerMinute = (deltaItems / windowMs) * 60_000;
    const itemsPerHour = itemsPerMinute * 60;
    const rollingAverageItemsPerHour = this.rollingAverage(farmId, itemsPerHour);

    this.db
      .insert(production)
      .values({
        farmId,
        deltaItems,
        windowMs,
        itemsPerMinute,
        itemsPerHour,
        rollingAverageItemsPerHour,
        occurredAt: currentTimestamp,
      })
      .run();

    this.eventBus.publish('ProductionUpdated', {
      occurredAt: currentTimestamp,
      farmId,
      deltaItems,
      windowMs,
      itemsPerMinute,
      itemsPerHour,
      rollingAverageItemsPerHour,
    });
    this.logger.debug({ farmId, deltaItems, itemsPerHour }, 'production updated');
  }

  private rollingAverage(farmId: string, currentItemsPerHour: number): number {
    const recent = this.db
      .select({ itemsPerHour: production.itemsPerHour })
      .from(production)
      .where(eq(production.farmId, farmId))
      .orderBy(desc(production.id))
      .limit(this.rollingWindowSize - 1)
      .all();
    const samples = [...recent.map((row) => row.itemsPerHour), currentItemsPerHour];
    return samples.reduce((sum, value) => sum + value, 0) / samples.length;
  }
}
