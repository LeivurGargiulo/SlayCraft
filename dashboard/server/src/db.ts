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
