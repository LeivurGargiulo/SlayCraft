export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type FarmHealthStatus = 'UNKNOWN' | 'OFFLINE' | 'CRITICAL' | 'WARNING' | 'HEALTHY';

export interface HealthRow {
  readonly id: number;
  readonly farmId: string;
  readonly status: FarmHealthStatus;
  readonly reason: string | null;
  readonly occurredAt: string;
}

export interface WorkerRow {
  readonly farmId: string;
  readonly present: boolean;
  readonly atExpectedPosition: boolean | null;
  readonly alive: boolean | null;
  readonly lastSeenAt: string | null;
  readonly updatedAt: string;
}

export interface FarmSummary {
  readonly id: string;
  readonly dimension: string;
  readonly teleport: Vector3;
  readonly carpetWorker: string;
  readonly containerCount: number;
}

export interface FarmDetail extends Omit<FarmSummary, 'containerCount'> {
  readonly containerCount: number;
  readonly health: HealthRow | null;
  readonly worker: WorkerRow | null;
}

export interface ContainerSnapshotRow {
  readonly id: number;
  readonly farmId: string;
  readonly containerType: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly capacity: number;
  readonly occupiedSlots: number;
  readonly fillPercent: number;
  readonly totalItemCount: number;
  readonly itemsJson: string;
  readonly occurredAt: string;
}

export interface ProductionRow {
  readonly id: number;
  readonly farmId: string;
  readonly deltaItems: number;
  readonly windowMs: number;
  readonly itemsPerMinute: number;
  readonly itemsPerHour: number;
  readonly rollingAverageItemsPerHour: number;
  readonly occurredAt: string;
}

export interface FarmMetrics {
  readonly farmId: string;
  readonly health: FarmHealthStatus;
  readonly storageFillPercent: number | null;
  readonly production: ProductionRow | null;
  readonly worker: WorkerRow | null;
}

export type AlertState = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface AlertRow {
  readonly id: number;
  readonly farmId: string | null;
  readonly type: string;
  readonly severity: 'warning' | 'critical';
  readonly state: AlertState;
  readonly message: string;
  readonly openedAt: string;
  readonly acknowledgedAt: string | null;
  readonly resolvedAt: string | null;
}

export interface ManagerStatus {
  readonly connected: boolean;
  readonly host?: string;
  readonly port?: number;
  readonly username?: string;
  readonly lastConnectedAt?: string | null;
  readonly lastDisconnectedAt?: string | null;
  readonly lastDisconnectReason?: string | null;
  readonly updatedAt?: string;
}
