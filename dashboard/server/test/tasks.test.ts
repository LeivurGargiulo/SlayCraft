import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('full task lifecycle: create, add subtask, assign player, update, delete', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const playerId = db.prepare("INSERT INTO players (minecraft_name) VALUES ('leivur')").run().lastInsertRowid;

  const create = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: { cookie },
    payload: { title: 'Reabastecer granja de hierro', priority: 'high', assignee_ids: [playerId] },
  });
  assert.equal(create.statusCode, 201);
  const task = create.json();
  assert.equal(task.status, 'todo');
  assert.equal(task.assignees.length, 1);
  assert.equal(task.assignees[0].minecraft_name, 'leivur');

  const subtask = await app.inject({
    method: 'POST',
    url: `/api/tasks/${task.id}/subtasks`,
    headers: { cookie },
    payload: { title: 'Revisar cofres' },
  });
  assert.equal(subtask.statusCode, 200);

  const update = await app.inject({
    method: 'PATCH',
    url: `/api/tasks/${task.id}`,
    headers: { cookie },
    payload: { status: 'in_progress' },
  });
  const updated = update.json();
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.subtasks.length, 1);

  const del = await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  const getAfter = await app.inject({ method: 'GET', url: `/api/tasks/${task.id}`, headers: { cookie } });
  assert.equal(getAfter.statusCode, 404);
});

test('invalid status is rejected with 400', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'POST',
    url: '/api/tasks',
    headers: { cookie },
    payload: { title: 'x', status: 'nope' },
  });
  assert.equal(res.statusCode, 400); // zod throws, app-level error handler maps ZodError -> 400 with a Spanish message
});
