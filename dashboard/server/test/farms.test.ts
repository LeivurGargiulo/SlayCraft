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
  assert.deepEqual(body.farms[0].metadata, { notes: 'necesita mas cofres', tags: ['prioridad', 'hierro'], coordinates: null, expected_rates: {}, manual: false, hidden: false, off: false, off_reason: null });
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

test('GET /api/farms reports offline once flow into storage has stopped, even if storage stays full', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const now = Date.now();
  const sampleAt = (minutesAgo: number) => new Date(now - minutesAgo * 60 * 1000).toISOString();
  const samples = [
    { sampledAt: sampleAt(60), storageCounts: { iron_ingot: 0 } },
    { sampledAt: sampleAt(45), storageCounts: { iron_ingot: 100 } },
    { sampledAt: sampleAt(30), storageCounts: { iron_ingot: 320 } },
    { sampledAt: sampleAt(20), storageCounts: { iron_ingot: 320 } },
    { sampledAt: sampleAt(10), storageCounts: { iron_ingot: 320 } },
    { sampledAt: sampleAt(0), storageCounts: { iron_ingot: 320 } },
  ];

  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('/history')) return new Response(JSON.stringify({ samples }), { status: 200 });
    return new Response(JSON.stringify({ farms: [{ id: 'iron', name: 'Iron Farm', occupantCount: 0 }] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(res.json().farms[0].online, false);
});

test('GET /api/farms reports offline when an occupant is present but storage flow has stopped', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const now = Date.now();
  const sampleAt = (minutesAgo: number) => new Date(now - minutesAgo * 60 * 1000).toISOString();
  const samples = [
    { sampledAt: sampleAt(10), storageCounts: { iron_ingot: 320 } },
    { sampledAt: sampleAt(5), storageCounts: { iron_ingot: 320 } },
    { sampledAt: sampleAt(0), storageCounts: { iron_ingot: 320 } },
  ];

  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('/history')) return new Response(JSON.stringify({ samples }), { status: 200 });
    return new Response(JSON.stringify({ farms: [{ id: 'iron', name: 'Iron Farm', occupantCount: 1 }] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(res.json().farms[0].online, false);
});

test('GET /api/farms stays online when a tracked item grows even though an unrelated item in the same chest was withdrawn', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const now = Date.now();
  const sampleAt = (minutesAgo: number) => new Date(now - minutesAgo * 60 * 1000).toISOString();
  const samples = [
    { sampledAt: sampleAt(10), storageCounts: { 'minecraft:iron_ingot': 64, 'minecraft:iron_block': 1664 } },
    { sampledAt: sampleAt(5), storageCounts: { 'minecraft:iron_ingot': 367, 'minecraft:iron_block': 384 } },
    { sampledAt: sampleAt(0), storageCounts: { 'minecraft:iron_ingot': 1117, 'minecraft:iron_block': 384 } },
  ];

  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('/history')) return new Response(JSON.stringify({ samples }), { status: 200 });
    return new Response(JSON.stringify({ farms: [{ id: 'iron', name: 'Iron Farm', occupantCount: 0 }] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(res.json().farms[0].online, true);
});

test('PATCH /api/farms/:id/metadata upserts notes, tags, and coordinates', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { notes: 'ok', tags: ['a', 'b'], coordinates: '120, 80, -500' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().metadata.coordinates, '120, 80, -500');
  const row = db.prepare('SELECT * FROM farm_metadata WHERE farm_id = ?').get('iron') as any;
  assert.equal(row.notes, 'ok');
  assert.equal(row.tags, 'a,b');
  assert.equal(row.coordinates, '120, 80, -500');
});

test('PATCH /api/farms/:id/metadata round-trips expected_rates', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { expected_rates: { iron_ingot: 120, gold_nugget: 40 } },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().metadata.expected_rates, { iron_ingot: 120, gold_nugget: 40 });

  const row = db.prepare('SELECT expected_rates FROM farm_metadata WHERE farm_id = ?').get('iron') as any;
  assert.deepEqual(JSON.parse(row.expected_rates), { iron_ingot: 120, gold_nugget: 40 });
});

test('metadata expected_rates defaults to an empty object when unset', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { notes: 'sin tasas todavia' },
  });
  assert.deepEqual(res.json().metadata.expected_rates, {});
});

const sampleFarmConfig = {
  id: 'iron',
  name: 'Iron Farm',
  dimension: 'minecraft:overworld',
  anchor: { x: 120, y: 80, z: -500 },
  entityScanRadius: 16,
  fakePlayerName: null,
  storage: [],
  afkSpot: null,
};

test('POST /api/farms creates a farm and proxies the config to MCFarmManager', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(init.method, 'POST');
    assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/json');
    return new Response(JSON.stringify(sampleFarmConfig), { status: 201 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'POST', url: '/api/farms', headers: { cookie }, payload: sampleFarmConfig });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().id, 'iron');
});

test('PUT /api/farms/:id rejects a body id mismatch', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({ method: 'PUT', url: '/api/farms/other', headers: { cookie }, payload: sampleFarmConfig });
  assert.equal(res.statusCode, 400);
});

test('DELETE /api/farms/:id proxies deletion and clears dashboard-side metadata/images', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  db.prepare('INSERT INTO farm_metadata (farm_id, notes) VALUES (?, ?)').run('iron', 'nota');
  db.prepare('INSERT INTO farm_images (farm_id, path) VALUES (?, ?)').run('iron', 'nonexistent.png');
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(init.method, 'DELETE');
    return new Response(null, { status: 204 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'DELETE', url: '/api/farms/iron', headers: { cookie } });
  assert.equal(res.statusCode, 204);
  assert.equal(db.prepare('SELECT * FROM farm_metadata WHERE farm_id = ?').get('iron'), undefined);
  assert.equal(db.prepare('SELECT * FROM farm_images WHERE farm_id = ?').get('iron'), undefined);
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

test('PATCH /api/farms/:id/metadata round-trips manual flag, defaulting to false', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { manual: true },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().metadata.manual, true);

  const row = db.prepare('SELECT manual FROM farm_metadata WHERE farm_id = ?').get('iron') as { manual: number };
  assert.equal(row.manual, 1);
});

test('metadata manual defaults to false when unset', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { notes: 'sin toggle todavia' },
  });
  assert.equal(res.json().metadata.manual, false);
});

test('PATCH /api/farms/:id/metadata round-trips off_reason', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { off: true, off_reason: 'Sin hierro cerca, reubicar' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().metadata.off_reason, 'Sin hierro cerca, reubicar');
});

test('turning a farm off auto-creates a 7-day reminder task linked to that farm', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ id: 'iron', name: 'Iron Farm' }), { status: 200 })
  );
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { off: true },
  });
  assert.equal(res.statusCode, 200);

  const tasks = db.prepare('SELECT * FROM tasks WHERE farm_id = ?').all('iron') as Array<{ title: string; priority: string; status: string; due_date: string }>;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Revisar granja apagada: Iron Farm');
  assert.equal(tasks[0].priority, 'med');
  assert.equal(tasks[0].status, 'todo');
  assert.ok(tasks[0].due_date);
});

test('turning an already-off farm off again does not create a duplicate reminder task', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  db.prepare('INSERT INTO farm_metadata (farm_id, off) VALUES (?, 1)').run('iron');

  await app.inject({ method: 'PATCH', url: '/api/farms/iron/metadata', headers: { cookie }, payload: { off: true } });

  const tasks = db.prepare('SELECT * FROM tasks WHERE farm_id = ?').all('iron');
  assert.equal(tasks.length, 0);
});

test('turning a farm back on does not create a reminder task', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  db.prepare('INSERT INTO farm_metadata (farm_id, off) VALUES (?, 1)').run('iron');

  await app.inject({ method: 'PATCH', url: '/api/farms/iron/metadata', headers: { cookie }, payload: { off: false } });

  const tasks = db.prepare('SELECT * FROM tasks WHERE farm_id = ?').all('iron');
  assert.equal(tasks.length, 0);
});
