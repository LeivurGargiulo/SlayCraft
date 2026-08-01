# Jugadores Categories + minecoop Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add activo/ocasional/inactivo categorization to Jugadores (with a live online section), and one-time-migrate minecoop's real players/proyectos/granjas/tareas data into the dashboard.

**Architecture:** A `players.actividad` column drives three sections in `Jugadores.tsx`, plus a live "online" section from the existing `useLivePlayers()` hook. A standalone Node script (`server/src/scripts/import-minecoop.ts`), run once by hand, inserts the real minecoop data directly into the dashboard's SQLite DB (players, projects) and — for granjas — registers real Farms through the same MCFarmManager proxy the dashboard API already uses, since farm_metadata-only rows never render.

**Tech Stack:** Fastify + better-sqlite3 + zod (server), React + TanStack Query + Tailwind (client), `node --test` (server tests).

## Global Constraints
- `actividad` values: exactly `'activo' | 'ocasional' | 'inactivo'`, default `'ocasional'`.
- New DB columns follow the existing pattern in this repo: add to `schema.sql`'s `CREATE TABLE` for fresh installs, **and** add a defensive `ALTER TABLE` in `db.ts` for already-deployed databases (see the existing `projects.coordinates` / `farm_metadata.expected_rates` handling).
- Task priority mapping: 0–1 → `low`, 2–3 → `med`, 4–5 → `high`. Status mapping: `pendiente` → `todo`, `en-progreso` → `in_progress`.
- A tarea's `project_id` wins over `farm_id` when both a proyecto and a granja link exist — never set both.
- All dashboard server code/comments/user-facing strings are in Spanish, matching the existing codebase.

---

### Task 1: `players.actividad` column

**Files:**
- Modify: `dashboard/server/src/schema.sql`
- Modify: `dashboard/server/src/db.ts`
- Test: `dashboard/server/test/db.test.ts`

**Interfaces:**
- Produces: `players.actividad TEXT NOT NULL DEFAULT 'ocasional' CHECK (actividad IN ('activo','ocasional','inactivo'))`, present on both fresh and pre-existing databases after `openDb()` runs.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/db.test.ts`:

```ts
test('players table has an actividad column defaulting to ocasional', () => {
  const db = openDb(':memory:');
  const columns = db.prepare('PRAGMA table_info(players)').all().map((c: any) => c.name);
  assert.ok(columns.includes('actividad'), 'players table missing actividad column');
  db.prepare("INSERT INTO players (minecraft_name) VALUES ('sinactividad')").run();
  const row = db.prepare("SELECT actividad FROM players WHERE minecraft_name = 'sinactividad'").get() as any;
  assert.equal(row.actividad, 'ocasional');
});

test('rejects an invalid players.actividad via CHECK constraint', () => {
  const db = openDb(':memory:');
  assert.throws(() => {
    db.prepare("INSERT INTO players (minecraft_name, actividad) VALUES ('x', 'nope')").run();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `players table missing actividad column`

- [ ] **Step 3: Add the column**

In `dashboard/server/src/schema.sql`, change the `players` table to:

```sql
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  minecraft_name TEXT NOT NULL UNIQUE,
  note TEXT,
  actividad TEXT NOT NULL DEFAULT 'ocasional' CHECK (actividad IN ('activo','ocasional','inactivo')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

In `dashboard/server/src/db.ts`, add a defensive migration for existing databases right after the `farmMetadataColumns` block, before `return db;`:

```ts
  const playerColumns = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
  if (!playerColumns.some((c) => c.name === 'actividad')) {
    db.exec("ALTER TABLE players ADD COLUMN actividad TEXT NOT NULL DEFAULT 'ocasional' CHECK (actividad IN ('activo','ocasional','inactivo'))");
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/schema.sql dashboard/server/src/db.ts dashboard/server/test/db.test.ts
git commit -m "feat(dashboard): add players.actividad column"
```

---

### Task 2: Server API — actividad on players routes

**Files:**
- Modify: `dashboard/server/src/routes/players.ts`
- Test: `dashboard/server/test/players.test.ts`

**Interfaces:**
- Consumes: `players.actividad` column from Task 1.
- Produces: `POST /api/players` and `PATCH /api/players/:id` accept/return `actividad: 'activo' | 'ocasional' | 'inactivo'`; `GET /api/players` rows include it (via `SELECT *`, no change needed there).

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/players.test.ts` (inside a new `test(...)` block, after the existing `player CRUD` test):

```ts
test('player actividad defaults to ocasional and can be updated', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const create = await app.inject({
    method: 'POST',
    url: '/api/players',
    headers: { cookie },
    payload: { minecraft_name: 'lei' },
  });
  assert.equal(create.json().actividad, 'ocasional');

  const update = await app.inject({
    method: 'PATCH',
    url: `/api/players/${create.json().id}`,
    headers: { cookie },
    payload: { actividad: 'activo' },
  });
  assert.equal(update.json().actividad, 'activo');

  const rejected = await app.inject({
    method: 'POST',
    url: '/api/players',
    headers: { cookie },
    payload: { minecraft_name: 'invalido', actividad: 'nope' },
  });
  assert.equal(rejected.statusCode, 400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `create.json().actividad` is `undefined`, not `'ocasional'`

- [ ] **Step 3: Update the route**

In `dashboard/server/src/routes/players.ts`, replace the whole file:

```ts
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const ACTIVIDADES = ['activo', 'ocasional', 'inactivo'] as const;

const playerInput = z.object({
  minecraft_name: z.string().min(1),
  note: z.string().nullable().optional(),
  actividad: z.enum(ACTIVIDADES).default('ocasional'),
});

export function registerPlayerRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/players', async () => ({
    players: db.prepare('SELECT * FROM players ORDER BY minecraft_name').all(),
  }));

  app.post('/api/players', async (req, reply) => {
    const body = playerInput.parse(req.body);
    const info = db
      .prepare('INSERT INTO players (minecraft_name, note, actividad) VALUES (?, ?, ?)')
      .run(body.minecraft_name, body.note ?? null, body.actividad);
    reply.code(201);
    return db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
  });

  app.patch('/api/players/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as
      | { id: number; minecraft_name: string; note: string | null; actividad: string }
      | undefined;
    if (!existing) return reply.code(404).send({ error: 'Jugador no encontrado' });
    const body = playerInput.partial().parse(req.body);
    db.prepare('UPDATE players SET minecraft_name=@minecraft_name, note=@note, actividad=@actividad WHERE id=@id').run({
      id,
      minecraft_name: body.minecraft_name ?? existing.minecraft_name,
      note: body.note !== undefined ? body.note : existing.note,
      actividad: body.actividad ?? existing.actividad,
    });
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  });

  app.delete('/api/players/:id', async (req, reply) => {
    db.prepare('DELETE FROM players WHERE id = ?').run(Number((req.params as { id: string }).id));
    reply.code(204);
    return null;
  });
}
```

Note: `playerInput.partial().parse(req.body)` on PATCH means an *omitted* `actividad` is fine (falls through to `existing.actividad`), but an *invalid* `actividad` value (e.g. `'nope'`) still fails `z.enum` validation — zod's `.partial()` only makes fields optional, it doesn't relax the enum check when the field is present. `POST` with an invalid value is rejected by the required-but-invalid enum the same way, returning Fastify's default 400 for a thrown `ZodError`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/players.ts dashboard/server/test/players.test.ts
git commit -m "feat(dashboard): accept and return actividad on player routes"
```

---

### Task 3: Client types + hooks — actividad

**Files:**
- Modify: `dashboard/client/src/api/types.ts`
- Modify: `dashboard/client/src/api/hooks.ts`

**Interfaces:**
- Consumes: `actividad` field from Task 2's API responses.
- Produces: `Player.actividad: 'activo' | 'ocasional' | 'inactivo'`; `useCreatePlayer`/`useUpdatePlayer` mutation inputs accept `actividad`.

- [ ] **Step 1: Update the `Player` type**

In `dashboard/client/src/api/types.ts`, change:

```ts
export type Actividad = 'activo' | 'ocasional' | 'inactivo';

export interface Player {
  id: number;
  minecraft_name: string;
  note: string | null;
  actividad: Actividad;
  created_at: string;
}
```

- [ ] **Step 2: Update the mutation input types**

In `dashboard/client/src/api/hooks.ts`, update the players section:

```ts
export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { minecraft_name: string; note?: string | null; actividad?: Actividad }) =>
      apiFetch<Player>('/players', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}
export function useUpdatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; minecraft_name?: string; note?: string | null; actividad?: Actividad }) =>
      apiFetch<Player>(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}
```

Add `Actividad` to the existing type-only import at the top of the file:

```ts
import type {
  Task, TaskInput, Subtask, Player, FarmSummary, FarmDetail, FarmHistorySample,
  LivePlayer, Performance, Project, ProjectImage, GalleryImage, FarmImage, FarmConfig, Actividad,
} from './types';
```

- [ ] **Step 3: Typecheck**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts
git commit -m "feat(dashboard): add Actividad type to client players API"
```

---

### Task 4: Jugadores.tsx — online section + three categories

**Files:**
- Modify: `dashboard/client/src/pages/Jugadores.tsx`

**Interfaces:**
- Consumes: `Player.actividad` (Task 3), `Select` component (`dashboard/client/src/components/Select.tsx`, props `{ value, onChange, options: {value,label}[], className? }`), `useLivePlayers()` (returns `{ players: LivePlayer[] }`, `LivePlayer.name`).
- Produces: no new exports — this is a leaf page component.

- [ ] **Step 1: Replace the file**

Replace `dashboard/client/src/pages/Jugadores.tsx` in full:

```tsx
import { useState } from 'react';
import { usePlayers, useCreatePlayer, useUpdatePlayer, useDeletePlayer, useLivePlayers } from '../api/hooks';
import type { Actividad, Player } from '../api/types';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import PlayerSkin from '../components/PlayerSkin';
import Select from '../components/Select';

const ACTIVIDAD_ORDER: Actividad[] = ['activo', 'ocasional', 'inactivo'];
const ACTIVIDAD_LABELS: Record<Actividad, string> = {
  activo: 'Activo',
  ocasional: 'Ocasional',
  inactivo: 'Inactivo',
};
const ACTIVIDAD_OPTIONS = ACTIVIDAD_ORDER.map((value) => ({ value, label: ACTIVIDAD_LABELS[value] }));

export default function Jugadores() {
  const players = usePlayers();
  const live = useLivePlayers();
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const liveNames = new Set((live.data?.players ?? []).map((p) => p.name));
  const allPlayers = players.data?.players ?? [];
  const onlinePlayers = allPlayers.filter((p) => liveNames.has(p.minecraft_name));
  const byActividad = (actividad: Actividad) =>
    allPlayers.filter((p) => p.actividad === actividad).sort((a, b) => a.minecraft_name.localeCompare(b.minecraft_name));

  async function onCreate() {
    if (!name.trim()) return;
    await createPlayer.mutateAsync({ minecraft_name: name.trim(), note: note || null });
    setName('');
    setNote('');
  }

  function renderPlayer(p: Player) {
    return (
      <Card key={p.id} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PlayerSkin name={p.minecraft_name} />
          <div>
            <div className="flex items-center gap-2 font-medium">
              {p.minecraft_name}
              <StatusBadge status={liveNames.has(p.minecraft_name) ? 'online' : 'offline'} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Select
                value={p.actividad}
                onChange={(actividad) => updatePlayer.mutate({ id: p.id, actividad })}
                options={ACTIVIDAD_OPTIONS}
                className="w-32"
              />
              <input
                defaultValue={p.note ?? ''}
                onBlur={(e) => updatePlayer.mutate({ id: p.id, note: e.target.value || null })}
                placeholder="Nota"
                className="rounded border border-border bg-base px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            if (confirm('¿Eliminar este jugador?')) deletePlayer.mutate(p.id);
          }}
          className="text-sm text-status-blocked hover:underline"
        >
          Eliminar
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-2xl text-gold">Jugadores</h1>

      <Card>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de Minecraft"
            className="rounded border border-border bg-base px-3 py-2"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota (opcional)"
            className="flex-1 rounded border border-border bg-base px-3 py-2"
          />
          <button onClick={onCreate} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
            Agregar
          </button>
        </div>
        {createPlayer.isError && (
          <p className="mt-2 text-sm text-status-blocked">{createPlayer.error.message}</p>
        )}
      </Card>

      {onlinePlayers.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-mono text-lg text-slate-300">
            En línea <span className="text-sm font-normal text-slate-500">({onlinePlayers.length})</span>
          </h2>
          {onlinePlayers.map(renderPlayer)}
        </section>
      )}

      {ACTIVIDAD_ORDER.map((actividad) => {
        const items = byActividad(actividad);
        if (items.length === 0) return null;
        return (
          <section key={actividad} className="space-y-2">
            <h2 className="font-mono text-lg text-slate-300">
              {ACTIVIDAD_LABELS[actividad]} <span className="text-sm font-normal text-slate-500">({items.length})</span>
            </h2>
            {items.map(renderPlayer)}
          </section>
        );
      })}

      {allPlayers.length === 0 && <p className="text-sm text-slate-500">No hay jugadores registrados.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Manual smoke test**

Run: `cd dashboard/client && npm run dev` (and the server, per `dashboard/README.md`), open `/jugadores` in a browser, confirm:
- Online section only appears when someone is connected, listing only connected+registered players.
- Activo/Ocasional/Inactivo sections appear (hidden when empty), each with a working actividad `Select` that persists on change (refetch or reload to confirm).

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/pages/Jugadores.tsx
git commit -m "feat(dashboard): categorize Jugadores by actividad with an online section"
```

---

### Task 5: minecoop data fixtures

**Files:**
- Create: `dashboard/server/src/scripts/minecoop-data/jugadores.json`
- Create: `dashboard/server/src/scripts/minecoop-data/proyectos.json`
- Create: `dashboard/server/src/scripts/minecoop-data/granjas.json`
- Create: `dashboard/server/src/scripts/minecoop-data/tareas.json`

**Interfaces:**
- Produces: the four JSON fixtures Task 6–8's import script reads. Shapes:
  - `jugadores.json`: `Array<{ username: string; actividad: 'activo'|'ocasional'|'inactivo' }>`
  - `proyectos.json` / `granjas.json`: `Array<{ id: string; title: string; coordinates: string[] }>`
  - `tareas.json`: `Array<{ id: string; title: string; status: 'pendiente'|'en-progreso'; assignee?: string[]; priority: number; notes?: string; granjas?: string[]; proyectos?: string[]; subtareas?: Array<{ title: string; done: boolean; assignee?: string[] }> }>`

- [ ] **Step 1: Copy the exported data into the repo**

The real data was already pulled from minecoop's live Netlify Blobs store this session via `netlify blobs:get <store> <store>` (run from `_archive/minecoop`, which is linked to the `slayerl99` Netlify project). Copy the four exports into the new fixtures directory:

```bash
mkdir -p dashboard/server/src/scripts/minecoop-data
cp /tmp/claude-1000/-home-leivur-minecraft/299bd3d2-8e49-4e0a-8672-6056a6816131/scratchpad/minecoop-export/jugadores.json dashboard/server/src/scripts/minecoop-data/jugadores.json
cp /tmp/claude-1000/-home-leivur-minecraft/299bd3d2-8e49-4e0a-8672-6056a6816131/scratchpad/minecoop-export/proyectos.json dashboard/server/src/scripts/minecoop-data/proyectos.json
cp /tmp/claude-1000/-home-leivur-minecraft/299bd3d2-8e49-4e0a-8672-6056a6816131/scratchpad/minecoop-export/granjas.json dashboard/server/src/scripts/minecoop-data/granjas.json
cp /tmp/claude-1000/-home-leivur-minecraft/299bd3d2-8e49-4e0a-8672-6056a6816131/scratchpad/minecoop-export/tareas.json dashboard/server/src/scripts/minecoop-data/tareas.json
```

If the scratchpad files no longer exist (a new session), re-pull them instead, from `_archive/minecoop`:

```bash
cd _archive/minecoop
for s in granjas proyectos tareas jugadores; do
  npx netlify blobs:get "$s" "$s" --output "../../dashboard/server/src/scripts/minecoop-data/$s.json"
done
```

- [ ] **Step 2: Verify they're valid JSON and non-empty**

Run: `node -e "for (const f of ['jugadores','proyectos','granjas','tareas']) { const d = require('./dashboard/server/src/scripts/minecoop-data/'+f+'.json'); console.log(f, d.length); }"`
Expected: `jugadores 15`, `proyectos 13`, `granjas 33`, `tareas 29`

- [ ] **Step 3: Commit**

```bash
git add dashboard/server/src/scripts/minecoop-data
git commit -m "chore(dashboard): add minecoop data export fixtures for one-time import"
```

---

### Task 6: Import script — players + proyectos

**Files:**
- Create: `dashboard/server/src/scripts/import-minecoop.ts`
- Test: `dashboard/server/test/import-minecoop.test.ts`

**Interfaces:**
- Consumes: `openDb` (`dashboard/server/src/db.ts`), fixtures from Task 5.
- Produces: `importJugadores(db: Database.Database, jugadores: MinecoopJugador[]): void` and `importProyectos(db: Database.Database, proyectos: MinecoopProyectoOrGranja[]): Map<string, number>` (maps minecoop slug → dashboard `projects.id`), both exported for the test and for later tasks in this same file.

- [ ] **Step 1: Write the failing test**

Create `dashboard/server/test/import-minecoop.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { importJugadores, importProyectos } from '../src/scripts/import-minecoop.js';

test('importJugadores inserts players with their actividad', () => {
  const db = openDb(':memory:');
  importJugadores(db, [
    { username: 'SlayerL99', actividad: 'activo' },
    { username: 'BjornViking206', actividad: 'inactivo' },
  ]);
  const rows = db.prepare('SELECT minecraft_name, actividad FROM players ORDER BY minecraft_name').all();
  assert.deepEqual(rows, [
    { minecraft_name: 'BjornViking206', actividad: 'inactivo' },
    { minecraft_name: 'SlayerL99', actividad: 'activo' },
  ]);
});

test('importProyectos inserts projects and returns a slug-to-id map', () => {
  const db = openDb(':memory:');
  const ids = importProyectos(db, [
    { id: 'catedral', title: 'Catedral', coordinates: ['Centro: 0, 0, 0'] },
  ]);
  const projectId = ids.get('catedral');
  assert.ok(projectId);
  const row = db.prepare('SELECT name, status, coordinates FROM projects WHERE id = ?').get(projectId);
  assert.deepEqual(row, { name: 'Catedral', status: 'active', coordinates: 'Centro: 0, 0, 0' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — cannot find module `../src/scripts/import-minecoop.js`

- [ ] **Step 3: Write the implementation**

Create `dashboard/server/src/scripts/import-minecoop.ts`:

```ts
import type Database from 'better-sqlite3';

export interface MinecoopJugador {
  username: string;
  actividad: 'activo' | 'ocasional' | 'inactivo';
}

export interface MinecoopEntity {
  id: string;
  title: string;
  coordinates: string[];
}

export function importJugadores(db: Database.Database, jugadores: MinecoopJugador[]) {
  const insert = db.prepare(
    `INSERT INTO players (minecraft_name, actividad) VALUES (?, ?)
     ON CONFLICT(minecraft_name) DO UPDATE SET actividad = excluded.actividad`
  );
  for (const j of jugadores) insert.run(j.username, j.actividad);
}

export function importProyectos(db: Database.Database, proyectos: MinecoopEntity[]): Map<string, number> {
  const idBySlug = new Map<string, number>();
  const insert = db.prepare('INSERT INTO projects (name, status, coordinates) VALUES (?, ?, ?)');
  for (const p of proyectos) {
    const info = insert.run(p.title, 'active', p.coordinates.join('; '));
    idBySlug.set(p.id, Number(info.lastInsertRowid));
  }
  return idBySlug;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/scripts/import-minecoop.ts dashboard/server/test/import-minecoop.test.ts
git commit -m "feat(dashboard): import-minecoop script — players and proyectos"
```

---

### Task 7: Import script — granjas as live Farms

**Files:**
- Modify: `dashboard/server/src/scripts/import-minecoop.ts`
- Modify: `dashboard/server/test/import-minecoop.test.ts`

**Interfaces:**
- Consumes: `mcfmFetch` (`dashboard/server/src/mcfarmmanager.ts`, signature `(pathAndQuery: string, init?: { method?: string; body?: unknown }) => Promise<unknown>`), `MinecoopEntity` (Task 6).
- Produces: `importGranjas(db: Database.Database, granjas: MinecoopEntity[]): Promise<void>` — registers each granja as a real Farm via MCFarmManager, then writes `farm_metadata` preserving the original coordinate-label text.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/import-minecoop.test.ts`:

```ts
import { mock } from 'node:test';
import { importGranjas } from '../src/scripts/import-minecoop.js';

test('importGranjas registers a Farm per granja via MCFarmManager and stores metadata', async (t) => {
  const db = openDb(':memory:');
  const calls: Array<{ url: string; init: any }> = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string, init: any) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(JSON.parse(init.body)), { status: 201 });
  });
  t.after(() => fetchMock.mock.restore());

  await importGranjas(db, [
    { id: 'granja-hierro', title: 'Granja de Hierro', coordinates: ['Almacen: 0, 0, 0', 'Punto AFK: 0, 0, 0'] },
    { id: 'granja-blaze', title: 'Granja de Blaze', coordinates: ['Granja (Nether): 0, 0, 0'] },
  ]);

  assert.equal(calls.length, 2);
  const ironBody = JSON.parse(calls[0].init.body);
  assert.equal(ironBody.id, 'granja-hierro');
  assert.equal(ironBody.dimension, 'minecraft:overworld');
  assert.equal(ironBody.storage.length, 1);
  assert.ok(ironBody.afkSpot);

  const blazeBody = JSON.parse(calls[1].init.body);
  assert.equal(blazeBody.dimension, 'minecraft:the_nether');
  assert.equal(blazeBody.storage.length, 0);
  assert.equal(blazeBody.afkSpot, null);

  const metadata = db.prepare('SELECT coordinates FROM farm_metadata WHERE farm_id = ?').get('granja-hierro') as any;
  assert.equal(metadata.coordinates, 'Almacen: 0, 0, 0; Punto AFK: 0, 0, 0');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `importGranjas` is not exported

- [ ] **Step 3: Write the implementation**

Append to `dashboard/server/src/scripts/import-minecoop.ts` (add the import at the top too):

```ts
import { mcfmFetch } from '../mcfarmmanager.js';
```

```ts
function dimensionFor(coordinates: string[]): string {
  const text = coordinates.join(' ');
  if (text.includes('(Nether)')) return 'minecraft:the_nether';
  if (text.includes('(End)')) return 'minecraft:the_end';
  return 'minecraft:overworld';
}

function buildFarmConfig(granja: MinecoopEntity) {
  const storage = granja.coordinates
    .filter((c) => c.startsWith('Almacen'))
    .map((_, i) => ({ id: `${granja.id}-storage-${i}`, label: 'Almacen', position: { x: 0, y: 64, z: 0 } }));
  const afkSpot = granja.coordinates.some((c) => c.startsWith('Punto AFK'))
    ? { position: { x: 0, y: 64, z: 0 }, radius: 5 }
    : null;
  return {
    id: granja.id,
    name: granja.title,
    dimension: dimensionFor(granja.coordinates),
    anchor: { x: 0, y: 64, z: 0 },
    entityScanRadius: 16,
    fakePlayerName: null,
    storage,
    afkSpot,
  };
}

export async function importGranjas(db: Database.Database, granjas: MinecoopEntity[]) {
  const upsertMetadata = db.prepare(
    `INSERT INTO farm_metadata (farm_id, notes, coordinates) VALUES (?, ?, ?)
     ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, coordinates = excluded.coordinates`
  );
  for (const granja of granjas) {
    await mcfmFetch('/farms', { method: 'POST', body: buildFarmConfig(granja) });
    const original = granja.coordinates.join('; ');
    upsertMetadata.run(granja.id, `Coordenadas originales de minecoop (placeholder, corregir en la UI): ${original}`, original);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/scripts/import-minecoop.ts dashboard/server/test/import-minecoop.test.ts
git commit -m "feat(dashboard): import-minecoop script — granjas registered as live Farms"
```

---

### Task 8: Import script — tareas

**Files:**
- Modify: `dashboard/server/src/scripts/import-minecoop.ts`
- Modify: `dashboard/server/test/import-minecoop.test.ts`

**Interfaces:**
- Consumes: `MinecoopEntity` (Task 6), the `Map<string, number>` returned by `importProyectos` (Task 6), the `players` rows inserted by `importJugadores` (Task 6).
- Produces: `importTareas(db: Database.Database, tareas: MinecoopTarea[], projectIdBySlug: Map<string, number>): void`.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/server/test/import-minecoop.test.ts`:

```ts
import { importTareas } from '../src/scripts/import-minecoop.js';

test('importTareas maps status/priority, links project over farm, and imports subtasks + assignees', () => {
  const db = openDb(':memory:');
  importJugadores(db, [
    { username: 'SlayerL99', actividad: 'activo' },
    { username: 'Syanurix', actividad: 'activo' },
  ]);
  const projectIdBySlug = importProyectos(db, [{ id: 'zona-industrial', title: 'Zona Industrial', coordinates: ['Centro: 0, 0, 0'] }]);

  importTareas(
    db,
    [
      {
        id: 'granja-kelp',
        title: 'reConstruir Granja de Kelp',
        status: 'pendiente',
        priority: 3,
        assignee: ['SlayerL99'],
        granjas: ['granja-kelp'],
        proyectos: ['zona-industrial'],
        subtareas: [
          { title: 'Juntar materiales', done: false, assignee: ['Syanurix'] },
          { title: 'Quitar granja actual', done: false },
        ],
      },
      {
        id: 'catedral',
        title: 'Construir Catedral',
        status: 'en-progreso',
        priority: 4,
        assignee: ['SlayerL99'],
      },
    ],
    projectIdBySlug
  );

  const kelp = db.prepare('SELECT status, priority, project_id, farm_id FROM tasks WHERE title = ?').get('reConstruir Granja de Kelp') as any;
  assert.equal(kelp.status, 'todo');
  assert.equal(kelp.priority, 'med');
  assert.equal(kelp.project_id, projectIdBySlug.get('zona-industrial'));
  assert.equal(kelp.farm_id, null);

  const catedral = db.prepare('SELECT status, priority, project_id, farm_id FROM tasks WHERE title = ?').get('Construir Catedral') as any;
  assert.equal(catedral.status, 'in_progress');
  assert.equal(catedral.priority, 'high');
  assert.equal(catedral.project_id, null);
  assert.equal(catedral.farm_id, null);

  const kelpTaskId = db.prepare('SELECT id FROM tasks WHERE title = ?').get('reConstruir Granja de Kelp') as any;
  const subtasks = db.prepare('SELECT title, done FROM subtasks WHERE task_id = ? ORDER BY sort_order').all(kelpTaskId.id);
  assert.deepEqual(subtasks, [
    { title: 'Juntar materiales', done: 0 },
    { title: 'Quitar granja actual', done: 0 },
  ]);

  const assignees = db
    .prepare('SELECT p.minecraft_name FROM players p JOIN task_assignees ta ON ta.player_id = p.id WHERE ta.task_id = ?')
    .all(kelpTaskId.id);
  assert.deepEqual(assignees, [{ minecraft_name: 'SlayerL99' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test`
Expected: FAIL — `importTareas` is not exported

- [ ] **Step 3: Write the implementation**

Append to `dashboard/server/src/scripts/import-minecoop.ts`:

```ts
export interface MinecoopSubtarea {
  title: string;
  done: boolean;
  assignee?: string[];
}

export interface MinecoopTarea {
  id: string;
  title: string;
  status: 'pendiente' | 'en-progreso';
  assignee?: string[];
  priority: number;
  notes?: string;
  granjas?: string[];
  proyectos?: string[];
  subtareas?: MinecoopSubtarea[];
}

function taskStatusFor(status: MinecoopTarea['status']): 'todo' | 'in_progress' {
  return status === 'en-progreso' ? 'in_progress' : 'todo';
}

function taskPriorityFor(priority: number): 'low' | 'med' | 'high' {
  if (priority <= 1) return 'low';
  if (priority <= 3) return 'med';
  return 'high';
}

export function importTareas(db: Database.Database, tareas: MinecoopTarea[], projectIdBySlug: Map<string, number>) {
  const playerIdByName = new Map<string, number>();
  for (const row of db.prepare('SELECT id, minecraft_name FROM players').all() as Array<{ id: number; minecraft_name: string }>) {
    playerIdByName.set(row.minecraft_name, row.id);
  }

  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, status, priority, farm_id, project_id)
     VALUES (@title, @description, @status, @priority, @farm_id, @project_id)`
  );
  const insertSubtask = db.prepare('INSERT INTO subtasks (task_id, title, done, sort_order) VALUES (?, ?, ?, ?)');
  const insertAssignee = db.prepare('INSERT INTO task_assignees (task_id, player_id) VALUES (?, ?)');

  for (const tarea of tareas) {
    const projectSlug = tarea.proyectos?.[0];
    const projectId = projectSlug ? projectIdBySlug.get(projectSlug) ?? null : null;
    const farmId = !projectId && tarea.granjas?.[0] ? tarea.granjas[0] : null;

    const info = insertTask.run({
      title: tarea.title,
      description: tarea.notes || null,
      status: taskStatusFor(tarea.status),
      priority: taskPriorityFor(tarea.priority),
      farm_id: farmId,
      project_id: projectId,
    });
    const taskId = Number(info.lastInsertRowid);

    (tarea.subtareas ?? []).forEach((subtarea, index) => {
      insertSubtask.run(taskId, subtarea.title, subtarea.done ? 1 : 0, index);
    });

    for (const username of tarea.assignee ?? []) {
      const playerId = playerIdByName.get(username);
      if (playerId) insertAssignee.run(taskId, playerId);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/scripts/import-minecoop.ts dashboard/server/test/import-minecoop.test.ts
git commit -m "feat(dashboard): import-minecoop script — tareas with subtasks and assignees"
```

---

### Task 9: Wire the runnable entrypoint and execute the migration

**Files:**
- Modify: `dashboard/server/src/scripts/import-minecoop.ts`
- Modify: `dashboard/server/package.json`

**Interfaces:**
- Consumes: `importJugadores`, `importProyectos`, `importGranjas`, `importTareas` (Tasks 6–8), `openDb` (`dashboard/server/src/db.ts`), the four JSON fixtures (Task 5).
- Produces: `npm run import-minecoop` in `dashboard/server`, a one-time operational script (not covered by an automated test — it talks to the real DB file and the real MCFarmManager).

- [ ] **Step 1: Add the CLI entrypoint**

Append to `dashboard/server/src/scripts/import-minecoop.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture<T>(name: string): T {
  const raw = fs.readFileSync(path.join(__dirname, 'minecoop-data', `${name}.json`), 'utf-8');
  return JSON.parse(raw) as T;
}

async function main() {
  const dataDir = process.env.DASHBOARD_DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
  const db = openDb(path.join(dataDir, 'dashboard.sqlite'));

  const jugadores = loadFixture<MinecoopJugador[]>('jugadores');
  const proyectos = loadFixture<MinecoopEntity[]>('proyectos');
  const granjas = loadFixture<MinecoopEntity[]>('granjas');
  const tareas = loadFixture<MinecoopTarea[]>('tareas');

  importJugadores(db, jugadores);
  const projectIdBySlug = importProyectos(db, proyectos);
  await importGranjas(db, granjas);
  importTareas(db, tareas, projectIdBySlug);

  console.log(`Importados: ${jugadores.length} jugadores, ${proyectos.length} proyectos, ${granjas.length} granjas, ${tareas.length} tareas.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Add the npm script**

In `dashboard/server/package.json`, add to `"scripts"`:

```json
"import-minecoop": "tsx src/scripts/import-minecoop.ts"
```

- [ ] **Step 3: Run the full test suite once more**

Run: `cd dashboard/server && npm test`
Expected: PASS (the `if (import.meta.url === ...)` guard means `main()` does not run during tests, since the test file imports the module rather than executing it directly)

- [ ] **Step 4: Commit the code**

```bash
git add dashboard/server/src/scripts/import-minecoop.ts dashboard/server/package.json
git commit -m "feat(dashboard): wire up import-minecoop CLI entrypoint"
```

- [ ] **Step 5: Run the real migration**

This talks to the live dashboard database and the live MCFarmManager — run it on the machine/environment where the dashboard server and MCFarmManager are actually reachable (same defaults `server.ts` uses: `DASHBOARD_DATA_DIR`, `MCFARMMANAGER_URL`, `MCFARMMANAGER_API_TOKEN`).

Run: `cd dashboard/server && npm run import-minecoop`
Expected: prints `Importados: 15 jugadores, 13 proyectos, 33 granjas, 29 tareas.`

- [ ] **Step 6: Verify in the running dashboard**

Hit the API (or open the UI) to spot-check:
- `GET /api/players` — 15 rows, actividad matches minecoop.
- `GET /api/projects` — 13 rows.
- `GET /api/farms` — 33 farms (each with the fabricated `anchor: {0,64,0}` — expect them to look "broken" in the live view until real coordinates are entered by hand in the Granja detail UI, per the spec).
- `GET /api/tasks` — 29 tasks, spot-check `granja-kelp`'s task has `project_id` set (not `farm_id`), and has 2 subtasks and 1 assignee.

No commit for this step — it's a data-only operation against a running system, not a code change.

---

## Plan self-review notes
- Spec coverage: Jugadores categories (§1) → Tasks 1–4. minecoop import — jugadores/proyectos/granjas/tareas (§2a–2c), migration order (§2), out-of-scope items — all covered by Tasks 5–9; out-of-scope items are simply not built (no auto-derivation task, no dual-link task).
- Every code step has literal code, no "TBD"/"similar to Task N" placeholders.
- Type names cross-checked: `MinecoopEntity`/`MinecoopJugador`/`MinecoopTarea`/`MinecoopSubtarea` used consistently from their Task 6/7/8 definitions through Task 9's `main()`. `Actividad` type name matches between `types.ts` (Task 3) and `Jugadores.tsx` (Task 4).
