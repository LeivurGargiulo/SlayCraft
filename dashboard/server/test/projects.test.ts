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
});
