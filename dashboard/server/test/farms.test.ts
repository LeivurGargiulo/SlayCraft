import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('GET /api/farms merges MCFarmManager data with dashboard metadata', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  db.prepare('INSERT INTO farm_metadata (farm_id, notes, tags) VALUES (?, ?, ?)').run('iron', 'necesita mas cofres', 'prioridad,hierro');

  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ farms: [{ id: 'iron', name: 'Iron Farm' }] }), { status: 200 })
  );
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.farms[0].id, 'iron');
  assert.deepEqual(body.farms[0].metadata, { notes: 'necesita mas cofres', tags: ['prioridad', 'hierro'] });
});

test('GET /api/farms returns 502 when MCFarmManager is unreachable', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('ECONNREFUSED');
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(res.statusCode, 502);
});

test('PATCH /api/farms/:id/metadata upserts notes and tags', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { notes: 'ok', tags: ['a', 'b'] },
  });
  assert.equal(res.statusCode, 200);
  const row = db.prepare('SELECT * FROM farm_metadata WHERE farm_id = ?').get('iron') as any;
  assert.equal(row.notes, 'ok');
  assert.equal(row.tags, 'a,b');
});
