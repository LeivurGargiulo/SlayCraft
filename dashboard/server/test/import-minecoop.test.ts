import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { importJugadores, importProyectos, importGranjas, importTareas } from '../src/scripts/import-minecoop.js';

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

test('importGranjas registers a Farm per granja via MCFarmManager and stores metadata', async (t) => {
  const db = openDb(':memory:');
  const calls: Array<{ url: string; init: any }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(JSON.parse(init.body)), { status: 201 });
  });
  t.after(() => fetchMock.mock.restore());

  await importGranjas(db, [
    { id: 'granja-hierro', title: 'Granja de Hierro', coordinates: ['Almacen: 0, 0, 0', 'Punto AFK: 0, 0, 0'] },
    { id: 'granja-blaze', title: 'Granja de Blaze', coordinates: ['Granja (Nether): 0, 0, 0'] },
  ]);

  assert.equal(calls.length, 2);
  const ironBody = JSON.parse(calls[0].init.body);
  assert.equal(ironBody.id, 'granja-hierro');
  assert.equal(ironBody.dimension, 'minecraft:overworld');
  assert.equal(ironBody.storage.length, 1);
  assert.ok(ironBody.afkSpot);

  const blazeBody = JSON.parse(calls[1].init.body);
  assert.equal(blazeBody.dimension, 'minecraft:the_nether');
  assert.equal(blazeBody.storage.length, 0);
  assert.equal(blazeBody.afkSpot, null);

  const metadata = db.prepare('SELECT coordinates FROM farm_metadata WHERE farm_id = ?').get('granja-hierro') as any;
  assert.equal(metadata.coordinates, 'Almacen: 0, 0, 0; Punto AFK: 0, 0, 0');
});

test('importTareas maps status/priority, links project over farm, and imports subtasks + assignees', () => {
  const db = openDb(':memory:');
  importJugadores(db, [
    { username: 'SlayerL99', actividad: 'activo' },
    { username: 'Syanurix', actividad: 'activo' },
  ]);
  const projectIdBySlug = importProyectos(db, [{ id: 'zona-industrial', title: 'Zona Industrial', coordinates: ['Centro: 0, 0, 0'] }]);

  importTareas(
    db,
    [
      {
        id: 'granja-kelp',
        title: 'reConstruir Granja de Kelp',
        status: 'pendiente',
        priority: 3,
        assignee: ['SlayerL99'],
        granjas: ['granja-kelp'],
        proyectos: ['zona-industrial'],
        subtareas: [
          { title: 'Juntar materiales', done: false, assignee: ['Syanurix'] },
          { title: 'Quitar granja actual', done: false },
        ],
      },
      {
        id: 'catedral',
        title: 'Construir Catedral',
        status: 'en-progreso',
        priority: 4,
        assignee: ['SlayerL99'],
      },
    ],
    projectIdBySlug
  );

  const kelp = db.prepare('SELECT status, priority, project_id, farm_id FROM tasks WHERE title = ?').get('reConstruir Granja de Kelp') as any;
  assert.equal(kelp.status, 'todo');
  assert.equal(kelp.priority, 'med');
  assert.equal(kelp.project_id, projectIdBySlug.get('zona-industrial'));
  assert.equal(kelp.farm_id, null);

  const catedral = db.prepare('SELECT status, priority, project_id, farm_id FROM tasks WHERE title = ?').get('Construir Catedral') as any;
  assert.equal(catedral.status, 'in_progress');
  assert.equal(catedral.priority, 'high');
  assert.equal(catedral.project_id, null);
  assert.equal(catedral.farm_id, null);

  const kelpTaskId = db.prepare('SELECT id FROM tasks WHERE title = ?').get('reConstruir Granja de Kelp') as any;
  const subtasks = db.prepare('SELECT title, done FROM subtasks WHERE task_id = ? ORDER BY sort_order').all(kelpTaskId.id);
  assert.deepEqual(subtasks, [
    { title: 'Juntar materiales', done: 0 },
    { title: 'Quitar granja actual', done: 0 },
  ]);

  const assignees = db
    .prepare('SELECT p.minecraft_name FROM players p JOIN task_assignees ta ON ta.player_id = p.id WHERE ta.task_id = ?')
    .all(kelpTaskId.id);
  assert.deepEqual(assignees, [{ minecraft_name: 'SlayerL99' }]);
});
