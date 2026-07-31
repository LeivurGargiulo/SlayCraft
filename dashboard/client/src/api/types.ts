export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'med' | 'high';

export interface Player {
  id: number;
  minecraft_name: string;
  note: string | null;
  created_at: string;
}

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  done: 0 | 1;
  sort_order: number;
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
  chunkLoaded: boolean;
  fakePlayerOnline: boolean;
  metadata: { notes: string | null; tags: string[]; coordinates: string | null; expected_rates: Record<string, number> };
  images: FarmImage[];
}

export interface FarmImage {
  id: number;
  farm_id: string;
  path: string;
  caption: string | null;
  sort_order: number;
}

export interface FarmDetail extends FarmSummary {
  anchor: { x: number; y: number; z: number };
  fakePlayer: { name: string; online: boolean; position: { x: number; y: number; z: number } } | null;
  entities: Array<{ id: string; type: string; customName: string | null; position: { x: number; y: number; z: number }; health: number }>;
  storage: Array<{ id: string; label: string; position: { x: number; y: number; z: number }; capacity: number; items: Array<{ itemId: string; count: number }> }>;
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
