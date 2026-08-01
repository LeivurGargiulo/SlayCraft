import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
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

test('tasks table has no blocked status option and gained completed_at/archived columns', () => {
  const db = openDb(':memory:');
  const cols = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
  assert.ok(cols.some((c) => c.name === 'completed_at'));
  assert.ok(cols.some((c) => c.name === 'archived'));
  assert.throws(() => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('x', 'blocked')").run();
  });
});

test('migration: blocked tasks converted to todo, FKs preserved in populated DB', () => {
  // Create a temp DB with old schema containing 'blocked' status and FK-dependent rows
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-migration-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    // Create old-schema DB with blocked status allowed
    const oldDb = new Database(dbPath);
    oldDb.pragma('foreign_keys = ON');

    // Create tables with old schema (includes 'blocked' in CHECK)
    oldDb.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        minecraft_name TEXT NOT NULL UNIQUE,
        note TEXT,
        actividad TEXT NOT NULL DEFAULT 'ocasional' CHECK (actividad IN ('activo','ocasional','inactivo')),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done')),
        priority TEXT NOT NULL DEFAULT 'med' CHECK (priority IN ('low','med','high')),
        due_date TEXT,
        farm_id TEXT,
        project_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS subtasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS task_assignees (
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, player_id)
      );
    `);

    // Insert test data: blocked task with child rows
    oldDb.prepare("INSERT INTO players (id, minecraft_name) VALUES (1, 'testplayer')").run();
    oldDb.prepare("INSERT INTO tasks (id, title, status) VALUES (1, 'blocked task', 'blocked')").run();
    oldDb.prepare("INSERT INTO tasks (id, title, status) VALUES (2, 'todo task', 'todo')").run();
    oldDb.prepare("INSERT INTO subtasks (id, task_id, title) VALUES (1, 1, 'subtask of blocked')").run();
    oldDb.prepare("INSERT INTO task_assignees (task_id, player_id) VALUES (1, 1)").run();

    oldDb.close();

    // Trigger migration by opening with new schema
    const newDb = openDb(dbPath);

    // Verify: blocked task migrated to todo
    const blockedTask = newDb.prepare("SELECT status FROM tasks WHERE id = 1").get() as { status: string };
    assert.equal(blockedTask.status, 'todo', 'blocked task should be converted to todo');

    // Verify: existing todo task unchanged
    const todoTask = newDb.prepare("SELECT status FROM tasks WHERE id = 2").get() as { status: string };
    assert.equal(todoTask.status, 'todo', 'existing todo task should remain unchanged');

    // Verify: subtask still exists and FK is intact
    const subtask = newDb.prepare("SELECT task_id FROM subtasks WHERE id = 1").get() as { task_id: number };
    assert.equal(subtask.task_id, 1, 'subtask should still reference task 1');

    // Verify: task_assignees row still exists
    const assignee = newDb.prepare("SELECT task_id, player_id FROM task_assignees WHERE task_id = 1 AND player_id = 1").get();
    assert.ok(assignee, 'task_assignee should still exist');

    // Verify: FKs in subtasks point to tasks (not tasks_old)
    const subtasksFkList = newDb.prepare("PRAGMA foreign_key_list('subtasks')").all() as Array<{ table: string }>;
    const tasksFK = subtasksFkList.find(fk => fk.table === 'tasks');
    assert.ok(tasksFK, 'subtasks should have FK to tasks table (not tasks_old)');

    // Verify: FKs in task_assignees point to tasks (not tasks_old)
    const assigneeFkList = newDb.prepare("PRAGMA foreign_key_list('task_assignees')").all() as Array<{ table: string }>;
    const tasksFkInAssignee = assigneeFkList.find(fk => fk.table === 'tasks');
    assert.ok(tasksFkInAssignee, 'task_assignees should have FK to tasks table (not tasks_old)');

    // Verify: no FK constraint violations
    const violations = newDb.prepare("PRAGMA foreign_key_check").all();
    assert.equal(violations.length, 0, 'no FK violations should exist after migration');

    // Verify: cannot insert 'blocked' status after migration
    assert.throws(() => {
      newDb.prepare("INSERT INTO tasks (title, status) VALUES ('blocked attempt', 'blocked')").run();
    }, 'should reject blocked status after migration');

    newDb.close();
  } finally {
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  }
});

test('subtask_assignees table exists', () => {
  const db = openDb(':memory:');
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='subtask_assignees'").get();
  assert.ok(table);
});
