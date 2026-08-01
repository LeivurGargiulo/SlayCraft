# Dashboard fixes batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six independent fixes to the client dashboard: Alta-only task list, manual-farm exemption from the "requiere revisión" flag, a stuck card hover glow, farm cover photos, deduplicated jugadores online/category listing, and a broken logout button.

**Architecture:** All changes are localized edits to existing files in `dashboard/server` (Fastify + better-sqlite3) and `dashboard/client` (React + TanStack Query + Tailwind + framer-motion). No new files, no new dependencies. Server changes follow the existing migration pattern in `db.ts` (idempotent `PRAGMA table_info` + `ALTER TABLE` checks) and the existing `node:test` + `app.inject()` test style in `server/test/`. Client has no test framework installed — client-only changes are verified by hand in the browser per project convention.

**Tech Stack:** Fastify, better-sqlite3, zod, React, TanStack Query, react-router-dom, framer-motion, Tailwind, `node:test`.

## Global Constraints

- Spanish UI copy throughout (matches existing pages) — no English strings added to user-facing text.
- Server test style: `node:test` + `assert/strict` + `app.inject()` via `server/test/helpers.ts` (`makeApp()`, `loginAndGetCookie()`) — see `server/test/farms.test.ts` for the established pattern.
- DB schema changes go in `server/src/schema.sql` (fresh-DB path) **and** `server/src/db.ts` `openDb()` (existing-DB migration path, via `PRAGMA table_info` check + `ALTER TABLE`) — both are required, matching how `coordinates`/`expected_rates`/`actividad` were added previously.
- No client test framework exists (`client/package.json` has no test script) — client-only UI changes are verified manually in a real browser, not claimed done from a type-check alone.
- Run `npm test` in `dashboard/server` after each server-touching task; run `npm run build` (`tsc && vite build`) in `dashboard/client` after each client-touching task to catch type errors.

---

### Task 1: Overview — only Alta priority tasks in "Tareas que necesitan atención"

**Files:**
- Modify: `dashboard/client/src/pages/Overview.tsx:17-19`

**Interfaces:**
- Consumes: `Task.status: TaskStatus`, `Task.priority: TaskPriority` (from `dashboard/client/src/api/types.ts:22-35`), `useTasks()` (from `dashboard/client/src/api/hooks.ts:28-34`) — unchanged.
- Produces: nothing new; `needsAttention: Task[]` remains the same shape consumed lower in the same file.

- [ ] **Step 1: Change the filter**

In `dashboard/client/src/pages/Overview.tsx`, replace:

```ts
  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = (tasks.data?.tasks ?? []).filter(
    (t) => t.status !== 'done' && (t.status === 'blocked' || t.priority === 'high' || (t.due_date && t.due_date < today))
  );
```

with:

```ts
  const needsAttention = (tasks.data?.tasks ?? []).filter(
    (t) => t.status !== 'done' && t.priority === 'high'
  );
```

Remove the now-unused `today` variable entirely (it was only used by this filter).

- [ ] **Step 2: Build**

Run: `cd dashboard/client && npm run build`
Expected: no TypeScript errors (confirms `today` isn't referenced elsewhere in the file).

- [ ] **Step 3: Manual verification**

Run `npm run dev` in `dashboard/client` (and the server, or point at the live stack), open `/`, confirm "Tareas que necesitan atención" only lists tasks with priority Alta and status not done. Create a blocked med-priority task and an overdue low-priority task via `/tareas` and confirm neither appears in the Overview list.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/pages/Overview.tsx
git commit -m "fix(dashboard): show only Alta priority tasks in needs-attention list"
```

---

### Task 2: Granjas manual toggle — server (schema, metadata route)

**Files:**
- Modify: `dashboard/server/src/schema.sql:64-69` (`farm_metadata` table)
- Modify: `dashboard/server/src/db.ts` (migration for existing DBs)
- Modify: `dashboard/server/src/routes/farms.ts:11-30,62-67,141-155` (`FarmMetadataRow`, `getMetadata`, `metadataSchema`, PATCH handler)
- Test: `dashboard/server/test/farms.test.ts`

**Interfaces:**
- Produces: `getMetadata(db, farmId)` return type gains `manual: boolean`. `PATCH /api/farms/:id/metadata` request body accepts optional `manual: boolean`. Response `metadata.manual` is `boolean`, defaulting to `false` when never set.
- Consumed by: Task 3 (client type + UI), Task 4 (Overview flaggedFarms filter).

- [ ] **Step 1: Write the failing test**

Append to `dashboard/server/test/farms.test.ts`:

```ts
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

  const row = db.prepare('SELECT manual FROM farm_metadata WHERE farm_id = ?').get('iron') as any;
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `metadata.manual` is `undefined`, not `true`/`false` (no `manual` column/field exists yet).

- [ ] **Step 3: Add the schema column (fresh-DB path)**

In `dashboard/server/src/schema.sql`, change:

```sql
CREATE TABLE IF NOT EXISTS farm_metadata (
  farm_id TEXT PRIMARY KEY,
  notes TEXT,
  tags TEXT,
  coordinates TEXT
);
```

to:

```sql
CREATE TABLE IF NOT EXISTS farm_metadata (
  farm_id TEXT PRIMARY KEY,
  notes TEXT,
  tags TEXT,
  coordinates TEXT,
  manual INTEGER NOT NULL DEFAULT 0
);
```

(Leave `expected_rates` out of this block — it's added via migration only, per the existing file; don't touch that line.)

- [ ] **Step 4: Add the migration (existing-DB path)**

In `dashboard/server/src/db.ts`, after the `expected_rates` migration block (line 22-24), add:

```ts
  if (!farmMetadataColumns.some((c) => c.name === 'manual')) {
    db.exec('ALTER TABLE farm_metadata ADD COLUMN manual INTEGER NOT NULL DEFAULT 0');
  }
```

- [ ] **Step 5: Update `getMetadata` and the row interface**

In `dashboard/server/src/routes/farms.ts`, change the `FarmMetadataRow` interface (lines 11-17):

```ts
interface FarmMetadataRow {
  farm_id: string;
  notes: string | null;
  tags: string | null;
  coordinates: string | null;
  expected_rates: string | null;
  manual: number;
}
```

and `getMetadata` (lines 19-28):

```ts
function getMetadata(db: Database.Database, farmId: string) {
  const row = db.prepare('SELECT notes, tags, coordinates, expected_rates, manual FROM farm_metadata WHERE farm_id = ?').get(farmId) as
    | FarmMetadataRow
    | undefined;
  return {
    notes: row?.notes ?? null,
    tags: row?.tags ? row.tags.split(',').filter(Boolean) : [],
    coordinates: row?.coordinates ?? null,
    expected_rates: row?.expected_rates ? JSON.parse(row.expected_rates) : {},
    manual: !!row?.manual,
  };
}
```

- [ ] **Step 6: Update `metadataSchema` and the PATCH handler**

Change `metadataSchema` (lines 62-67):

```ts
const metadataSchema = z.object({
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  coordinates: z.string().nullable().optional(),
  expected_rates: z.record(z.string(), z.number()).optional(),
  manual: z.boolean().optional(),
});
```

Change the PATCH handler (lines 141-155):

```ts
  app.patch('/api/farms/:id/metadata', async (req) => {
    const { id } = req.params as { id: string };
    const body = metadataSchema.parse(req.body);
    db.prepare(
      `INSERT INTO farm_metadata (farm_id, notes, tags, coordinates, expected_rates, manual) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, tags = excluded.tags, coordinates = excluded.coordinates, expected_rates = excluded.expected_rates, manual = excluded.manual`
    ).run(
      id,
      body.notes ?? null,
      body.tags ? body.tags.join(',') : null,
      body.coordinates ?? null,
      body.expected_rates ? JSON.stringify(body.expected_rates) : null,
      body.manual ? 1 : 0
    );
    return { ok: true, metadata: getMetadata(db, id) };
  });
```

Note this follows the existing full-replace-every-call convention (same as `notes`/`tags`/`coordinates`/`expected_rates`) — the client always sends the complete metadata object on save (see Task 3), so there's no partial-update/preserve-old-value concern.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd dashboard/server && npm test`
Expected: PASS, all tests including the two new ones and the existing `GET /api/farms merges MCFarmManager data with dashboard metadata` test (its `assert.deepEqual(body.farms[0].metadata, ...)` at line 19 must be updated — see next step).

- [ ] **Step 8: Fix the now-stale metadata shape assertion**

In `dashboard/server/test/farms.test.ts`, update the existing assertion (around line 19):

```ts
  assert.deepEqual(body.farms[0].metadata, { notes: 'necesita mas cofres', tags: ['prioridad', 'hierro'], coordinates: null, expected_rates: {}, manual: false });
```

Run: `cd dashboard/server && npm test`
Expected: PASS, full suite green.

- [ ] **Step 9: Commit**

```bash
git add dashboard/server/src/schema.sql dashboard/server/src/db.ts dashboard/server/src/routes/farms.ts dashboard/server/test/farms.test.ts
git commit -m "feat(dashboard): add manual/24-7 toggle to farm metadata"
```

---

### Task 3: Granjas manual toggle — client (type, GranjaDetail UI, Overview filter)

**Files:**
- Modify: `dashboard/client/src/api/types.ts:58` (`FarmSummary.metadata`)
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx` (`startEdit`, `saveMeta`, notes edit block)
- Modify: `dashboard/client/src/pages/Overview.tsx:21-24` (`flaggedFarms`)

**Interfaces:**
- Consumes: `getMetadata`/PATCH response shape from Task 2 (`metadata.manual: boolean`).
- Produces: nothing consumed further; this closes out items 2 and (partially, via `flaggedFarms`) the Overview section from item 1's spec area.

- [ ] **Step 1: Add `manual` to the `FarmSummary` metadata type**

In `dashboard/client/src/api/types.ts:58`, change:

```ts
  metadata: { notes: string | null; tags: string[]; coordinates: string | null; expected_rates: Record<string, number> };
```

to:

```ts
  metadata: { notes: string | null; tags: string[]; coordinates: string | null; expected_rates: Record<string, number>; manual: boolean };
```

- [ ] **Step 2: Add a `manual` state and wire it into `startEdit`/`saveMeta`**

In `dashboard/client/src/pages/GranjaDetail.tsx`, add a new state near the other metadata-edit state (after line 111 `const [editingMeta, setEditingMeta] = useState(false);`):

```ts
  const [manual, setManual] = useState(false);
```

In `startEdit()` (lines 121-127), add after `setCoordinates(...)`:

```ts
    setManual(f.metadata.manual);
```

In `saveMeta()` (lines 129-141), add `manual` to the mutation call:

```ts
  async function saveMeta() {
    const expected_rates = Object.fromEntries(
      expectedRates.filter((r) => r.itemId.trim() && r.rate.trim()).map((r) => [r.itemId.trim(), Number(r.rate)])
    );
    await updateMetadata.mutateAsync({
      id: f.id,
      notes: notes || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      coordinates: coordinates || null,
      expected_rates,
      manual,
    });
    setEditingMeta(false);
  }
```

- [ ] **Step 3: Extend `useUpdateFarmMetadata`'s mutation input type**

In `dashboard/client/src/api/hooks.ts`, in `useUpdateFarmMetadata` (lines 155-176), add `manual` to the mutationFn parameter type and payload:

```ts
export function useUpdateFarmMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      notes,
      tags,
      coordinates,
      expected_rates,
      manual,
    }: {
      id: string;
      notes?: string | null;
      tags?: string[];
      coordinates?: string | null;
      expected_rates?: Record<string, number>;
      manual?: boolean;
    }) => apiFetch(`/farms/${id}/metadata`, { method: 'PATCH', body: JSON.stringify({ notes, tags, coordinates, expected_rates, manual }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['farms'] });
      qc.invalidateQueries({ queryKey: ['farms', vars.id] });
    },
  });
}
```

- [ ] **Step 4: Add the checkbox to the notes edit block**

In `dashboard/client/src/pages/GranjaDetail.tsx`, `Checkbox` is already imported (line 17). In the `editingMeta` branch (inside the "Notas" `Card`, right after the `coordinates` input around line 227-228, before the "Tasas esperadas" block), add:

```tsx
              <Checkbox
                checked={manual}
                onChange={setManual}
                label="Granja manual (no 24/7) — no marcar como caída por falta de producción"
              />
```

- [ ] **Step 5: Update Overview's flaggedFarms filter**

In `dashboard/client/src/pages/Overview.tsx:21-24`, change:

```ts
  const flaggedFarms = (farms.data?.farms ?? []).filter(
    (f) => !f.online || (f.storageCapacity > 0 && f.storageItemCount > 0.9 * f.storageCapacity)
  );
```

to:

```ts
  const flaggedFarms = (farms.data?.farms ?? []).filter(
    (f) => (!f.metadata.manual && !f.online) || (f.storageCapacity > 0 && f.storageItemCount > 0.9 * f.storageCapacity)
  );
```

- [ ] **Step 6: Build**

Run: `cd dashboard/client && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Manual verification**

Start the dev stack, open a Granja detail page, click "Editar" on Notas, toggle "Granja manual", save, reload the page, confirm the toggle stays checked. With a farm that has zero recent production: toggle it manual and confirm it drops off Overview's "Granjas que requieren revisión"; toggle it back off and confirm it reappears. Separately, push a manual farm's storage above 90% capacity (or verify logically) and confirm it *still* flags despite being manual.

- [ ] **Step 8: Commit**

```bash
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts dashboard/client/src/pages/GranjaDetail.tsx dashboard/client/src/pages/Overview.tsx
git commit -m "feat(dashboard): manual farms skip the not-producing review flag"
```

---

### Task 4: Card hover glow stuck on

**Files:**
- Modify: `dashboard/client/src/pages/Granjas.tsx:58`
- Modify: `dashboard/client/src/pages/Proyectos.tsx:34`

**Interfaces:**
- Consumes: `components/Card.tsx`'s existing `whileHover={{ y: -2, borderColor: '#e8b339' }}` behavior — unchanged, becomes the sole hover mechanism.
- Produces: nothing new.

- [ ] **Step 1: Remove the competing Tailwind hover class in Granjas.tsx**

In `dashboard/client/src/pages/Granjas.tsx:58`, change:

```tsx
            <Card className="hover:border-gold">
```

to:

```tsx
            <Card>
```

- [ ] **Step 2: Remove the competing Tailwind hover class in Proyectos.tsx**

In `dashboard/client/src/pages/Proyectos.tsx:34`, change:

```tsx
            <Card className="hover:border-gold">
```

to:

```tsx
            <Card>
```

- [ ] **Step 3: Build**

Run: `cd dashboard/client && npm run build`
Expected: no TypeScript errors (both are simple prop removals).

- [ ] **Step 4: Manual verification**

Open `/granjas` and `/proyectos` in a real browser. Hover a card, move the mouse off it onto empty space (not onto another card) — confirm the gold border glow fades back out immediately, every time, including after rapid hover in/out and after clicking through to a detail page and back.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/pages/Granjas.tsx dashboard/client/src/pages/Proyectos.tsx
git commit -m "fix(dashboard): remove duplicate hover mechanism causing stuck card glow"
```

---

### Task 5: Granja profile photo on the Granjas list card

**Files:**
- Modify: `dashboard/client/src/pages/Granjas.tsx:56-77`

**Interfaces:**
- Consumes: `FarmSummary.images: FarmImage[]` (already returned by `GET /api/farms`, already typed in `api/types.ts:59` — no backend or type change needed).
- Produces: nothing new.

- [ ] **Step 1: Add the cover image, mirroring Proyectos.tsx**

In `dashboard/client/src/pages/Granjas.tsx`, inside the `farms.data!.farms.map((f) => (...))` block (lines 56-77), change:

```tsx
          <Link key={f.id} to={`/granjas/${f.id}`}>
            <Card>
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.name}</span>
                <StatusBadge status={f.online ? 'online' : 'offline'} />
              </div>
```

to:

```tsx
          <Link key={f.id} to={`/granjas/${f.id}`}>
            <Card>
              {f.images[0] ? (
                <img src={`/uploads/${f.images[0].path}`} alt={f.name} className="mb-2 h-32 w-full rounded object-cover" />
              ) : (
                <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-base text-slate-600">Sin imagen</div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.name}</span>
                <StatusBadge status={f.online ? 'online' : 'offline'} />
              </div>
```

(Everything below — the entity/storage line and tags — stays as-is, just now sits below the image block.)

- [ ] **Step 2: Build**

Run: `cd dashboard/client && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Manual verification**

Open a Granja detail page, upload an image via the existing "Imágenes" card (uses `FileUploadButton`, already wired to `useUploadFarmImage`). Go back to `/granjas`, confirm that farm's card now shows the uploaded image as a cover photo. Confirm farms with no images still show the "Sin imagen" placeholder, matching `/proyectos`' existing behavior exactly.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/pages/Granjas.tsx
git commit -m "feat(dashboard): show farm cover photo on Granjas list card"
```

---

### Task 6: Jugadores — no duplicate between "En línea" and actividad sections

**Files:**
- Modify: `dashboard/client/src/pages/Jugadores.tsx:29-30`

**Interfaces:**
- Consumes: `liveNames: Set<string>` and `allPlayers: Player[]`, already computed in the same file (lines 26-27) — unchanged.
- Produces: `byActividad(actividad)` now excludes live players; `items.length` used for the section count header (line 119) reflects the filtered count automatically since it's derived from the same call.

- [ ] **Step 1: Update the `byActividad` filter**

In `dashboard/client/src/pages/Jugadores.tsx:29-30`, change:

```ts
  const byActividad = (actividad: Actividad) =>
    allPlayers.filter((p) => p.actividad === actividad).sort((a, b) => a.minecraft_name.localeCompare(b.minecraft_name));
```

to:

```ts
  const byActividad = (actividad: Actividad) =>
    allPlayers
      .filter((p) => p.actividad === actividad && !liveNames.has(p.minecraft_name))
      .sort((a, b) => a.minecraft_name.localeCompare(b.minecraft_name));
```

- [ ] **Step 2: Build**

Run: `cd dashboard/client && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Manual verification**

Open `/jugadores` with at least one online player. Confirm that player appears once, under "En línea", and does not also appear under their Activo/Ocasional/Inactivo section. Confirm the category count next to each section header matches the number of cards actually rendered under it. Take the player offline (or pick an offline one) and confirm they show under their actividad section as before.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/pages/Jugadores.tsx
git commit -m "fix(dashboard): stop showing online players twice in jugadores list"
```

---

### Task 7: Logout button — fix `apiFetch` sending empty JSON body

**Files:**
- Modify: `dashboard/client/src/api/client.ts:9-15`
- Test: `dashboard/server/test/auth.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `apiFetch` no longer sets `Content-Type: application/json` on requests with no `body` — fixes `useLogout()` (and any other current or future bodyless POST/DELETE call) without touching call sites.

**Root cause (confirmed by reproduction):** `apiFetch` in `client.ts` unconditionally sets `Content-Type: application/json` on every non-FormData request, including `useLogout()`'s `apiFetch('/logout', { method: 'POST' })`, which has no `body`. Fastify's default JSON body parser throws `FST_ERR_CTP_EMPTY_JSON_BODY` ("Body cannot be empty when content-type is set to 'application/json'") when it sees that content-type header with an empty body. The app's global error handler in `app.ts` doesn't special-case this error code, so it falls through to a generic `500 { error: 'Error del servidor' }`. `useLogout()`'s mutation has no `onError` handler and Sidebar renders no error UI for it, so the failure is entirely silent — matching the reported symptom exactly. Reproduced directly via `app.inject({ method: 'POST', url: '/api/logout', headers: { cookie, 'content-type': 'application/json' } })` against a real (in-memory) app instance, which returned 500 with that exact error.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/auth.test.ts` (check the file's existing imports first — it should already import `makeApp`/`loginAndGetCookie` from `./helpers.js`, matching `farms.test.ts`'s pattern):

```ts
test('POST /api/logout succeeds with no content-type header and no body (matches what a bodyless client request looks like)', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({ method: 'POST', url: '/api/logout', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
});
```

- [ ] **Step 2: Run test to verify it currently passes (this documents the server is already correct without the header)**

Run: `cd dashboard/server && npm test`
Expected: PASS — this test isn't the one that catches the bug (the bug is client-side, in the header the browser sends); it documents the contract the client fix must produce. Confirm it passes before continuing.

- [ ] **Step 3: Fix `apiFetch` to omit `Content-Type` when there's no body**

In `dashboard/client/src/api/client.ts`, change:

```ts
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: isFormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
  });
```

to:

```ts
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const needsJsonHeader = !isFormData && options.body !== undefined;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: needsJsonHeader ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
```

- [ ] **Step 4: Build**

Run: `cd dashboard/client && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 5: Manual verification (this is the one that actually proves the fix — the server test in Step 1 only documents the contract)**

Start the dev stack, log in, open browser devtools Network tab, click "Cerrar sesión" in the sidebar. Confirm: the `POST /api/logout` request now returns `200 { ok: true }` (not 500), the app redirects to `/login`, and reloading any dashboard URL bounces back to `/login` until logging in again. Also spot-check one existing bodyless-ish call still works post-fix — e.g. delete a test player or task from `/jugadores` or `/tareas` and confirm the delete still succeeds (these already had the same latent header issue; this fix incidentally hardens them too, so confirm nothing regressed).

- [ ] **Step 6: Run full server test suite**

Run: `cd dashboard/server && npm test`
Expected: PASS, full suite green (no server files changed behavior, only a new test was added).

- [ ] **Step 7: Commit**

```bash
git add dashboard/client/src/api/client.ts dashboard/server/test/auth.test.ts
git commit -m "fix(dashboard): stop sending empty JSON content-type on bodyless requests, fixes logout"
```

---

## Self-Review Notes

- **Spec coverage:** all 6 spec items map to tasks — item 1→Task 1, item 2→Tasks 2+3, item 3→Task 4, item 4→Task 5, item 5→Task 6, item 6→Task 7.
- **Type consistency:** `manual: boolean` used identically across `getMetadata` return (Task 2), `FarmSummary.metadata` (Task 3 Step 1), `useUpdateFarmMetadata` mutation input (Task 3 Step 3), and the PATCH request/response body (Task 2) — verified matching.
- **No placeholders:** every step has literal code; Task 7's root cause was empirically reproduced (not guessed) via `app.inject()` before being written into the plan.
- **Task independence:** Tasks 1, 4, 5, 6, 7 touch disjoint files and can run in any order. Task 3 depends on Task 2 (needs the server's `manual` field to exist first) — execute Task 2 before Task 3.
