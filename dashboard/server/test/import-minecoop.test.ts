import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { importJugadores, importProyectos } from '../src/scripts/import-minecoop.js';

test('importJugadores inserts players with their actividad', () => {
  const db = openDb(':memory:');
  importJugadores(db, [
    { username: 'SlayerL99', actividad: 'activo' },
    { username: 'BjornViking206', actividad: 'inactivo' },
  ]);
  const rows = db.prepare('SELECT minecraft_name, actividad FROM players ORDER BY minecraft_name').all();
  assert.deepEqual(rows, [
    { minecraft_name: 'BjornViking206', actividad: 'inactivo' },
    { minecraft_name: 'SlayerL99', actividad: 'activo' },
  ]);
});

test('importProyectos inserts projects and returns a slug-to-id map', () => {
  const db = openDb(':memory:');
  const ids = importProyectos(db, [
    { id: 'catedral', title: 'Catedral', coordinates: ['Centro: 0, 0, 0'] },
  ]);
  const projectId = ids.get('catedral');
  assert.ok(projectId);
  const row = db.prepare('SELECT name, status, coordinates FROM projects WHERE id = ?').get(projectId);
  assert.deepEqual(row, { name: 'Catedral', status: 'active', coordinates: 'Centro: 0, 0, 0' });
});
