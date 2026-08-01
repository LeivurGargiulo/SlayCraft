import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('gallery upload, caption update, delete', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const form = Buffer.concat([
    Buffer.from(
      '--boundary\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n'
    ),
    Buffer.from([137, 80, 78, 71]),
    Buffer.from('\r\n--boundary--\r\n'),
  ]);
  const upload = await app.inject({
    method: 'POST',
    url: '/api/gallery',
    headers: { cookie, 'content-type': 'multipart/form-data; boundary=boundary' },
    payload: form,
  });
  assert.equal(upload.statusCode, 201);
  const image = upload.json();

  const patch = await app.inject({
    method: 'PATCH',
    url: `/api/gallery/${image.id}`,
    headers: { cookie },
    payload: { caption: 'Vista del spawn' },
  });
  assert.equal(patch.json().caption, 'Vista del spawn');

  const del = await app.inject({ method: 'DELETE', url: `/api/gallery/${image.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  const list = await app.inject({ method: 'GET', url: '/api/gallery', headers: { cookie } });
  assert.equal(list.json().images.length, 0);
});
