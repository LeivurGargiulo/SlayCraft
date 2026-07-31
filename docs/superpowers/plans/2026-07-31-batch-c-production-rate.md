# Batch C Production Rate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show per-item-type production rate (per minute/hour/day) and a normal/low/not-producing status indicator on the farm detail page, per `docs/superpowers/specs/2026-07-31-batch-c-production-rate-design.md`. Follows Batches A and B (planned separately, not yet executed); this plan is written against the current, unmodified codebase, same convention as Batch B's plan.

**Architecture:** Rate computation is entirely client-side arithmetic over the existing `GET /farms/:id/history` endpoint — no new mod sampling. The only backend change is a new dashboard-local `farm_metadata.expected_rates` JSON column (baseline data), read/written through the existing metadata PATCH route.

**Tech Stack:** Fastify, `better-sqlite3`, Zod (server, unchanged stack from Batch B). React 18, TypeScript, `@tanstack/react-query`, Tailwind CSS (client). Server tests: `node:test` + `node:assert/strict` via `npm test` in `dashboard/server`. Client: `tsc` type-check (`npm run build`) + manual verification, no client test framework.

## Global Constraints

- No MCFarmManager mod changes.
- Rate is per item-type, not one aggregate number per farm.
- Baseline (`expected_rates`) is a full per-item-type map, not a single primary-product number.
- Status thresholds: ≥90% of expected = normal (green, `status.done`), 10–90% = low (amber, `status.progress`), <10% or zero samples in the last hour = not producing (red, `status.blocked`). No baseline entry for an item = no color judgment.
- Comparison window for the status indicator is the most recent 1 hour of history samples.
- A negative count delta (chest emptied by a player) clamps to a rate of `0`, never a negative rate.

---

### Task 1: Schema — `farm_metadata.expected_rates` column

**Files:**
- Modify: `dashboard/server/src/schema.sql`
- Test: `dashboard/server/test/db.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: column `farm_metadata.expected_rates TEXT` (nullable). Task 2 depends on this existing.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/db.test.ts`:

```typescript
test('farm_metadata table has a nullable expected_rates column', () => {
  const db = openDb(':memory:');
  const columns = db.prepare('PRAGMA table_info(farm_metadata)').all().map((c: any) => c.name);
  assert.ok(columns.includes('expected_rates'), 'farm_metadata table missing expected_rates column');
  db.prepare("INSERT INTO farm_metadata (farm_id) VALUES ('test-farm')").run();
  const row = db.prepare("SELECT expected_rates FROM farm_metadata WHERE farm_id = 'test-farm'").get() as any;
  assert.equal(row.expected_rates, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `expected_rates` missing from `PRAGMA table_info(farm_metadata)`.

- [ ] **Step 3: Add the schema change**

In `dashboard/server/src/schema.sql`, add after the existing `farm_metadata` table definition:

```sql
ALTER TABLE farm_metadata ADD COLUMN IF NOT EXISTS expected_rates TEXT;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/server/src/schema.sql dashboard/server/test/db.test.ts
git commit -m "dashboard: add farm_metadata.expected_rates column"
```

---

### Task 2: Server — `expected_rates` in metadata GET/PATCH

**Files:**
- Modify: `dashboard/server/src/routes/farms.ts`
- Test: `dashboard/server/test/farms.test.ts`

**Interfaces:**
- Consumes: `farm_metadata.expected_rates` column (Task 1).
- Produces: `GET /api/farms` / `GET /api/farms/:id` responses' `metadata` field gains `expected_rates: Record<string, number>`; `PATCH /api/farms/:id/metadata` accepts an optional `expected_rates` field in its request body. Task 3 (client types/hooks) depends on this shape.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/farms.test.ts`:

```typescript
test('PATCH /api/farms/:id/metadata round-trips expected_rates', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { expected_rates: { iron_ingot: 120, gold_nugget: 40 } },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().metadata.expected_rates, { iron_ingot: 120, gold_nugget: 40 });

  const row = db.prepare('SELECT expected_rates FROM farm_metadata WHERE farm_id = ?').get('iron') as any;
  assert.deepEqual(JSON.parse(row.expected_rates), { iron_ingot: 120, gold_nugget: 40 });
});

test('metadata expected_rates defaults to an empty object when unset', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { notes: 'sin tasas todavia' },
  });
  assert.deepEqual(res.json().metadata.expected_rates, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `metadata.expected_rates` is `undefined`, not the expected object.

- [ ] **Step 3: Implement the changes**

In `dashboard/server/src/routes/farms.ts`, change the `FarmMetadataRow` interface:

```typescript
interface FarmMetadataRow {
  farm_id: string;
  notes: string | null;
  tags: string | null;
  expected_rates: string | null;
}
```

Change `getMetadata`:

```typescript
function getMetadata(db: Database.Database, farmId: string) {
  const row = db.prepare('SELECT notes, tags, expected_rates FROM farm_metadata WHERE farm_id = ?').get(farmId) as
    | FarmMetadataRow
    | undefined;
  return {
    notes: row?.notes ?? null,
    tags: row?.tags ? row.tags.split(',').filter(Boolean) : [],
    expected_rates: row?.expected_rates ? JSON.parse(row.expected_rates) : {},
  };
}
```

Change `metadataSchema`:

```typescript
const metadataSchema = z.object({
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  expected_rates: z.record(z.string(), z.number()).optional(),
});
```

Change the `PATCH /api/farms/:id/metadata` handler:

```typescript
  app.patch('/api/farms/:id/metadata', async (req) => {
    const { id } = req.params as { id: string };
    const body = metadataSchema.parse(req.body);
    const existing = getMetadata(db, id);
    db.prepare(
      `INSERT INTO farm_metadata (farm_id, notes, tags, expected_rates) VALUES (?, ?, ?, ?)
       ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, tags = excluded.tags, expected_rates = excluded.expected_rates`
    ).run(
      id,
      body.notes ?? existing.notes,
      body.tags ? body.tags.join(',') : existing.tags.join(',') || null,
      JSON.stringify(body.expected_rates ?? existing.expected_rates)
    );
    return { ok: true, metadata: getMetadata(db, id) };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS, all tests including the two new ones. Also re-run the existing `'PATCH /api/farms/:id/metadata upserts notes and tags'` test from the original suite to confirm no regression (it's in the same file, runs automatically with `npm test`).

- [ ] **Step 5: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/server/src/routes/farms.ts dashboard/server/test/farms.test.ts
git commit -m "dashboard: support expected_rates in farm metadata API"
```

---

### Task 3: Client — types and hook for `expected_rates`

**Files:**
- Modify: `dashboard/client/src/api/types.ts`
- Modify: `dashboard/client/src/api/hooks.ts`

**Interfaces:**
- Consumes: API shape from Task 2.
- Produces: `FarmSummary.metadata.expected_rates: Record<string, number>`; `useUpdateFarmMetadata` mutation accepts `expected_rates`. Tasks 4 and 5 depend on these.

- [ ] **Step 1: Extend the metadata type**

In `dashboard/client/src/api/types.ts`, change `FarmSummary` (the `metadata` field) — find:

```typescript
  metadata: { notes: string | null; tags: string[] };
```

change to:

```typescript
  metadata: { notes: string | null; tags: string[]; expected_rates: Record<string, number> };
```

(This is a single line inside the existing `FarmSummary` interface, inherited by `FarmDetail extends FarmSummary` automatically — no separate change needed there.)

- [ ] **Step 2: Extend the mutation**

In `dashboard/client/src/api/hooks.ts`, change `useUpdateFarmMetadata`:

```typescript
export function useUpdateFarmMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes, tags, expected_rates }: { id: string; notes?: string | null; tags?: string[]; expected_rates?: Record<string, number> }) =>
      apiFetch(`/farms/${id}/metadata`, { method: 'PATCH', body: JSON.stringify({ notes, tags, expected_rates }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['farms'] });
      qc.invalidateQueries({ queryKey: ['farms', vars.id] });
    },
  });
}
```

- [ ] **Step 3: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts
git commit -m "dashboard: add client types/hook for expected_rates"
```

---

### Task 4: Client — expected-rate map editor on GranjaDetail

**Files:**
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx`

**Interfaces:**
- Consumes: `f.metadata.expected_rates` (Task 3), `useUpdateFarmMetadata()` (Task 3, existing hook now accepting `expected_rates`).
- Produces: nothing consumed by later tasks other than the data now being editable (Task 5 reads `f.metadata.expected_rates` for status judgment, independent of this task's UI).

- [ ] **Step 1: Add expected-rates editing state**

In `dashboard/client/src/pages/GranjaDetail.tsx`, add state after `const [tags, setTags] = useState('');` (line 12):

```typescript
  const [expectedRates, setExpectedRates] = useState<Array<{ itemId: string; rate: string }>>([]);
```

Update `startEdit` (lines 19-23) to seed it:

```typescript
  function startEdit() {
    setNotes(f.metadata.notes ?? '');
    setTags(f.metadata.tags.join(', '));
    setExpectedRates(Object.entries(f.metadata.expected_rates).map(([itemId, rate]) => ({ itemId, rate: String(rate) })));
    setEditingMeta(true);
  }
```

Update `saveMeta` (lines 25-32) to include it in the payload:

```typescript
  async function saveMeta() {
    const expected_rates = Object.fromEntries(
      expectedRates.filter((r) => r.itemId.trim() && r.rate.trim()).map((r) => [r.itemId.trim(), Number(r.rate)])
    );
    await updateMetadata.mutateAsync({
      id: f.id,
      notes: notes || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      expected_rates,
    });
    setEditingMeta(false);
  }
```

- [ ] **Step 2: Add the row editor UI**

In the edit-mode branch of the "Notas" card (inside the `{editingMeta ? (...) : (...)}` block, after the `<input>` for tags, before the "Guardar" button), add:

```tsx
              <div className="space-y-1">
                <div className="text-xs text-slate-400">Tasas esperadas (ítem por hora)</div>
                {expectedRates.map((row, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={row.itemId}
                      onChange={(e) => {
                        const next = [...expectedRates];
                        next[i] = { ...next[i], itemId: e.target.value };
                        setExpectedRates(next);
                      }}
                      placeholder="ej. iron_ingot"
                      className="flex-1 rounded border border-border bg-base px-2 py-1 text-sm"
                    />
                    <input
                      value={row.rate}
                      onChange={(e) => {
                        const next = [...expectedRates];
                        next[i] = { ...next[i], rate: e.target.value };
                        setExpectedRates(next);
                      }}
                      type="number"
                      placeholder="por hora"
                      className="w-24 rounded border border-border bg-base px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => setExpectedRates(expectedRates.filter((_, j) => j !== i))}
                      className="text-sm text-status-blocked"
                      aria-label="Eliminar fila"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setExpectedRates([...expectedRates, { itemId: '', rate: '' }])}
                  className="text-sm text-cyan hover:underline"
                >
                  + Agregar ítem
                </button>
              </div>
```

- [ ] **Step 3: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

Open a farm detail page, click "Editar", add two item-rate rows (e.g. `iron_ingot` / `120`), save. Reload the page, click "Editar" again, confirm the two rows are pre-populated with the saved values. Remove a row, save, confirm it's gone on reload.

- [ ] **Step 5: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "dashboard: add expected-rate editor to farm metadata"
```

---

### Task 5: Client — Producción card (rate + status indicator)

**Files:**
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx`

**Interfaces:**
- Consumes: `useFarmHistory(id, '1h')` (existing hook, new call with a `'1h'` range alongside the existing `'24h'` call already on this page), `f.metadata.expected_rates` (Task 3).
- Produces: nothing consumed by later tasks — final task in this batch.

- [ ] **Step 1: Add the 1-hour history query and rate computation**

In `dashboard/client/src/pages/GranjaDetail.tsx`, add after the existing `const history = useFarmHistory(id!, '24h');` (line 9):

```typescript
  const rateHistory = useFarmHistory(id!, '1h');
```

Add a helper function above the component (after the imports, before `export default function GranjaDetail()`):

```typescript
function computeRates(samples: { sampledAt: string; storageCounts: Record<string, number> }[]) {
  if (samples.length < 2) return {};
  const first = samples[0];
  const last = samples[samples.length - 1];
  const elapsedMinutes = (new Date(last.sampledAt).getTime() - new Date(first.sampledAt).getTime()) / 60_000;
  if (elapsedMinutes <= 0) return {};
  const itemIds = new Set([...Object.keys(first.storageCounts), ...Object.keys(last.storageCounts)]);
  const rates: Record<string, number> = {};
  for (const itemId of itemIds) {
    const delta = (last.storageCounts[itemId] ?? 0) - (first.storageCounts[itemId] ?? 0);
    rates[itemId] = Math.max(0, delta) / elapsedMinutes;
  }
  return rates;
}

function rateStatus(actualPerHour: number, expectedPerHour: number | undefined): 'normal' | 'low' | 'none' | null {
  if (expectedPerHour === undefined) return null;
  const ratio = expectedPerHour > 0 ? actualPerHour / expectedPerHour : 0;
  if (ratio >= 0.9) return 'normal';
  if (ratio >= 0.1) return 'low';
  return 'none';
}
```

- [ ] **Step 2: Add the Producción card**

Add a new `<Card>` after the "Almacenamiento" card, before the "Historial (24h)" card:

```tsx
      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Producción</h2>
        {rateHistory.data && rateHistory.data.samples.length >= 2 ? (
          <div className="space-y-2">
            {Object.entries(computeRates(rateHistory.data.samples)).map(([itemId, perMinute]) => {
              const status = rateStatus(perMinute * 60, f.metadata.expected_rates[itemId]);
              const statusLabel = status === 'normal' ? 'Normal' : status === 'low' ? 'Baja' : status === 'none' ? 'Sin producción' : null;
              const statusColor =
                status === 'normal' ? 'text-status-done' : status === 'low' ? 'text-status-progress' : status === 'none' ? 'text-status-blocked' : 'text-slate-500';
              return (
                <div key={itemId} className="flex items-center justify-between text-sm">
                  <span>{itemId.replace(/^minecraft:/, '')}</span>
                  <span className="flex items-center gap-2 font-mono text-slate-400">
                    {(perMinute * 60).toFixed(1)}/h · {(perMinute * 1440).toFixed(0)}/día
                    {statusLabel && <span className={statusColor}>{statusLabel}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Datos insuficientes.</p>
        )}
      </Card>
```

- [ ] **Step 3: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

Open a farm detail page for a farm accumulating items with at least two history samples in the last hour (wait for the mod's sample interval to produce a second sample, or lower `mcfarmmanagerSampleIntervalMinutes` temporarily for faster testing). Confirm the rate numbers (per hour, per day) are arithmetically consistent with the actual count change observed manually in-game. Set an expected rate below the actual rate via Task 4's editor, confirm the status shows "Normal" (green); set it much higher, confirm it shows "Baja" or "Sin producción" (amber/red) accordingly; confirm an item with no expected-rate entry shows a rate with no status label.

- [ ] **Step 5: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "dashboard: add production rate and status indicator card"
```
