import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('project CRUD and image upload', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const create = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { cookie },
    payload: { name: 'Muralla del spawn', description: 'Proyecto comunitario' },
  });
  assert.equal(create.statusCode, 201);
  const project = create.json();
  assert.deepEqual(project.images, []);

  const form = Buffer.concat([
    Buffer.from(
      '--boundary\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n'
    ),
    Buffer.from([137, 80, 78, 71]),
    Buffer.from('\r\n--boundary--\r\n'),
  ]);
  const upload = await app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/images`,
    headers: { cookie, 'content-type': 'multipart/form-data; boundary=boundary' },
    payload: form,
  });
  assert.equal(upload.statusCode, 201);

  const get = await app.inject({ method: 'GET', url: `/api/projects/${project.id}`, headers: { cookie } });
  assert.equal(get.json().images.length, 1);

  const imageId = get.json().images[0].id;
  const del = await app.inject({ method: 'DELETE', url: `/api/project-images/${imageId}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  const get2 = await app.inject({ method: 'GET', url: `/api/projects/${project.id}`, headers: { cookie } });
  assert.equal(get2.json().images.length, 0);
});

test('project coordinates can be set and updated', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const create = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { cookie },
    payload: { name: 'Torre del faro', coordinates: '100, 64, -200' },
  });
  assert.equal(create.statusCode, 201);
  assert.equal(create.json().coordinates, '100, 64, -200');

  const id = create.json().id;
  const update = await app.inject({
    method: 'PATCH',
    url: `/api/projects/${id}`,
    headers: { cookie },
    payload: { coordinates: '150, 70, -210' },
  });
  assert.equal(update.json().coordinates, '150, 70, -210');
});
