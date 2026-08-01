import type Database from 'better-sqlite3';
import { mcfmFetch } from '../mcfarmmanager.js';

export interface MinecoopJugador {
  username: string;
  actividad: 'activo' | 'ocasional' | 'inactivo';
}

export interface MinecoopEntity {
  id: string;
  title: string;
  coordinates: string[];
}

export function importJugadores(db: Database.Database, jugadores: MinecoopJugador[]) {
  const insert = db.prepare(
    `INSERT INTO players (minecraft_name, actividad) VALUES (?, ?)
     ON CONFLICT(minecraft_name) DO UPDATE SET actividad = excluded.actividad`
  );
  for (const j of jugadores) insert.run(j.username, j.actividad);
}

export function importProyectos(db: Database.Database, proyectos: MinecoopEntity[]): Map<string, number> {
  const idBySlug = new Map<string, number>();
  const insert = db.prepare('INSERT INTO projects (name, status, coordinates) VALUES (?, ?, ?)');
  for (const p of proyectos) {
    const info = insert.run(p.title, 'active', p.coordinates.join('; '));
    idBySlug.set(p.id, Number(info.lastInsertRowid));
  }
  return idBySlug;
}

function dimensionFor(coordinates: string[]): string {
  const text = coordinates.join(' ');
  if (text.includes('(Nether)')) return 'minecraft:the_nether';
  if (text.includes('(End)')) return 'minecraft:the_end';
  return 'minecraft:overworld';
}

function buildFarmConfig(granja: MinecoopEntity) {
  const storage = granja.coordinates
    .filter((c) => c.startsWith('Almacen'))
    .map((_, i) => ({ id: `${granja.id}-storage-${i}`, label: 'Almacen', position: { x: 0, y: 64, z: 0 } }));
  const afkSpot = granja.coordinates.some((c) => c.startsWith('Punto AFK'))
    ? { position: { x: 0, y: 64, z: 0 }, radius: 5 }
    : null;
  return {
    id: granja.id,
    name: granja.title,
    dimension: dimensionFor(granja.coordinates),
    anchor: { x: 0, y: 64, z: 0 },
    entityScanRadius: 16,
    fakePlayerName: null,
    storage,
    afkSpot,
  };
}

export async function importGranjas(db: Database.Database, granjas: MinecoopEntity[]) {
  const upsertMetadata = db.prepare(
    `INSERT INTO farm_metadata (farm_id, notes, coordinates) VALUES (?, ?, ?)
     ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, coordinates = excluded.coordinates`
  );
  for (const granja of granjas) {
    await mcfmFetch('/farms', { method: 'POST', body: buildFarmConfig(granja) });
    const original = granja.coordinates.join('; ');
    upsertMetadata.run(granja.id, `Coordenadas originales de minecoop (placeholder, corregir en la UI): ${original}`, original);
  }
}

export interface MinecoopSubtarea {
  title: string;
  done: boolean;
  assignee?: string[];
}

export interface MinecoopTarea {
  id: string;
  title: string;
  status: 'pendiente' | 'en-progreso';
  assignee?: string[];
  priority: number;
  notes?: string;
  granjas?: string[];
  proyectos?: string[];
  subtareas?: MinecoopSubtarea[];
}

function taskStatusFor(status: MinecoopTarea['status']): 'todo' | 'in_progress' {
  return status === 'en-progreso' ? 'in_progress' : 'todo';
}

function taskPriorityFor(priority: number): 'low' | 'med' | 'high' {
  if (priority <= 1) return 'low';
  if (priority <= 3) return 'med';
  return 'high';
}

export function importTareas(db: Database.Database, tareas: MinecoopTarea[], projectIdBySlug: Map<string, number>) {
  const playerIdByName = new Map<string, number>();
  for (const row of db.prepare('SELECT id, minecraft_name FROM players').all() as Array<{ id: number; minecraft_name: string }>) {
    playerIdByName.set(row.minecraft_name, row.id);
  }

  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, status, priority, farm_id, project_id)
     VALUES (@title, @description, @status, @priority, @farm_id, @project_id)`
  );
  const insertSubtask = db.prepare('INSERT INTO subtasks (task_id, title, done, sort_order) VALUES (?, ?, ?, ?)');
  const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, player_id) VALUES (?, ?)');

  for (const tarea of tareas) {
    const projectSlug = tarea.proyectos?.[0];
    const projectId = projectSlug ? projectIdBySlug.get(projectSlug) ?? null : null;
    const farmId = !projectId && tarea.granjas?.[0] ? tarea.granjas[0] : null;

    const info = insertTask.run({
      title: tarea.title,
      description: tarea.notes || null,
      status: taskStatusFor(tarea.status),
      priority: taskPriorityFor(tarea.priority),
      farm_id: farmId,
      project_id: projectId,
    });
    const taskId = Number(info.lastInsertRowid);

    (tarea.subtareas ?? []).forEach((subtarea, index) => {
      insertSubtask.run(taskId, subtarea.title, subtarea.done ? 1 : 0, index);
    });

    for (const username of tarea.assignee ?? []) {
      const playerId = playerIdByName.get(username);
      if (playerId) insertAssignee.run(taskId, playerId);
    }
  }
}
