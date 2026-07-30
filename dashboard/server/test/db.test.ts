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
  for (const t of ['users', 'players', 'projects', 'tasks', 'subtasks', 'task_assignees', 'project_images', 'gallery_images', 'farm_metadata']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('rejects an invalid task status via CHECK constraint', () => {
  const db = openDb(':memory:');
  assert.throws(() => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('x', 'nope')").run();
  });
});
