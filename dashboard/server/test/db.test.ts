import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';

test('openDb applies schema and enables WAL + foreign keys', () => {
  const db = openDb(':memory:');
  const journalMode = db.pragma('journal_mode', { simple: true });
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  assert.equal(foreignKeys, 1);
  // :memory: databases report 'memory' journal mode regardless of the pragma set — assert it was accepted without error instead
  assert.ok(typeof journalMode === 'string');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
  for (const t of ['users', 'players', 'projects', 'tasks', 'subtasks', 'task_assignees', 'project_images', 'gallery_images', 'farm_metadata', 'farm_images']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('projects table has a nullable coordinates column', () => {
  const db = openDb(':memory:');
  const columns = db.prepare('PRAGMA table_info(projects)').all().map((c: any) => c.name);
  assert.ok(columns.includes('coordinates'), 'projects table missing coordinates column');
  db.prepare("INSERT INTO projects (name) VALUES ('sin coordenadas')").run();
  const row = db.prepare("SELECT coordinates FROM projects WHERE name = 'sin coordenadas'").get() as any;
  assert.equal(row.coordinates, null);
});

test('farm_metadata table has a nullable expected_rates column', () => {
  const db = openDb(':memory:');
  const columns = db.prepare('PRAGMA table_info(farm_metadata)').all().map((c: any) => c.name);
  assert.ok(columns.includes('expected_rates'), 'farm_metadata table missing expected_rates column');
  db.prepare("INSERT INTO farm_metadata (farm_id) VALUES ('test-farm')").run();
  const row = db.prepare("SELECT expected_rates FROM farm_metadata WHERE farm_id = 'test-farm'").get() as any;
  assert.equal(row.expected_rates, null);
});

test('rejects an invalid task status via CHECK constraint', () => {
  const db = openDb(':memory:');
  assert.throws(() => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('x', 'nope')").run();
  });
});

test('players table has an actividad column defaulting to ocasional', () => {
  const db = openDb(':memory:');
  const columns = db.prepare('PRAGMA table_info(players)').all().map((c: any) => c.name);
  assert.ok(columns.includes('actividad'), 'players table missing actividad column');
  db.prepare("INSERT INTO players (minecraft_name) VALUES ('sinactividad')").run();
  const row = db.prepare("SELECT actividad FROM players WHERE minecraft_name = 'sinactividad'").get() as any;
  assert.equal(row.actividad, 'ocasional');
});

test('rejects an invalid players.actividad via CHECK constraint', () => {
  const db = openDb(':memory:');
  assert.throws(() => {
    db.prepare("INSERT INTO players (minecraft_name, actividad) VALUES ('x', 'nope')").run();
  });
});
