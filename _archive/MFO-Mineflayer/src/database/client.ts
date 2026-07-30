import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  readonly db: Db;
  readonly sqlite: Database.Database;
  readonly close: () => void;
}

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function createDatabase(path: string): DatabaseHandle {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);

  if (path !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
}
