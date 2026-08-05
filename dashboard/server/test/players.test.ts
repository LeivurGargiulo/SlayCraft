import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('player CRUD', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const create = await app.inject({
    method: 'POST',
    url: '/api/players',
    headers: { cookie },
    payload: { minecraft_name: 'leivur', note: 'admin' },
  });
  assert.equal(create.statusCode, 201);
  const player = create.json();

  const update = await app.inject({
    method: 'PATCH',
    url: `/api/players/${player.id}`,
    headers: { cookie },
    payload: { note: 'builder' },
  });
  assert.equal(update.json().note, 'builder');

  const list = await app.inject({ method: 'GET', url: '/api/players', headers: { cookie } });
  assert.equal(list.json().players.length, 1);

  const del = await app.inject({ method: 'DELETE', url: `/api/players/${player.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);
});

test('player actividad defaults to ocasional and can be updated', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const create = await app.inject({
    method: 'POST',
    url: '/api/players',
    headers: { cookie },
    payload: { minecraft_name: 'lei' },
  });
  assert.equal(create.json().actividad, 'ocasional');

  const update = await app.inject({
    method: 'PATCH',
    url: `/api/players/${create.json().id}`,
    headers: { cookie },
    payload: { actividad: 'activo' },
  });
  assert.equal(update.json().actividad, 'activo');

  const rejected = await app.inject({
    method: 'POST',
    url: '/api/players',
    headers: { cookie },
    payload: { minecraft_name: 'invalido', actividad: 'nope' },
  });
  assert.equal(rejected.statusCode, 400);
});

test('GET /api/players/:name/sessions proxies to MCFarmManager', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.includes('/players/leivur/sessions'));
    assert.ok(url.includes('range=7d'));
    return new Response(JSON.stringify({ playerName: 'leivur', range: '7d', sessions: [] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/players/leivur/sessions?range=7d', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().playerName, 'leivur');
});
