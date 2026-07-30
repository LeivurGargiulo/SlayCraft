import { desc, eq } from 'drizzle-orm';
import type { Db } from './client.js';
import { alerts, containerSnapshots, health, managerStatus, production, workers } from './schema.js';

const MANAGER_STATUS_ID = 1;

type HealthRow = typeof health.$inferSelect;
type ContainerSnapshotRow = typeof containerSnapshots.$inferSelect;
type ProductionRow = typeof production.$inferSelect;
type WorkerRow = typeof workers.$inferSelect;
type AlertRow = typeof alerts.$inferSelect;
type ManagerStatusRow = typeof managerStatus.$inferSelect;

/** Shared read helpers behind the REST API and Discord adapter (TECHNICAL_SPEC §16/§17 both read the same tables). */

export function getLatestHealth(db: Db, farmId: string): HealthRow | undefined {
  return db
    .select()
    .from(health)
    .where(eq(health.farmId, farmId))
    .orderBy(desc(health.id))
    .limit(1)
    .get();
}

export function getHealthHistory(db: Db, farmId: string, limit: number): HealthRow[] {
  return db
    .select()
    .from(health)
    .where(eq(health.farmId, farmId))
    .orderBy(desc(health.id))
    .limit(limit)
    .all();
}

export function getLatestStorageBatch(
  db: Db,
  farmId: string,
  containerCount: number,
): ContainerSnapshotRow[] {
  if (containerCount === 0) return [];
  return db
    .select()
    .from(containerSnapshots)
    .where(eq(containerSnapshots.farmId, farmId))
    .orderBy(desc(containerSnapshots.id))
    .limit(containerCount)
    .all();
}

export function averageFillPercent(batch: readonly { fillPercent: number }[]): number | null {
  if (batch.length === 0) return null;
  return (
    Math.round((batch.reduce((sum, row) => sum + row.fillPercent, 0) / batch.length) * 10) / 10
  );
}

export function getProductionHistory(db: Db, farmId: string, limit: number): ProductionRow[] {
  return db
    .select()
    .from(production)
    .where(eq(production.farmId, farmId))
    .orderBy(desc(production.id))
    .limit(limit)
    .all();
}

export function getLatestProduction(db: Db, farmId: string): ProductionRow | undefined {
  return db
    .select()
    .from(production)
    .where(eq(production.farmId, farmId))
    .orderBy(desc(production.id))
    .limit(1)
    .get();
}

export function getWorkerStatus(db: Db, farmId: string): WorkerRow | undefined {
  return db.select().from(workers).where(eq(workers.farmId, farmId)).get();
}

export function getAlerts(db: Db, farmId: string | undefined, limit: number): AlertRow[] {
  if (farmId === undefined) {
    return db.select().from(alerts).orderBy(desc(alerts.id)).limit(limit).all();
  }
  return db
    .select()
    .from(alerts)
    .where(eq(alerts.farmId, farmId))
    .orderBy(desc(alerts.id))
    .limit(limit)
    .all();
}

export function getManagerStatus(db: Db): ManagerStatusRow | undefined {
  return db.select().from(managerStatus).where(eq(managerStatus.id, MANAGER_STATUS_ID)).get();
}
