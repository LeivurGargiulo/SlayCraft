import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  const tasksTableSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined
  )?.sql ?? '';
  if (tasksTableSql.includes("'blocked'")) {
    db.exec("UPDATE tasks SET status='todo' WHERE status='blocked'");
    db.exec('ALTER TABLE tasks RENAME TO tasks_old');
    db.exec('ALTER TABLE subtasks RENAME TO subtasks_old');
    db.exec('ALTER TABLE task_assignees RENAME TO task_assignees_old');
    db.exec(schema);
    db.exec(`
      INSERT INTO tasks (id, title, description, status, priority, due_date, farm_id, project_id, created_at, updated_at)
      SELECT id, title, description, status, priority, due_date, farm_id, project_id, created_at, updated_at FROM tasks_old
    `);
    db.exec(`
      INSERT INTO subtasks (id, task_id, title, done, sort_order)
      SELECT id, task_id, title, done, sort_order FROM subtasks_old
    `);
    db.exec(`
      INSERT INTO task_assignees (task_id, player_id)
      SELECT task_id, player_id FROM task_assignees_old
    `);
    db.exec('DROP TABLE tasks_old');
    db.exec('DROP TABLE subtasks_old');
    db.exec('DROP TABLE task_assignees_old');
  }
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
  if (!taskColumns.some((c) => c.name === 'completed_at')) {
    db.exec('ALTER TABLE tasks ADD COLUMN completed_at TEXT');
  }
  if (!taskColumns.some((c) => c.name === 'archived')) {
    db.exec("ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
  }
  const projectColumns = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string }>;
  if (!projectColumns.some((c) => c.name === 'coordinates')) {
    db.exec('ALTER TABLE projects ADD COLUMN coordinates TEXT');
  }
  const farmMetadataColumns = db.prepare('PRAGMA table_info(farm_metadata)').all() as Array<{ name: string }>;
  if (!farmMetadataColumns.some((c) => c.name === 'coordinates')) {
    db.exec('ALTER TABLE farm_metadata ADD COLUMN coordinates TEXT');
  }
  if (!farmMetadataColumns.some((c) => c.name === 'expected_rates')) {
    db.exec('ALTER TABLE farm_metadata ADD COLUMN expected_rates TEXT');
  }
  if (!farmMetadataColumns.some((c) => c.name === 'manual')) {
    db.exec('ALTER TABLE farm_metadata ADD COLUMN manual INTEGER NOT NULL DEFAULT 0');
  }
  const playerColumns = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
  if (!playerColumns.some((c) => c.name === 'actividad')) {
    db.exec("ALTER TABLE players ADD COLUMN actividad TEXT NOT NULL DEFAULT 'ocasional' CHECK (actividad IN ('activo','ocasional','inactivo'))");
  }
  return db;
}
