import { test } from 'node:test';
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
