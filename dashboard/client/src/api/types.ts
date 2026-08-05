export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'med' | 'high';

export type Actividad = 'activo' | 'ocasional' | 'inactivo';

export interface Player {
  id: number;
  minecraft_name: string;
  note: string | null;
  actividad: Actividad;
  created_at: string;
}

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  done: 0 | 1;
  sort_order: number;
  assignees: Player[];
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  farm_id: string | null;
  project_id: number | null;
  completed_at: string | null;
  archived: 0 | 1;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
  assignees: Player[];
}

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  farm_id?: string | null;
  project_id?: number | null;
  assignee_ids?: number[];
}

export interface FarmSummary {
  id: string;
  name: string;
  dimension: string;
  entityCount: number;
  storageItemCount: number;
  storageCapacity: number;
  chunkLoaded: boolean;
  occupantCount: number;
  online: boolean;
  metadata: { notes: string | null; tags: string[]; coordinates: string | null; expected_rates: Record<string, number>; manual: boolean; hidden: boolean; off: boolean };
  images: FarmImage[];
}

export interface FarmImage {
  id: number;
  farm_id: string;
  path: string;
  caption: string | null;
  sort_order: number;
}

export interface StorageItem {
  itemId: string;
  count: number;
  shulkerContents: StorageItem[] | null;
}

export interface FarmDetail extends FarmSummary {
  anchor: { x: number; y: number; z: number };
  entityScanRadius: number;
  fakePlayerName: string | null;
  afkSpot: { position: { x: number; y: number; z: number }; radius: number } | null;
  occupants: Array<{ name: string; isFakePlayer: boolean; position: { x: number; y: number; z: number } }>;
  entities: Array<{ id: string; type: string; customName: string | null; position: { x: number; y: number; z: number }; health: number }>;
  storage: Array<{ id: string; label: string; position: { x: number; y: number; z: number }; capacity: number; items: StorageItem[] }>;
}

export interface FarmConfig {
  id: string;
  name: string;
  dimension: string;
  anchor: { x: number; y: number; z: number };
  entityScanRadius: number;
  fakePlayerName: string | null;
  storage: Array<{ id: string; label: string; position: { x: number; y: number; z: number } }>;
  afkSpot: { position: { x: number; y: number; z: number }; radius: number } | null;
}

export interface FarmHistorySample {
  sampledAt: string;
  entityCounts: Record<string, number>;
  storageCounts: Record<string, number>;
}

export interface LivePlayer {
  name: string;
  dimension: string;
  position: { x: number; y: number; z: number };
  gamemode: string;
}

export interface Performance {
  tps: number;
  meanTickTimeMs: number;
  sampledOverTicks: number;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  coordinates: string | null;
  created_at: string;
  images: ProjectImage[];
}

export interface ProjectImage {
  id: number;
  project_id: number;
  path: string;
  caption: string | null;
  sort_order: number;
}

export interface GalleryImage {
  id: number;
  path: string;
  caption: string | null;
  created_at: string;
}

export interface Alert {
  id: number;
  farmId: string;
  type: string;
  message: string;
  createdAt: string;
}

export interface PlayerSession {
  joinedAt: string;
  leftAt: string | null;
}

export interface PerformanceHistorySample {
  sampledAt: string;
  tps: number;
  meanTickTimeMs: number;
}

export interface SearchResult {
  farmId: string;
  farmName: string;
  storageId: string;
  storageLabel: string;
  itemId: string;
  count: number;
}
