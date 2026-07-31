# Batch B Data Model Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add farm images, project coordinates, task priority color badges, task filters (assignee/priority/farm/project), a farm/project picker on the task form with link badges, and a 3D player skin viewer — per `docs/superpowers/specs/2026-07-31-batch-b-data-model-additions-design.md`. Follows Batch A (dashboard-only polish, already planned separately); this batch adds one new table, one new column, and one new client dependency, but still zero MCFarmManager mod changes.

**Architecture:** Server changes follow the codebase's existing per-resource route-file pattern (`routes/farms.ts`, `routes/projects.ts`) with Zod validation and the shared error handler in `app.ts`. Farm images mirror `project_images` exactly, keyed by `farm_id TEXT` instead of an integer FK (farms have no local table — same convention as the existing `farm_metadata`). Client changes follow existing hook/page patterns (`@tanstack/react-query` hooks in `hooks.ts`, page components under `pages/`).

**Tech Stack:** Fastify, `better-sqlite3`, Zod (server). React 18, TypeScript, `@tanstack/react-query`, React Router, Tailwind CSS, Vite, new dependency `skinview3d` (client). Server tests: Node's built-in `node:test` + `node:assert/strict`, run via `npm test` in `dashboard/server`. No client test framework — client tasks verify via `tsc` (`npm run build`) plus manual browser checks, consistent with Batch A.

## Global Constraints

- No MCFarmManager mod changes anywhere in this plan.
- Task priority stays 3-tier (`low`/`med`/`high`) — no schema change to the `priority` CHECK constraint.
- Task-to-farm/project linking stays single (existing `farm_id`/`project_id` columns) — no new join tables.
- Project coordinates is a free-text nullable column, not structured x/y/z.
- Farm images mirror `project_images` field-for-field except `farm_id TEXT` in place of an integer FK.
- Reuse existing Tailwind color tokens (`status.done` green, `status.progress` amber, `status.blocked` red) for the priority badge — no new colors added to `tailwind.config.ts`.
- All new upload routes reuse the exact drain-before-reject pattern already in `routes/projects.ts:79-82` (calling `file.toBuffer()` before returning a 400 on a disallowed extension) — this was a prior connection-hang bug fix and must not regress.

---

### Task 1: Schema — `farm_images` table + `projects.coordinates` column

**Files:**
- Modify: `dashboard/server/src/schema.sql`
- Test: `dashboard/server/test/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `farm_images(id, farm_id TEXT, path, caption, sort_order)`; column `projects.coordinates TEXT` (nullable). Task 2 and Task 5 depend on these existing.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/db.test.ts`, inside the existing first test's table-list loop, add `'farm_images'` to the array on line 13:

```typescript
  for (const t of ['users', 'players', 'projects', 'tasks', 'subtasks', 'task_assignees', 'project_images', 'gallery_images', 'farm_metadata', 'farm_images']) {
```

Then add a new test at the end of the file:

```typescript
test('projects table has a nullable coordinates column', () => {
  const db = openDb(':memory:');
  const columns = db.prepare('PRAGMA table_info(projects)').all().map((c: any) => c.name);
  assert.ok(columns.includes('coordinates'), 'projects table missing coordinates column');
  db.prepare("INSERT INTO projects (name) VALUES ('sin coordenadas')").run();
  const row = db.prepare("SELECT coordinates FROM projects WHERE name = 'sin coordenadas'").get() as any;
  assert.equal(row.coordinates, null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/server && npm test`
Expected: both new assertions FAIL — `farm_images` missing from the table list, `coordinates` missing from `PRAGMA table_info(projects)`.

- [ ] **Step 3: Add the schema changes**

In `dashboard/server/src/schema.sql`, add after the `farm_metadata` table definition (end of file):

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS coordinates TEXT;

CREATE TABLE IF NOT EXISTS farm_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id TEXT NOT NULL,
  path TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard/server && npm test`
Expected: all tests PASS, including the two from Step 1.

- [ ] **Step 5: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/server/src/schema.sql dashboard/server/test/db.test.ts
git commit -m "dashboard: add farm_images table and projects.coordinates column"
```

---

### Task 2: Server — farm image upload/delete routes

**Files:**
- Modify: `dashboard/server/src/routes/farms.ts`
- Modify: `dashboard/server/src/app.ts:45` (pass `uploadsDir` to `registerFarmRoutes`)
- Test: `dashboard/server/test/farms.test.ts`

**Interfaces:**
- Consumes: `farm_images` table (Task 1).
- Produces: `registerFarmRoutes(app, db, uploadsDir)` (signature change — was `(app, db)`); routes `POST /api/farms/:id/images`, `DELETE /api/farm-images/:id`; `GET /api/farms` and `GET /api/farms/:id` responses gain an `images: Array<{id, farm_id, path, caption, sort_order}>` field. Task 3 (client types/hooks) depends on this response shape.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/farms.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `/api/farms/iron/images` returns 404 (route doesn't exist yet).

- [ ] **Step 3: Implement the routes**

Replace the full contents of `dashboard/server/src/routes/farms.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { mcfmFetch, McfmError } from '../mcfarmmanager.js';

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

interface FarmMetadataRow {
  farm_id: string;
  notes: string | null;
  tags: string | null;
}

function getMetadata(db: Database.Database, farmId: string) {
  const row = db.prepare('SELECT notes, tags FROM farm_metadata WHERE farm_id = ?').get(farmId) as
    | FarmMetadataRow
    | undefined;
  return { notes: row?.notes ?? null, tags: row?.tags ? row.tags.split(',').filter(Boolean) : [] };
}

function getImages(db: Database.Database, farmId: string) {
  return db.prepare('SELECT * FROM farm_images WHERE farm_id = ? ORDER BY sort_order').all(farmId);
}

async function withMcfm<T>(reply: import('fastify').FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof McfmError) return reply.code(err.status === 404 ? 404 : 502).send({ error: err.message });
    throw err;
  }
}

const metadataSchema = z.object({
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export function registerFarmRoutes(app: FastifyInstance, db: Database.Database, uploadsDir: string) {
  app.get('/api/farms', async (_req, reply) =>
    withMcfm(reply, async () => {
      const data = (await mcfmFetch('/farms')) as { farms: Array<{ id: string }> };
      return { farms: data.farms.map((f) => ({ ...f, metadata: getMetadata(db, f.id), images: getImages(db, f.id) })) };
    })
  );

  app.get('/api/farms/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return withMcfm(reply, async () => {
      const farm = (await mcfmFetch(`/farms/${encodeURIComponent(id)}`)) as Record<string, unknown>;
      return { ...farm, metadata: getMetadata(db, id), images: getImages(db, id) };
    });
  });

  app.get('/api/farms/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { range } = req.query as { range?: string };
    return withMcfm(reply, () => mcfmFetch(`/farms/${encodeURIComponent(id)}/history?range=${encodeURIComponent(range ?? '24h')}`));
  });

  app.patch('/api/farms/:id/metadata', async (req) => {
    const { id } = req.params as { id: string };
    const body = metadataSchema.parse(req.body);
    db.prepare(
      `INSERT INTO farm_metadata (farm_id, notes, tags) VALUES (?, ?, ?)
       ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, tags = excluded.tags`
    ).run(id, body.notes ?? null, body.tags ? body.tags.join(',') : null);
    return { ok: true, metadata: getMetadata(db, id) };
  });

  app.post('/api/farms/:id/images', async (req, reply) => {
    const farmId = (req.params as { id: string }).id;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Falta el archivo' });
    const ext = path.extname(file.filename).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      await file.toBuffer();
      return reply.code(400).send({ error: 'Formato de imagen no permitido' });
    }
    const filename = `${crypto.randomUUID()}${ext}`;
    await fs.promises.writeFile(path.join(uploadsDir, filename), await file.toBuffer());
    const caption = (file.fields.caption as { value?: string } | undefined)?.value ?? null;
    const info = db
      .prepare('INSERT INTO farm_images (farm_id, path, caption, sort_order) VALUES (?, ?, ?, 0)')
      .run(farmId, filename, caption);
    reply.code(201);
    return db.prepare('SELECT * FROM farm_images WHERE id = ?').get(info.lastInsertRowid);
  });

  app.delete('/api/farm-images/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const img = db.prepare('SELECT * FROM farm_images WHERE id = ?').get(id) as { path: string } | undefined;
    if (img) fs.rmSync(path.join(uploadsDir, img.path), { force: true });
    db.prepare('DELETE FROM farm_images WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });
}
```

- [ ] **Step 4: Wire `uploadsDir` into the call site**

In `dashboard/server/src/app.ts:45`, change:

```typescript
  registerFarmRoutes(app, db);
```

to:

```typescript
  registerFarmRoutes(app, db, uploadsDir);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS, all tests including the new one.

- [ ] **Step 6: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/server/src/routes/farms.ts dashboard/server/src/app.ts dashboard/server/test/farms.test.ts
git commit -m "dashboard: add farm image upload/delete routes"
```

---

### Task 3: Server — project coordinates in CRUD

**Files:**
- Modify: `dashboard/server/src/routes/projects.ts`
- Test: `dashboard/server/test/projects.test.ts`

**Interfaces:**
- Consumes: `projects.coordinates` column (Task 1).
- Produces: `POST /api/projects` and `PATCH /api/projects/:id` accept an optional `coordinates` field; `GET /api/projects`/`GET /api/projects/:id` responses include `coordinates: string | null`. Task 8 (client project type/UI) depends on this.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/projects.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `coordinates` is `undefined` in the response (field not read/written yet).

- [ ] **Step 3: Add coordinates to the Zod schema, insert, update, and select**

In `dashboard/server/src/routes/projects.ts`, change the `projectInput` schema (lines 10-14):

```typescript
const projectInput = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.string().min(1).default('active'),
  coordinates: z.string().nullable().optional(),
});
```

Change the `ProjectRow` interface (lines 16-22):

```typescript
interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  status: string;
  coordinates: string | null;
  created_at: string;
}
```

Change the `POST /api/projects` insert (lines 41-48):

```typescript
  app.post('/api/projects', async (req, reply) => {
    const body = projectInput.parse(req.body);
    const info = db
      .prepare('INSERT INTO projects (name, description, status, coordinates) VALUES (?, ?, ?, ?)')
      .run(body.name, body.description ?? null, body.status, body.coordinates ?? null);
    reply.code(201);
    return { ...(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid) as ProjectRow), images: [] };
  });
```

Change the `PATCH /api/projects/:id` update (lines 50-62):

```typescript
  app.patch('/api/projects/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    if (!existing) return reply.code(404).send({ error: 'Proyecto no encontrado' });
    const body = projectInput.partial().parse(req.body);
    db.prepare('UPDATE projects SET name=@name, description=@description, status=@status, coordinates=@coordinates WHERE id=@id').run({
      id,
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      status: body.status ?? existing.status,
      coordinates: body.coordinates !== undefined ? body.coordinates : existing.coordinates,
    });
    return { ...(db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow), images: getImages(db, id) };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/server/src/routes/projects.ts dashboard/server/test/projects.test.ts
git commit -m "dashboard: support project coordinates in create/update"
```

---

### Task 4: Client — types and hooks for farm images and project coordinates

**Files:**
- Modify: `dashboard/client/src/api/types.ts`
- Modify: `dashboard/client/src/api/hooks.ts`

**Interfaces:**
- Consumes: API shapes from Task 2 (`images` on `FarmSummary`/`FarmDetail`) and Task 3 (`coordinates` on `Project`).
- Produces: type `FarmImage`; `FarmSummary.images: FarmImage[]`; `Project.coordinates: string | null`; hooks `useUploadFarmImage`, `useDeleteFarmImage`. Task 5 (GranjaDetail UI) and Task 8 (ProyectoDetail UI) depend on these.

- [ ] **Step 1: Add the `FarmImage` type and extend `FarmSummary`/`Project`**

In `dashboard/client/src/api/types.ts`, add after the `ProjectImage` interface (after line 97):

```typescript
export interface FarmImage {
  id: number;
  farm_id: string;
  path: string;
  caption: string | null;
  sort_order: number;
}
```

Change `FarmSummary` (lines 45-54) to add `images`:

```typescript
export interface FarmSummary {
  id: string;
  name: string;
  dimension: string;
  entityCount: number;
  storageItemCount: number;
  chunkLoaded: boolean;
  fakePlayerOnline: boolean;
  metadata: { notes: string | null; tags: string[] };
  images: FarmImage[];
}
```

Change `Project` (lines 82-89) to add `coordinates`:

```typescript
export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  coordinates: string | null;
  created_at: string;
  images: ProjectImage[];
}
```

- [ ] **Step 2: Add the upload/delete hooks**

In `dashboard/client/src/api/hooks.ts`, add `FarmImage` to the type import (line 3-6):

```typescript
import type {
  Task, TaskInput, Subtask, Player, FarmSummary, FarmDetail, FarmHistorySample,
  LivePlayer, Performance, Project, ProjectImage, GalleryImage, FarmImage,
} from './types';
```

Add after `useUpdateFarmMetadata` (after line 132, before `useLivePlayers`):

```typescript
export function useUploadFarmImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ farmId, file, caption }: { farmId: string; file: File; caption?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      return apiFetch<FarmImage>(`/farms/${farmId}/images`, { method: 'POST', body: form });
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['farms'] });
      qc.invalidateQueries({ queryKey: ['farms', vars.farmId] });
    },
  });
}
export function useDeleteFarmImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/farm-images/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['farms'] }),
  });
}
```

- [ ] **Step 3: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0. (This will only pass once Task 2/3's server changes are also in place, since the shapes must match what the server actually returns — but `tsc` only checks the client's own type declarations here, so it passes based on the types just written, independent of the running server.)

- [ ] **Step 4: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts
git commit -m "dashboard: add client types/hooks for farm images and project coordinates"
```

---

### Task 5: Client — farm images card on GranjaDetail

**Files:**
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx`

**Interfaces:**
- Consumes: `useFarm()` returning `f.images: FarmImage[]` (Task 4), `useUploadFarmImage()`, `useDeleteFarmImage()` (Task 4).
- Produces: nothing consumed by later tasks — self-contained UI addition.

- [ ] **Step 1: Add the images card**

In `dashboard/client/src/pages/GranjaDetail.tsx`, add imports:

```typescript
import { useRef } from 'react';
```

(merge into the existing `import { useState } from 'react';` line to become `import { useRef, useState } from 'react';`), and add `useUploadFarmImage, useDeleteFarmImage` to the hooks import on line 3.

Add inside the component body, after `const updateMetadata = useUpdateFarmMetadata();` (line 10):

```typescript
  const uploadImage = useUploadFarmImage();
  const deleteImage = useDeleteFarmImage();
  const fileInput = useRef<HTMLInputElement>(null);
```

Add a new function after `saveMeta` (after line 32):

```typescript
  async function onFileChange() {
    const file = fileInput.current?.files?.[0];
    if (file) await uploadImage.mutateAsync({ farmId: f.id, file });
    if (fileInput.current) fileInput.current.value = '';
  }
```

Add a new `<Card>` after the "Historial (24h)" card, before the closing `</div>` of the component (after line 103):

```tsx
      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Imágenes</h2>
        <div className="grid grid-cols-4 gap-2">
          {f.images.map((img) => (
            <div key={img.id} className="relative">
              <img src={`/uploads/${img.path}`} alt={img.caption ?? ''} className="h-24 w-full rounded object-cover" />
              <button
                onClick={() => deleteImage.mutate(img.id)}
                className="absolute right-1 top-1 rounded bg-black/60 px-1 text-xs text-status-blocked"
                aria-label="Eliminar imagen"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <input ref={fileInput} type="file" accept="image/*" onChange={onFileChange} className="mt-3 text-sm" />
        {uploadImage.isError && <p className="mt-2 text-sm text-status-blocked">{uploadImage.error.message}</p>}
      </Card>
```

- [ ] **Step 2: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

Start the stack. Open a farm detail page, upload an image via the file input, confirm it appears in the grid immediately (react-query invalidation) and persists after a page reload. Click the ✕ on an image, confirm it's removed and the file no longer appears after reload.

- [ ] **Step 4: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "dashboard: add farm images card to GranjaDetail"
```

---

### Task 6: Client — 3D player skin viewer

**Files:**
- Modify: `dashboard/client/package.json` (new dependency)
- Create: `dashboard/client/src/pages/JugadorDetail.tsx`
- Modify: `dashboard/client/src/pages/Jugadores.tsx`
- Modify: `dashboard/client/src/App.tsx`

**Interfaces:**
- Consumes: `usePlayers()` (existing hook, `Player[]` with `minecraft_name`).
- Produces: route `/jugadores/:id`. Nothing consumed by later tasks.

- [ ] **Step 1: Install skinview3d**

Run: `cd dashboard/client && npm install skinview3d`
Expected: `package.json` and `package-lock.json` updated with the new dependency.

- [ ] **Step 2: Create the detail page**

Create `dashboard/client/src/pages/JugadorDetail.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SkinViewer } from 'skinview3d';
import { usePlayers } from '../api/hooks';
import Card from '../components/Card';

export default function JugadorDetail() {
  const { id } = useParams<{ id: string }>();
  const players = usePlayers();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);

  const player = players.data?.players.find((p) => p.id === Number(id));

  useEffect(() => {
    if (!player || !canvasRef.current) return;
    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width: 300,
      height: 400,
      skin: `https://minotar.net/skin/${player.minecraft_name}`,
    });
    viewer.controls.enableZoom = true;
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [player?.minecraft_name]);

  if (players.isLoading) return <p className="text-slate-400">Cargando…</p>;
  if (!player) return <p className="text-status-blocked">No se encontró el jugador.</p>;

  return (
    <div className="space-y-4">
      <Link to="/jugadores" className="text-sm text-cyan hover:underline">
        ← Jugadores
      </Link>
      <h1 className="font-mono text-2xl text-gold">{player.minecraft_name}</h1>
      <Card>
        <canvas ref={canvasRef} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Link player rows to the detail page**

In `dashboard/client/src/pages/Jugadores.tsx`, add the import:

```typescript
import { Link } from 'react-router-dom';
```

Change the name display (line 55-58) from:

```tsx
              <div className="flex items-center gap-2 font-medium">
                {p.minecraft_name}
                <StatusBadge status={liveNames.has(p.minecraft_name) ? 'online' : 'offline'} />
              </div>
```

to:

```tsx
              <div className="flex items-center gap-2 font-medium">
                <Link to={`/jugadores/${p.id}`} className="text-cyan hover:underline">
                  {p.minecraft_name}
                </Link>
                <StatusBadge status={liveNames.has(p.minecraft_name) ? 'online' : 'offline'} />
              </div>
```

- [ ] **Step 4: Register the route**

In `dashboard/client/src/App.tsx`, add the import after `import Jugadores from './pages/Jugadores';`:

```typescript
import JugadorDetail from './pages/JugadorDetail';
```

Add the route after `<Route path="/jugadores" element={<Jugadores />} />`:

```tsx
<Route path="/jugadores/:id" element={<JugadorDetail />} />
```

- [ ] **Step 5: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 6: Manual verification**

Start the stack. Click a player name in `/jugadores`, confirm navigation to `/jugadores/:id`, the 3D model renders with the correct skin, and mouse-drag rotates it. Navigate back to `/jugadores` and open a different player, confirm no leftover canvas/console errors from the previous viewer. Open browser DevTools console, confirm no WebGL context warnings after navigating between two different player detail pages in a row.

- [ ] **Step 7: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/package.json dashboard/client/package-lock.json dashboard/client/src/pages/JugadorDetail.tsx dashboard/client/src/pages/Jugadores.tsx dashboard/client/src/App.tsx
git commit -m "dashboard: add 3D player skin viewer detail page"
```

---

### Task 7: Client — project coordinates field

**Files:**
- Modify: `dashboard/client/src/pages/ProyectoDetail.tsx`

**Interfaces:**
- Consumes: `Project.coordinates` (Task 4), `useUpdateProject()` (existing hook).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add coordinates to the edit form and display**

In `dashboard/client/src/pages/ProyectoDetail.tsx`, add a `coordinates` state alongside `description` (line 16):

```typescript
  const [description, setDescription] = useState('');
  const [coordinates, setCoordinates] = useState('');
```

In `startEdit` (lines 20-23), also seed the new state:

```typescript
  function startEdit() {
    setDescription(project!.description ?? '');
    setCoordinates(project!.coordinates ?? '');
    setEditing(true);
  }
```

Change the save handler and edit form (lines 49-64):

```tsx
        {editing ? (
          <div className="space-y-2">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-border bg-base px-3 py-2" />
            <input
              value={coordinates}
              onChange={(e) => setCoordinates(e.target.value)}
              placeholder="Coordenadas (ej. 120, 80, -500)"
              className="w-full rounded border border-border bg-base px-3 py-2"
            />
            <button
              onClick={async () => {
                await updateProject.mutateAsync({ id: project.id, description, coordinates: coordinates || null });
                setEditing(false);
              }}
              className="rounded bg-gold px-3 py-1 text-sm text-base"
            >
              Guardar
            </button>
            {updateProject.isError && (
              <p className="text-sm text-status-blocked">{updateProject.error.message}</p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-300">{project.description || 'Sin descripción todavía.'}</p>
            {project.coordinates && <p className="mt-1 font-mono text-sm text-slate-400">{project.coordinates}</p>}
            <button onClick={startEdit} className="mt-2 text-sm text-cyan hover:underline">
              Editar descripción
            </button>
          </div>
        )}
```

- [ ] **Step 2: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

Open a project detail page, click "Editar descripción", enter coordinates, save. Confirm the coordinates line appears under the description after saving and persists after a page reload. Open a project created before this change (or any project with no coordinates set) and confirm no coordinates line renders (not even an empty one).

- [ ] **Step 4: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/ProyectoDetail.tsx
git commit -m "dashboard: add project coordinates field"
```

---

### Task 8: Client — task priority badge

**Files:**
- Create: `dashboard/client/src/components/PriorityBadge.tsx`
- Modify: `dashboard/client/src/pages/Tareas.tsx`

**Interfaces:**
- Consumes: `TaskPriority` type (existing, `'low' | 'med' | 'high'`).
- Produces: `PriorityBadge` component, `{ priority: TaskPriority }` props. Consumed only within this task.

- [ ] **Step 1: Create the badge component**

Create `dashboard/client/src/components/PriorityBadge.tsx`:

```tsx
import type { TaskPriority } from '../api/types';

const LABELS: Record<TaskPriority, string> = { low: 'Baja', med: 'Media', high: 'Alta' };
const COLORS: Record<TaskPriority, string> = {
  low: 'bg-status-done/20 text-status-done',
  med: 'bg-status-progress/20 text-status-progress',
  high: 'bg-status-blocked/20 text-status-blocked',
};

export default function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`rounded px-2 py-0.5 font-mono text-xs ${COLORS[priority]}`}>{LABELS[priority]}</span>;
}
```

- [ ] **Step 2: Use it in place of the plain-text priority label**

In `dashboard/client/src/pages/Tareas.tsx`, add the import after the `StatusBadge` import (line 9):

```typescript
import PriorityBadge from '../components/PriorityBadge';
```

Change line 98 from:

```tsx
                  <span>Prioridad: {PRIORITY_LABEL[t.priority]}</span>
```

to:

```tsx
                  <PriorityBadge priority={t.priority} />
```

- [ ] **Step 3: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

Visit `/tareas`, confirm each task shows a colored priority pill (green/low, amber/med, red/high) instead of plain text, matching `StatusBadge`'s visual style.

- [ ] **Step 5: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/components/PriorityBadge.tsx dashboard/client/src/pages/Tareas.tsx
git commit -m "dashboard: add colored priority badge to task list"
```

---

### Task 9: Client — task filters (assignee, priority, farm, project)

**Files:**
- Modify: `dashboard/client/src/pages/Tareas.tsx`

**Interfaces:**
- Consumes: `usePlayers()`, `useFarms()`, `useProjects()` (all existing hooks).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add filter state and hook calls**

In `dashboard/client/src/pages/Tareas.tsx`, add imports:

```typescript
import { useFarms, useProjects } from '../api/hooks';
```

(merge into the existing hooks import on lines 2-5). Add after `const players = usePlayers();` (line 17):

```typescript
  const farms = useFarms();
  const projects = useProjects();
```

Add after `const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');` (line 26):

```typescript
  const [assigneeFilter, setAssigneeFilter] = useState<number | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [farmFilter, setFarmFilter] = useState<string | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all');
```

- [ ] **Step 2: Extend the filter predicate**

Change `const visible = ...` (line 61) from:

```typescript
  const visible = (tasks.data?.tasks ?? []).filter((t) => statusFilter === 'all' || t.status === statusFilter);
```

to:

```typescript
  const visible = (tasks.data?.tasks ?? []).filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (assigneeFilter !== 'all' && !t.assignees.some((a) => a.id === assigneeFilter)) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (farmFilter !== 'all' && t.farm_id !== farmFilter) return false;
    if (projectFilter !== 'all' && t.project_id !== projectFilter) return false;
    return true;
  });
```

- [ ] **Step 3: Add the filter dropdowns**

In the JSX, after the existing status button row (`</div>` closing the filter buttons, after line 88), add:

```tsx
      <div className="flex flex-wrap gap-2">
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="rounded border border-border bg-base px-2 py-1 text-sm"
        >
          <option value="all">Todos los jugadores</option>
          {(players.data?.players ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.minecraft_name}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
          className="rounded border border-border bg-base px-2 py-1 text-sm"
        >
          <option value="all">Toda prioridad</option>
          {Object.entries(PRIORITY_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={farmFilter}
          onChange={(e) => setFarmFilter(e.target.value)}
          className="rounded border border-border bg-base px-2 py-1 text-sm"
        >
          <option value="all">Toda granja</option>
          {(farms.data?.farms ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="rounded border border-border bg-base px-2 py-1 text-sm"
        >
          <option value="all">Todo proyecto</option>
          {(projects.data?.projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
```

- [ ] **Step 4: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 5: Manual verification**

Visit `/tareas` with several tasks having different assignees/priorities/farm/project links. Select each filter dropdown individually, confirm the list narrows correctly. Combine multiple filters at once (e.g. a specific assignee + a specific priority), confirm only tasks matching all active filters remain visible. Reset each dropdown to its "Todos"/"Toda"/"Todo" option, confirm the list returns to the status-filtered set.

- [ ] **Step 6: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/Tareas.tsx
git commit -m "dashboard: add assignee, priority, farm, and project filters to task list"
```

---

### Task 10: Client — farm/project picker in task form + link badges in list

**Files:**
- Modify: `dashboard/client/src/pages/Tareas.tsx`

**Interfaces:**
- Consumes: `useFarms()`, `useProjects()` (already added to this file in Task 9), `TaskInput.farm_id`/`project_id` (existing fields, already accepted by the server per `dashboard/server/src/routes/tasks.ts` and `types.ts:40-41`).
- Produces: nothing consumed by later tasks — final task in this batch.

- [ ] **Step 1: Add farm/project to the form state**

Change the `form` state (line 28) from:

```typescript
  const [form, setForm] = useState({ title: '', description: '', priority: 'med' as TaskPriority, due_date: '', assignee_ids: [] as number[] });
```

to:

```typescript
  const [form, setForm] = useState({
    title: '', description: '', priority: 'med' as TaskPriority, due_date: '',
    assignee_ids: [] as number[], farm_id: '' as string, project_id: '' as string,
  });
```

Update `openCreate` (line 32) to reset the new fields:

```typescript
  function openCreate() {
    setEditing(null);
    setForm({ title: '', description: '', priority: 'med', due_date: '', assignee_ids: [], farm_id: '', project_id: '' });
    setModalOpen(true);
  }
```

Update `openEdit` (lines 36-46) to seed the new fields:

```typescript
  function openEdit(t: Task) {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description ?? '',
      priority: t.priority,
      due_date: t.due_date ?? '',
      assignee_ids: t.assignees.map((a) => a.id),
      farm_id: t.farm_id ?? '',
      project_id: t.project_id ? String(t.project_id) : '',
    });
    setModalOpen(true);
  }
```

Update `onSave` (lines 48-59) to include them in the payload:

```typescript
  async function onSave() {
    const payload = {
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assignee_ids: form.assignee_ids,
      farm_id: form.farm_id || null,
      project_id: form.project_id ? Number(form.project_id) : null,
    };
    if (editing) await updateTask.mutateAsync({ id: editing.id, ...payload });
    else await createTask.mutateAsync(payload);
    setModalOpen(false);
  }
```

- [ ] **Step 2: Add the pickers to the modal form**

In the modal JSX, after the priority/due-date `<div className="flex gap-2">` block (after line 193), add:

```tsx
          <div className="flex gap-2">
            <select
              value={form.farm_id}
              onChange={(e) => setForm({ ...form, farm_id: e.target.value })}
              className="flex-1 rounded border border-border bg-base px-3 py-2"
            >
              <option value="">Sin asignar (granja)</option>
              {(farms.data?.farms ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              className="flex-1 rounded border border-border bg-base px-3 py-2"
            >
              <option value="">Sin asignar (proyecto)</option>
              {(projects.data?.projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
```

- [ ] **Step 3: Add link badges to the task list card**

Add the import:

```typescript
import { Link } from 'react-router-dom';
```

In the task card JSX, after the existing `<div className="mt-1 flex gap-2 text-xs text-slate-400">...</div>` block (after line 101, still inside the same parent `<div>`), add:

```tsx
                <div className="mt-1 flex gap-2">
                  {t.farm_id && (
                    <Link
                      to={`/granjas/${t.farm_id}`}
                      className="rounded bg-panel px-2 py-0.5 text-xs text-cyan hover:underline"
                    >
                      {farms.data?.farms.find((f) => f.id === t.farm_id)?.name ?? t.farm_id}
                    </Link>
                  )}
                  {t.project_id && (
                    <Link
                      to={`/proyectos/${t.project_id}`}
                      className="rounded bg-panel px-2 py-0.5 text-xs text-cyan hover:underline"
                    >
                      {projects.data?.projects.find((p) => p.id === t.project_id)?.name ?? t.project_id}
                    </Link>
                  )}
                </div>
```

- [ ] **Step 4: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 5: Manual verification**

Create a new task, select a farm and a project in the form, save. Confirm both link badges appear on the task card, and clicking each navigates to the correct `/granjas/:id` or `/proyectos/:id` page. Edit an existing task with no farm/project set, confirm the pickers default to "Sin asignar", and confirm no link badges render for a task with neither set.

- [ ] **Step 6: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/Tareas.tsx
git commit -m "dashboard: add farm/project picker to task form and link badges to task list"
```
