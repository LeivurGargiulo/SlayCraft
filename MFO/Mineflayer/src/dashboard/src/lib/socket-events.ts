import type { AlertRow, FarmHealthStatus, Vector3 } from '../api/types.js';

/** Mirrors src/api/websocket/server.ts's REPUBLISHED_EVENTS — the subset of the backend's internal event bus pushed live to clients. */
export interface ServerEvents {
  FarmHealthChanged: {
    occurredAt: string;
    farmId: string;
    status: FarmHealthStatus;
    reason?: string;
  };
  AlertOpened: {
    occurredAt: string;
    alertId: number;
    farmId?: string;
    type: string;
    severity: AlertRow['severity'];
    message: string;
  };
  AlertResolved: { occurredAt: string; alertId: number; farmId?: string; type: string };
  StorageUpdated: {
    occurredAt: string;
    farmId: string;
    averageFillPercent: number;
    containerCount: number;
  };
  ProductionUpdated: {
    occurredAt: string;
    farmId: string;
    deltaItems: number;
    windowMs: number;
    itemsPerMinute: number;
    itemsPerHour: number;
    rollingAverageItemsPerHour: number;
  };
  WorkerVerified: {
    occurredAt: string;
    farmId: string;
    username: string;
    position: Vector3;
    atExpectedPosition: boolean;
    alive: boolean;
  };
  WorkerMissing: { occurredAt: string; farmId: string; username: string };
  ManagerMoved: { occurredAt: string; position: Vector3; dimension: string; farmId?: string };
}
