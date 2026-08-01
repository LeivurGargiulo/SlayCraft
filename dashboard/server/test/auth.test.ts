import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, resetLoginAttemptsForTests } from '../src/auth.js';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('hashPassword/verifyPassword roundtrip', () => {
  const stored = hashPassword('correct horse');
  assert.ok(verifyPassword('correct horse', stored));
  assert.ok(!verifyPassword('wrong', stored));
});

test('unauthenticated request to a protected route is rejected', async () => {
  const { app } = makeApp();
  const res = await app.inject({ method: 'GET', url: '/api/me' });
  assert.equal(res.statusCode, 401);
});

test('login then /api/me succeeds; logout then /api/me fails again', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  assert.equal(me.statusCode, 200);

  const logout = await app.inject({ method: 'POST', url: '/api/logout', headers: { cookie } });
  assert.equal(logout.statusCode, 200);

  const meAfter = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  assert.equal(meAfter.statusCode, 401);
});

test('POST /api/logout succeeds with no content-type header and no body (matches what a bodyless client request looks like)', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({ method: 'POST', url: '/api/logout', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
});

test('wrong password is rejected', async () => {
  const { app, db } = makeApp();
  db.prepare('INSERT INTO users (id, password_hash) VALUES (1, ?)').run(hashPassword('right'));
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'wrong' } });
  assert.equal(res.statusCode, 401);
});

test('repeated wrong passwords lock out further attempts, even with the right password', async () => {
  resetLoginAttemptsForTests();
  const { app, db } = makeApp();
  db.prepare('INSERT INTO users (id, password_hash) VALUES (1, ?)').run(hashPassword('right'));
  for (let i = 0; i < 5; i++) {
    const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'wrong' } });
    assert.equal(res.statusCode, 401);
  }
  const locked = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'right' } });
  assert.equal(locked.statusCode, 429);
});
