import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { importJugadores, importProyectos, importGranjas } from '../src/scripts/import-minecoop.js';

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
