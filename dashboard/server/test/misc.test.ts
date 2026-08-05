import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('GET /api/alerts proxies the active alert list', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ alerts: [{ id: 1, farmId: 'iron', type: 'storage_full', message: 'm', createdAt: '2026-01-01T00:00:00Z' }] }), { status: 200 })
  );
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/alerts', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().alerts[0].farmId, 'iron');
});

test('POST /api/alerts/:id/dismiss proxies the dismiss call', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(init.method, 'POST');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'POST', url: '/api/alerts/1/dismiss', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});

test('POST /api/alerts/:id/dismiss returns 404 when MCFarmManager reports 404', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ error: 'unknown alert' }), { status: 404 })
  );
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'POST', url: '/api/alerts/999/dismiss', headers: { cookie } });
  assert.equal(res.statusCode, 404);
});

test('GET /api/performance/history proxies range param', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.includes('/performance/history'));
    assert.ok(url.includes('range=7d'));
    return new Response(JSON.stringify({ range: '7d', samples: [] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/performance/history?range=7d', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().range, '7d');
});

test('GET /api/search proxies the item query', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.includes('/search?item=diamond'));
    return new Response(JSON.stringify({ results: [{ farmId: 'iron', farmName: 'Iron Farm', storageId: 'main-chest', storageLabel: 'Cofre principal', itemId: 'minecraft:diamond', count: 12 }] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/search?item=diamond', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().results[0].itemId, 'minecraft:diamond');
});
