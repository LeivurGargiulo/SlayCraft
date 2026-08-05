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

test('completing a task sets completed_at, and old completed tasks are archived out of the list', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const create = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'Cosechar caña de azúcar' },
  });
  const taskId = create.json().id;

  const complete = await app.inject({
    method: 'PATCH', url: `/api/tasks/${taskId}`, headers: { cookie },
    payload: { status: 'done' },
  });
  assert.ok(complete.json().completed_at);

  // backdate completion to 4 days ago to simulate "done for 3+ continuous days"
  db.prepare("UPDATE tasks SET completed_at = datetime('now', '-4 days') WHERE id = ?").run(taskId);

  const list = await app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie } });
  assert.ok(!list.json().tasks.some((t: { id: number }) => t.id === taskId));

  const stillFetchableDirectly = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}`, headers: { cookie } });
  assert.equal(stillFetchableDirectly.json().archived, 1);
});

test('re-opening a done task clears completed_at and un-archives it', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const create = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'Reparar riel', status: 'done' },
  });
  const taskId = create.json().id;
  const reopen = await app.inject({
    method: 'PATCH', url: `/api/tasks/${taskId}`, headers: { cookie },
    payload: { status: 'todo' },
  });
  const reopened = reopen.json();
  assert.equal(reopened.completed_at, null);
  assert.equal(reopened.archived, 0);
});

test('POST with status=done sets completed_at and is subject to archive sweep', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const create = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'Expandir granja de trigo', status: 'done' },
  });
  const taskId = create.json().id;
  assert.ok(create.json().completed_at);

  // backdate completion to 4 days ago to simulate "done for 3+ continuous days"
  db.prepare("UPDATE tasks SET completed_at = datetime('now', '-4 days') WHERE id = ?").run(taskId);

  const list = await app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie } });
  assert.ok(!list.json().tasks.some((t: { id: number }) => t.id === taskId));

  const stillFetchableDirectly = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}`, headers: { cookie } });
  assert.equal(stillFetchableDirectly.json().archived, 1);
});

test('subtasks support rename and multi-assignee', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const p1 = db.prepare("INSERT INTO players (minecraft_name) VALUES ('leivur')").run().lastInsertRowid;
  const p2 = db.prepare("INSERT INTO players (minecraft_name) VALUES ('gargiulo')").run().lastInsertRowid;

  const task = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie }, payload: { title: 'Construir granja de melones' },
  });
  const taskId = task.json().id;

  const subtask = await app.inject({
    method: 'POST', url: `/api/tasks/${taskId}/subtasks`, headers: { cookie },
    payload: { title: 'Comprar semillas', assignee_ids: [p1, p2] },
  });
  assert.equal(subtask.statusCode, 200);
  assert.equal(subtask.json().assignees.length, 2);

  const renamed = await app.inject({
    method: 'PATCH', url: `/api/subtasks/${subtask.json().id}`, headers: { cookie },
    payload: { title: 'Comprar semillas de melón', assignee_ids: [p1] },
  });
  assert.equal(renamed.json().title, 'Comprar semillas de melón');
  assert.equal(renamed.json().assignees.length, 1);
  assert.equal(renamed.json().assignees[0].minecraft_name, 'leivur');

  const parentTask = await app.inject({ method: 'GET', url: `/api/tasks/${taskId}`, headers: { cookie } });
  assert.equal(parentTask.json().subtasks[0].assignees.length, 1);
});

test('GET /api/tasks returns tasks sorted by priority (high, med, low), then by due_date', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  // Create tasks in order: low, high, med (to verify sort is not relying on insertion order)
  const lowTask = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'Low priority task', priority: 'low' },
  });
  const lowId = lowTask.json().id;

  const highTask = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'High priority task', priority: 'high' },
  });
  const highId = highTask.json().id;

  const medTask = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'Med priority task', priority: 'med' },
  });
  const medId = medTask.json().id;

  // Same-priority (high) tasks with different due dates, created out of due-date order,
  // plus one with no due_date, to verify the (due_date IS NULL), due_date ASC tiebreaker.
  const highNoDueTask = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'High priority, no due date', priority: 'high' },
  });
  const highNoDueId = highNoDueTask.json().id;

  const highLateTask = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'High priority, late due date', priority: 'high', due_date: '2026-12-01' },
  });
  const highLateId = highLateTask.json().id;

  const highEarlyTask = await app.inject({
    method: 'POST', url: '/api/tasks', headers: { cookie },
    payload: { title: 'High priority, early due date', priority: 'high', due_date: '2026-08-15' },
  });
  const highEarlyId = highEarlyTask.json().id;

  // Fetch all tasks and verify order
  const list = await app.inject({ method: 'GET', url: '/api/tasks', headers: { cookie } });
  const tasks = list.json().tasks;

  // Find our tasks in the returned list
  const highIdx = tasks.findIndex((t: { id: number }) => t.id === highId);
  const medIdx = tasks.findIndex((t: { id: number }) => t.id === medId);
  const lowIdx = tasks.findIndex((t: { id: number }) => t.id === lowId);
  const highNoDueIdx = tasks.findIndex((t: { id: number }) => t.id === highNoDueId);
  const highLateIdx = tasks.findIndex((t: { id: number }) => t.id === highLateId);
  const highEarlyIdx = tasks.findIndex((t: { id: number }) => t.id === highEarlyId);

  // Verify high comes before med, med comes before low
  assert.ok(highIdx < medIdx, 'high priority should come before med priority');
  assert.ok(medIdx < lowIdx, 'med priority should come before low priority');

  // Verify due_date tiebreaker within the same priority tier: earliest due_date first,
  // then latest, then no due_date last (due_date IS NULL sorts last).
  assert.ok(highEarlyIdx < highLateIdx, 'earlier due_date should come before later due_date within same priority');
  assert.ok(highLateIdx < highNoDueIdx, 'tasks with a due_date should come before tasks with no due_date within same priority');
});

test('GET /api/tasks?farm_id filters to that farm only', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  await app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: { title: 'Reabastecer hierro', farm_id: 'iron' } });
  await app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: { title: 'Sin granja' } });
  await app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: { title: 'Reabastecer oro', farm_id: 'gold' } });

  const res = await app.inject({ method: 'GET', url: '/api/tasks?farm_id=iron', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const titles = res.json().tasks.map((t: { title: string }) => t.title);
  assert.deepEqual(titles, ['Reabastecer hierro']);
});
