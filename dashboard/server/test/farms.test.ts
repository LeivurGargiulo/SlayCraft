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

test('farm image upload and delete', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ farms: [{ id: 'iron', name: 'Iron Farm' }] }), { status: 200 })
  );
  t.after(() => fetchMock.mock.restore());

  const form = Buffer.concat([
    Buffer.from(
      '--boundary\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n'
    ),
    Buffer.from([137, 80, 78, 71]),
    Buffer.from('\r\n--boundary--\r\n'),
  ]);
  const upload = await app.inject({
    method: 'POST',
    url: '/api/farms/iron/images',
    headers: { cookie, 'content-type': 'multipart/form-data; boundary=boundary' },
    payload: form,
  });
  assert.equal(upload.statusCode, 201);
  const image = upload.json();
  assert.equal(image.farm_id, 'iron');

  const list = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(list.json().farms[0].images.length, 1);

  const del = await app.inject({ method: 'DELETE', url: `/api/farm-images/${image.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  const list2 = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(list2.json().farms[0].images.length, 0);
});
