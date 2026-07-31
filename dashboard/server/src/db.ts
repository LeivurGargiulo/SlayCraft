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
  return db;
}
