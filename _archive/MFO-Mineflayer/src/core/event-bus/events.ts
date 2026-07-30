import type { Vector3 } from '../../shared/types/vector3.js';
import type { FarmHealthStatus } from '../../shared/types/farm-health.js';
import type { ContainerType } from '../config/index.js';

export interface ManagerConnectedEvent {
  readonly occurredAt: Date;
  readonly host: string;
  readonly port: number;
  readonly username: string;
}

export interface ManagerDisconnectedEvent {
  readonly occurredAt: Date;
  readonly reason: string;
}

export interface ScannedItem {
  readonly itemId: string;
  readonly count: number;
}

export interface ContainerScannedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly containerType: ContainerType;
  readonly position: Vector3;
  readonly capacity: number;
  readonly occupiedSlots: number;
  readonly fillPercent: number;
  readonly items: readonly ScannedItem[];
}

export interface StorageUpdatedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly averageFillPercent: number;
  readonly containerCount: number;
}

export interface EntityDetectedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly entityType: string;
  readonly name: string;
  readonly customName?: string;
  readonly position: Vector3;
  readonly expected: boolean;
}

export interface UnknownPlayerDetectedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly username: string;
  readonly position: Vector3;
}

export interface WorkerVerifiedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly username: string;
  readonly position: Vector3;
  readonly atExpectedPosition: boolean;
  readonly alive: boolean;
}

export interface WorkerMissingEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly username: string;
}

export interface ChunkLoadedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
}

export interface ChunkUnloadedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly unloadedPositions: readonly Vector3[];
}

export interface ProductionUpdatedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly deltaItems: number;
  readonly windowMs: number;
  readonly itemsPerMinute: number;
  readonly itemsPerHour: number;
  readonly rollingAverageItemsPerHour: number;
}

export interface FarmHealthChangedEvent {
  readonly occurredAt: Date;
  readonly farmId: string;
  readonly status: FarmHealthStatus;
  readonly reason?: string;
}

export type AlertSeverity = 'warning' | 'critical';

export interface AlertOpenedEvent {
  readonly occurredAt: Date;
  readonly alertId: number;
  /** Absent for manager-level alerts (e.g. manager_disconnected) not scoped to one farm. */
  readonly farmId?: string;
  readonly type: string;
  readonly severity: AlertSeverity;
  readonly message: string;
}

export interface AlertResolvedEvent {
  readonly occurredAt: Date;
  readonly alertId: number;
  readonly farmId?: string;
  readonly type: string;
}

export interface ManagerMovedEvent {
  readonly occurredAt: Date;
  readonly position: Vector3;
  readonly dimension: string;
  /** Absent for teleports TeleportService itself has no farm context for (currently none in practice — every caller knows its farm). */
  readonly farmId?: string;
}

export interface AppEventMap {
  ManagerConnected: ManagerConnectedEvent;
  ManagerDisconnected: ManagerDisconnectedEvent;
  ManagerMoved: ManagerMovedEvent;
  ContainerScanned: ContainerScannedEvent;
  StorageUpdated: StorageUpdatedEvent;
  EntityDetected: EntityDetectedEvent;
  UnknownPlayerDetected: UnknownPlayerDetectedEvent;
  WorkerVerified: WorkerVerifiedEvent;
  WorkerMissing: WorkerMissingEvent;
  ChunkLoaded: ChunkLoadedEvent;
  ChunkUnloaded: ChunkUnloadedEvent;
  ProductionUpdated: ProductionUpdatedEvent;
  FarmHealthChanged: FarmHealthChangedEvent;
  AlertOpened: AlertOpenedEvent;
  AlertResolved: AlertResolvedEvent;
}
