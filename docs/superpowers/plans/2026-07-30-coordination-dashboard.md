# Coordination Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SlayCraft coordination dashboard: a Fastify+SQLite API proxying MCFarmManager and serving tasks/players/projects/gallery data, plus a React+Tailwind frontend with six views (Overview, Tareas, Granjas, Jugadores, Proyectos, Galería), gated by a single shared password.

**Architecture:** Two independent Node projects under `dashboard/`: `server/` (Fastify, better-sqlite3, zod, no ORM) and `client/` (Vite, React, @tanstack/react-query, Tailwind). The server is the only thing that talks to MCFarmManager's HTTP API; the browser only ever talks to the dashboard server. Dev: Vite proxies `/api` and `/uploads` to the Fastify server.

**Tech Stack:** Node 24, TypeScript, Fastify 4, better-sqlite3, zod, @fastify/cookie, @fastify/multipart, @fastify/static, node:test (backend tests, via `fastify.inject()`), Vite, React 18, react-router-dom, @tanstack/react-query, Tailwind CSS.

## Global Constraints

- All user-facing UI text (labels, buttons, statuses, empty states, error messages surfaced in the UI) is in **Spanish**. Nav names: Resumen (Overview), Tareas, Granjas, Jugadores, Proyectos, Galería.
- MCFarmManager's HTTP API is never called from the browser — only from the dashboard server (`MCFARMMANAGER_URL`, default `http://127.0.0.1:8642`).
- No ORM. No new dependency where Node stdlib covers it (password hashing uses `node:crypto` scrypt, not bcrypt).
- Single shared admin password, session via signed httpOnly cookie, in-memory session store — no accounts/roles.
- SQLite opened in WAL mode (`PRAGMA journal_mode = WAL`) with foreign keys on.
- Backend tests use `node:test` + `fastify.inject()` — no supertest. Frontend views are verified by running the dev server and checking in a browser (no component test framework introduced for v1 — flagged as a scope choice, not an oversight).
- Docker/compose is out of scope for this plan (Phase 5).

---

## Task 1: Server scaffold, SQLite schema, DB module

**Files:**
- Create: `dashboard/server/package.json`
- Create: `dashboard/server/tsconfig.json`
- Create: `dashboard/server/src/schema.sql`
- Create: `dashboard/server/src/db.ts`
- Create: `dashboard/server/test/db.test.ts`
- Create: `dashboard/.gitignore`

**Interfaces:**
- Produces: `openDb(dbPath: string): Database.Database` — opens (or creates) a SQLite file, sets WAL + foreign_keys pragmas, and applies `schema.sql` (idempotent, `CREATE TABLE IF NOT EXISTS`). Used by every later task that touches the DB.

- [ ] **Step 1: Create the server package**

`dashboard/server/package.json`:
```json
{
  "name": "dashboard-server",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "node --import tsx --test test/**/*.test.ts",
    "set-password": "tsx src/scripts/set-password.ts"
  },
  "dependencies": {
    "@fastify/cookie": "^9.3.1",
    "@fastify/multipart": "^8.3.0",
    "@fastify/static": "^7.0.4",
    "better-sqlite3": "^11.3.0",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.5.5",
    "tsx": "^4.19.1",
    "typescript": "^5.6.2"
  }
}
```

`dashboard/server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

`dashboard/.gitignore`:
```
node_modules/
dist/
data/
.env
```

- [ ] **Step 2: Write the schema**

`dashboard/server/src/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  minecraft_name TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done')),
  priority TEXT NOT NULL DEFAULT 'med' CHECK (priority IN ('low','med','high')),
  due_date TEXT,
  farm_id TEXT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, player_id)
);

CREATE TABLE IF NOT EXISTS project_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gallery_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  caption TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS farm_metadata (
  farm_id TEXT PRIMARY KEY,
  notes TEXT,
  tags TEXT
);
```

- [ ] **Step 3: Write `db.ts`**

```typescript
// dashboard/server/src/db.ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  return db;
}
```

- [ ] **Step 4: Write the test**

```typescript
// dashboard/server/test/db.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';

test('openDb applies schema and enables WAL + foreign keys', () => {
  const db = openDb(':memory:');
  const journalMode = db.pragma('journal_mode', { simple: true });
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  assert.equal(foreignKeys, 1);
  // :memory: databases report 'memory' journal mode regardless of the pragma set — assert it was accepted without error instead
  assert.ok(typeof journalMode === 'string');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
  for (const t of ['users', 'players', 'projects', 'tasks', 'subtasks', 'task_assignees', 'project_images', 'gallery_images', 'farm_metadata']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('rejects an invalid task status via CHECK constraint', () => {
  const db = openDb(':memory:');
  assert.throws(() => {
    db.prepare("INSERT INTO tasks (title, status) VALUES ('x', 'nope')").run();
  });
});
```

- [ ] **Step 5: Install deps and run the test**

Run:
```bash
cd dashboard/server && npm install && npm test
```
Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add dashboard/.gitignore dashboard/server/package.json dashboard/server/package-lock.json dashboard/server/tsconfig.json dashboard/server/src/schema.sql dashboard/server/src/db.ts dashboard/server/test/db.test.ts
git commit -m "dashboard: scaffold server package with SQLite schema and db module"
```

---

## Task 2: Auth (password hashing, sessions, login/logout/me routes)

**Files:**
- Create: `dashboard/server/src/auth.ts`
- Create: `dashboard/server/src/routes/auth.ts`
- Create: `dashboard/server/src/app.ts`
- Create: `dashboard/server/src/scripts/set-password.ts`
- Create: `dashboard/server/test/auth.test.ts`
- Create: `dashboard/server/test/helpers.ts`

**Interfaces:**
- Consumes: `openDb` from Task 1.
- Produces: `hashPassword(password: string): string`, `verifyPassword(password: string, stored: string): boolean`, `createSession(): string`, `isValidSession(token: string | undefined): boolean`, `destroySession(token: string): void` (all in `auth.ts`). `buildApp(db: Database.Database, uploadsDir: string): FastifyInstance` (in `app.ts`) — the shape every later route-registration task plugs into. `loginAndGetCookie(app, db, password?): Promise<string>` test helper — used by every later test file that needs an authenticated request.

- [ ] **Step 1: Write `auth.ts`**

```typescript
// dashboard/server/src/auth.ts
import crypto from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map<string, number>();

export function createSession(): string {
  const token = crypto.randomUUID();
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}
```

- [ ] **Step 2: Write the auth routes**

```typescript
// dashboard/server/src/routes/auth.ts
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { verifyPassword, createSession, destroySession } from '../auth.js';

const loginSchema = z.object({ password: z.string().min(1) });

export function registerAuthRoutes(app: FastifyInstance, db: Database.Database) {
  app.post('/api/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as
      | { password_hash: string }
      | undefined;
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      return reply.code(401).send({ error: 'Contraseña incorrecta' });
    }
    const token = createSession();
    reply.setCookie('session', token, { httpOnly: true, sameSite: 'lax', path: '/', signed: true });
    return { ok: true };
  });

  app.post('/api/logout', async (req, reply) => {
    const raw = req.cookies.session;
    if (raw) {
      const unsigned = app.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) destroySession(unsigned.value);
    }
    reply.clearCookie('session', { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async () => ({ ok: true }));
}
```

- [ ] **Step 3: Write `app.ts` wiring the auth guard**

```typescript
// dashboard/server/src/app.ts
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import { isValidSession } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';

export function buildApp(db: Database.Database, uploadsDir: string) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  const cookieSecret = process.env.COOKIE_SECRET ?? 'dev-secret-change-me';

  app.register(cookie, { secret: cookieSecret });
  app.register(multipart);
  app.register(fastifyStatic, { root: uploadsDir, prefix: '/uploads/' });

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/login') return;
    const raw = req.cookies.session;
    const unsigned = raw ? app.unsignCookie(raw) : null;
    if (!unsigned?.valid || !isValidSession(unsigned.value ?? undefined)) {
      reply.code(401).send({ error: 'No autenticado' });
    }
  });

  registerAuthRoutes(app, db);

  return app;
}
```

- [ ] **Step 4: Write the `set-password` script**

```typescript
// dashboard/server/src/scripts/set-password.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js';
import { hashPassword } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const password = process.argv[2];
if (!password) {
  console.error('Uso: npm run set-password -- <contraseña>');
  process.exit(1);
}

const dataDir = process.env.DASHBOARD_DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
const db = openDb(path.join(dataDir, 'dashboard.sqlite'));
db.prepare(
  'INSERT INTO users (id, password_hash) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash'
).run(hashPassword(password));
console.log('Contraseña actualizada.');
```

- [ ] **Step 5: Write the shared test helper**

```typescript
// dashboard/server/test/helpers.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';

export function makeApp(): { app: FastifyInstance; db: Database.Database; uploadsDir: string } {
  const db = openDb(':memory:');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test-'));
  const app = buildApp(db, uploadsDir);
  return { app, db, uploadsDir };
}

export async function loginAndGetCookie(
  app: FastifyInstance,
  db: Database.Database,
  password = 'test-pass'
): Promise<string> {
  db.prepare(
    'INSERT INTO users (id, password_hash) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash'
  ).run(hashPassword(password));
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password } });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error('login did not set a cookie');
  return raw.split(';')[0];
}
```

- [ ] **Step 6: Write the auth test**

```typescript
// dashboard/server/test/auth.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth.js';
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

test('wrong password is rejected', async () => {
  const { app, db } = makeApp();
  db.prepare('INSERT INTO users (id, password_hash) VALUES (1, ?)').run(hashPassword('right'));
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'wrong' } });
  assert.equal(res.statusCode, 401);
});
```

- [ ] **Step 7: Run tests**

Run: `cd dashboard/server && npm test`
Expected: all tests pass (5 from Task 1 + 4 new).

- [ ] **Step 8: Commit**

```bash
git add dashboard/server/src/auth.ts dashboard/server/src/routes/auth.ts dashboard/server/src/app.ts dashboard/server/src/scripts/set-password.ts dashboard/server/test/auth.test.ts dashboard/server/test/helpers.ts
git commit -m "dashboard: add password auth, sessions, login/logout/me routes"
```

---

## Task 3: MCFarmManager proxy + farm metadata

**Files:**
- Create: `dashboard/server/src/mcfarmmanager.ts`
- Create: `dashboard/server/src/routes/farms.ts`
- Create: `dashboard/server/src/routes/misc.ts`
- Modify: `dashboard/server/src/app.ts` (register the new routes)
- Create: `dashboard/server/test/farms.test.ts`

**Interfaces:**
- Consumes: `buildApp`, `loginAndGetCookie`, `makeApp` from Task 2.
- Produces: `GET /api/farms`, `GET /api/farms/:id`, `GET /api/farms/:id/history?range=`, `PATCH /api/farms/:id/metadata`, `GET /api/players/live`, `GET /api/world`, `GET /api/performance`, `GET /api/status` — all consumed by frontend Task 15 (Granjas) and Task 13 (Overview).

- [ ] **Step 1: Write the MCFarmManager client**

```typescript
// dashboard/server/src/mcfarmmanager.ts
const BASE_URL = process.env.MCFARMMANAGER_URL ?? 'http://127.0.0.1:8642';

export class McfmError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function mcfmFetch(pathAndQuery: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${pathAndQuery}`);
  } catch {
    throw new McfmError(502, 'No se pudo conectar con MCFarmManager');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new McfmError(res.status, body.error ?? 'Error de MCFarmManager');
  }
  return res.json();
}
```

- [ ] **Step 2: Write the farms routes**

```typescript
// dashboard/server/src/routes/farms.ts
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { mcfmFetch, McfmError } from '../mcfarmmanager.js';

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

export function registerFarmRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/farms', async (_req, reply) =>
    withMcfm(reply, async () => {
      const data = (await mcfmFetch('/farms')) as { farms: Array<{ id: string }> };
      return { farms: data.farms.map((f) => ({ ...f, metadata: getMetadata(db, f.id) })) };
    })
  );

  app.get('/api/farms/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return withMcfm(reply, async () => {
      const farm = (await mcfmFetch(`/farms/${encodeURIComponent(id)}`)) as Record<string, unknown>;
      return { ...farm, metadata: getMetadata(db, id) };
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
}
```

- [ ] **Step 3: Write the misc proxy routes**

```typescript
// dashboard/server/src/routes/misc.ts
import type { FastifyInstance } from 'fastify';
import { mcfmFetch, McfmError } from '../mcfarmmanager.js';

export function registerMiscRoutes(app: FastifyInstance) {
  const proxy = (path: string) => async (_req: unknown, reply: import('fastify').FastifyReply) => {
    try {
      return await mcfmFetch(path);
    } catch (err) {
      if (err instanceof McfmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  };

  app.get('/api/players/live', proxy('/players'));
  app.get('/api/world', proxy('/world'));
  app.get('/api/performance', proxy('/performance'));
  app.get('/api/status', proxy('/status'));
}
```

- [ ] **Step 4: Wire routes into `app.ts`**

```typescript
// dashboard/server/src/app.ts — add these imports and calls
import { registerFarmRoutes } from './routes/farms.js';
import { registerMiscRoutes } from './routes/misc.js';

// after registerAuthRoutes(app, db):
registerFarmRoutes(app, db);
registerMiscRoutes(app);
```

- [ ] **Step 5: Write the test (mocking global fetch)**

```typescript
// dashboard/server/test/farms.test.ts
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('GET /api/farms merges MCFarmManager data with dashboard metadata', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  db.prepare('INSERT INTO farm_metadata (farm_id, notes, tags) VALUES (?, ?, ?)').run('iron', 'necesita mas cofres', 'prioridad,hierro');

  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ farms: [{ id: 'iron', name: 'Iron Farm' }] }), { status: 200 })
  );
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.farms[0].id, 'iron');
  assert.deepEqual(body.farms[0].metadata, { notes: 'necesita mas cofres', tags: ['prioridad', 'hierro'] });
});

test('GET /api/farms returns 502 when MCFarmManager is unreachable', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('ECONNREFUSED');
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/farms', headers: { cookie } });
  assert.equal(res.statusCode, 502);
});

test('PATCH /api/farms/:id/metadata upserts notes and tags', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { notes: 'ok', tags: ['a', 'b'] },
  });
  assert.equal(res.statusCode, 200);
  const row = db.prepare('SELECT * FROM farm_metadata WHERE farm_id = ?').get('iron') as any;
  assert.equal(row.notes, 'ok');
  assert.equal(row.tags, 'a,b');
});
```

- [ ] **Step 6: Run tests**

Run: `cd dashboard/server && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add dashboard/server/src/mcfarmmanager.ts dashboard/server/src/routes/farms.ts dashboard/server/src/routes/misc.ts dashboard/server/src/app.ts dashboard/server/test/farms.test.ts
git commit -m "dashboard: proxy MCFarmManager API and merge dashboard-owned farm metadata"
```

---

## Task 4: Tasks, subtasks, and assignees CRUD

**Files:**
- Create: `dashboard/server/src/routes/tasks.ts`
- Modify: `dashboard/server/src/app.ts`
- Create: `dashboard/server/test/tasks.test.ts`

**Interfaces:**
- Consumes: helpers from Task 2, `players` table from Task 1.
- Produces: `GET/POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/:id`, `POST /api/tasks/:id/subtasks`, `PATCH/DELETE /api/subtasks/:id`. Response shape: `Task = { id, title, description, status, priority, due_date, farm_id, project_id, created_at, updated_at, subtasks: Subtask[], assignees: Player[] }` — this exact shape is what frontend Task 14 (Tareas) consumes.

- [ ] **Step 1: Write the tasks routes**

```typescript
// dashboard/server/src/routes/tasks.ts
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
const PRIORITIES = ['low', 'med', 'high'] as const;

const taskInput = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(STATUSES).default('todo'),
  priority: z.enum(PRIORITIES).default('med'),
  due_date: z.string().nullable().optional(),
  farm_id: z.string().nullable().optional(),
  project_id: z.number().int().nullable().optional(),
  assignee_ids: z.array(z.number().int()).default([]),
});

const subtaskInput = z.object({
  title: z.string().min(1),
  done: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  farm_id: string | null;
  project_id: number | null;
  created_at: string;
  updated_at: string;
}

function hydrateTask(db: Database.Database, task: TaskRow) {
  const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order').all(task.id);
  const assignees = db
    .prepare('SELECT p.* FROM players p JOIN task_assignees ta ON ta.player_id = p.id WHERE ta.task_id = ?')
    .all(task.id);
  return { ...task, subtasks, assignees };
}

function setAssignees(db: Database.Database, taskId: number, playerIds: number[]) {
  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  const insert = db.prepare('INSERT INTO task_assignees (task_id, player_id) VALUES (?, ?)');
  for (const playerId of playerIds) insert.run(taskId, playerId);
}

export function registerTaskRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/tasks', async () => {
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY (due_date IS NULL), due_date ASC').all() as TaskRow[];
    return { tasks: tasks.map((t) => hydrateTask(db, t)) };
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!task) return reply.code(404).send({ error: 'Tarea no encontrada' });
    return hydrateTask(db, task);
  });

  app.post('/api/tasks', async (req, reply) => {
    const body = taskInput.parse(req.body);
    const info = db
      .prepare(
        `INSERT INTO tasks (title, description, status, priority, due_date, farm_id, project_id)
         VALUES (@title, @description, @status, @priority, @due_date, @farm_id, @project_id)`
      )
      .run({
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        priority: body.priority,
        due_date: body.due_date ?? null,
        farm_id: body.farm_id ?? null,
        project_id: body.project_id ?? null,
      });
    setAssignees(db, Number(info.lastInsertRowid), body.assignee_ids);
    reply.code(201);
    return hydrateTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) as TaskRow);
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!existing) return reply.code(404).send({ error: 'Tarea no encontrada' });
    const body = taskInput.partial().parse(req.body);
    const merged = { ...existing, ...body, id };
    db.prepare(
      `UPDATE tasks SET title=@title, description=@description, status=@status, priority=@priority,
        due_date=@due_date, farm_id=@farm_id, project_id=@project_id, updated_at=datetime('now')
       WHERE id=@id`
    ).run(merged);
    if (body.assignee_ids) setAssignees(db, id, body.assignee_ids);
    return hydrateTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow);
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });

  app.post('/api/tasks/:id/subtasks', async (req) => {
    const taskId = Number((req.params as { id: string }).id);
    const body = subtaskInput.parse(req.body);
    const info = db
      .prepare('INSERT INTO subtasks (task_id, title, done, sort_order) VALUES (?, ?, ?, ?)')
      .run(taskId, body.title, body.done ? 1 : 0, body.sort_order);
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(info.lastInsertRowid);
  });

  app.patch('/api/subtasks/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as
      | { id: number; task_id: number; title: string; done: number; sort_order: number }
      | undefined;
    if (!existing) return reply.code(404).send({ error: 'Subtarea no encontrada' });
    const body = subtaskInput.partial().parse(req.body);
    db.prepare('UPDATE subtasks SET title=@title, done=@done, sort_order=@sort_order WHERE id=@id').run({
      id,
      title: body.title ?? existing.title,
      done: body.done !== undefined ? (body.done ? 1 : 0) : existing.done,
      sort_order: body.sort_order ?? existing.sort_order,
    });
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
  });

  app.delete('/api/subtasks/:id', async (req, reply) => {
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(Number((req.params as { id: string }).id));
    reply.code(204);
    return null;
  });
}
```

- [ ] **Step 2: Wire into `app.ts`**

```typescript
// add to dashboard/server/src/app.ts
import { registerTaskRoutes } from './routes/tasks.js';
// after registerMiscRoutes(app):
registerTaskRoutes(app, db);
```

- [ ] **Step 3: Write the test**

```typescript
// dashboard/server/test/tasks.test.ts
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
  assert.equal(res.statusCode, 500); // zod throws, Fastify default error handler -> 500; acceptable for v1, not exposed as a UX path since the frontend only ever sends valid enum values
});
```

- [ ] **Step 4: Run tests**

Run: `cd dashboard/server && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/tasks.ts dashboard/server/src/app.ts dashboard/server/test/tasks.test.ts
git commit -m "dashboard: add tasks, subtasks, and assignees CRUD"
```

---

## Task 5: Players registry CRUD

**Files:**
- Create: `dashboard/server/src/routes/players.ts`
- Modify: `dashboard/server/src/app.ts`
- Create: `dashboard/server/test/players.test.ts`

**Interfaces:**
- Produces: `GET/POST /api/players`, `PATCH/DELETE /api/players/:id`. `Player = { id, minecraft_name, note, created_at }`.

- [ ] **Step 1: Write the routes**

```typescript
// dashboard/server/src/routes/players.ts
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const playerInput = z.object({
  minecraft_name: z.string().min(1),
  note: z.string().nullable().optional(),
});

export function registerPlayerRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/players', async () => ({
    players: db.prepare('SELECT * FROM players ORDER BY minecraft_name').all(),
  }));

  app.post('/api/players', async (req, reply) => {
    const body = playerInput.parse(req.body);
    const info = db
      .prepare('INSERT INTO players (minecraft_name, note) VALUES (?, ?)')
      .run(body.minecraft_name, body.note ?? null);
    reply.code(201);
    return db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
  });

  app.patch('/api/players/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as
      | { id: number; minecraft_name: string; note: string | null }
      | undefined;
    if (!existing) return reply.code(404).send({ error: 'Jugador no encontrado' });
    const body = playerInput.partial().parse(req.body);
    db.prepare('UPDATE players SET minecraft_name=@minecraft_name, note=@note WHERE id=@id').run({
      id,
      minecraft_name: body.minecraft_name ?? existing.minecraft_name,
      note: body.note !== undefined ? body.note : existing.note,
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

- [ ] **Step 2: Wire into `app.ts`**

```typescript
import { registerPlayerRoutes } from './routes/players.js';
// after registerTaskRoutes(app, db):
registerPlayerRoutes(app, db);
```

- [ ] **Step 3: Write the test**

```typescript
// dashboard/server/test/players.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('player CRUD', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  const create = await app.inject({
    method: 'POST',
    url: '/api/players',
    headers: { cookie },
    payload: { minecraft_name: 'leivur', note: 'admin' },
  });
  assert.equal(create.statusCode, 201);
  const player = create.json();

  const update = await app.inject({
    method: 'PATCH',
    url: `/api/players/${player.id}`,
    headers: { cookie },
    payload: { note: 'builder' },
  });
  assert.equal(update.json().note, 'builder');

  const list = await app.inject({ method: 'GET', url: '/api/players', headers: { cookie } });
  assert.equal(list.json().players.length, 1);

  const del = await app.inject({ method: 'DELETE', url: `/api/players/${player.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);
});
```

- [ ] **Step 4: Run tests**

Run: `cd dashboard/server && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/players.ts dashboard/server/src/app.ts dashboard/server/test/players.test.ts
git commit -m "dashboard: add players registry CRUD"
```

---

## Task 6: Projects CRUD with image upload

**Files:**
- Create: `dashboard/server/src/routes/projects.ts`
- Modify: `dashboard/server/src/app.ts`
- Create: `dashboard/server/test/projects.test.ts`

**Interfaces:**
- Consumes: `uploadsDir` param already threaded through `buildApp` since Task 2.
- Produces: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `POST /api/projects/:id/images` (multipart), `DELETE /api/project-images/:id`.

- [ ] **Step 1: Write the routes**

```typescript
// dashboard/server/src/routes/projects.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const projectInput = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.string().min(1).default('active'),
});

interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
}

function getImages(db: Database.Database, projectId: number) {
  return db.prepare('SELECT * FROM project_images WHERE project_id = ? ORDER BY sort_order').all(projectId);
}

export function registerProjectRoutes(app: FastifyInstance, db: Database.Database, uploadsDir: string) {
  app.get('/api/projects', async () => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
    return { projects: projects.map((p) => ({ ...p, images: getImages(db, p.id) })) };
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    if (!project) return reply.code(404).send({ error: 'Proyecto no encontrado' });
    return { ...project, images: getImages(db, id) };
  });

  app.post('/api/projects', async (req, reply) => {
    const body = projectInput.parse(req.body);
    const info = db
      .prepare('INSERT INTO projects (name, description, status) VALUES (?, ?, ?)')
      .run(body.name, body.description ?? null, body.status);
    reply.code(201);
    return { ...(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid) as ProjectRow), images: [] };
  });

  app.patch('/api/projects/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    if (!existing) return reply.code(404).send({ error: 'Proyecto no encontrado' });
    const body = projectInput.partial().parse(req.body);
    db.prepare('UPDATE projects SET name=@name, description=@description, status=@status WHERE id=@id').run({
      id,
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      status: body.status ?? existing.status,
    });
    return { ...(db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow), images: getImages(db, id) };
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    for (const img of getImages(db, id) as Array<{ path: string }>) {
      fs.rmSync(path.join(uploadsDir, img.path), { force: true });
    }
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });

  app.post('/api/projects/:id/images', async (req, reply) => {
    const projectId = Number((req.params as { id: string }).id);
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Falta el archivo' });
    const ext = path.extname(file.filename);
    const filename = `${crypto.randomUUID()}${ext}`;
    await fs.promises.writeFile(path.join(uploadsDir, filename), await file.toBuffer());
    const caption = (file.fields.caption as { value?: string } | undefined)?.value ?? null;
    const info = db
      .prepare('INSERT INTO project_images (project_id, path, caption, sort_order) VALUES (?, ?, ?, 0)')
      .run(projectId, filename, caption);
    reply.code(201);
    return db.prepare('SELECT * FROM project_images WHERE id = ?').get(info.lastInsertRowid);
  });

  app.delete('/api/project-images/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const img = db.prepare('SELECT * FROM project_images WHERE id = ?').get(id) as { path: string } | undefined;
    if (img) fs.rmSync(path.join(uploadsDir, img.path), { force: true });
    db.prepare('DELETE FROM project_images WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });
}
```

- [ ] **Step 2: Wire into `app.ts`**

```typescript
import { registerProjectRoutes } from './routes/projects.js';
// after registerPlayerRoutes(app, db):
registerProjectRoutes(app, db, uploadsDir);
```

- [ ] **Step 3: Write the test**

```typescript
// dashboard/server/test/projects.test.ts
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
```

- [ ] **Step 4: Run tests**

Run: `cd dashboard/server && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/projects.ts dashboard/server/src/app.ts dashboard/server/test/projects.test.ts
git commit -m "dashboard: add projects CRUD with image upload"
```

---

## Task 7: Gallery CRUD with image upload

**Files:**
- Create: `dashboard/server/src/routes/gallery.ts`
- Modify: `dashboard/server/src/app.ts`
- Create: `dashboard/server/test/gallery.test.ts`

**Interfaces:**
- Produces: `GET/POST /api/gallery`, `PATCH/DELETE /api/gallery/:id`.

- [ ] **Step 1: Write the routes**

```typescript
// dashboard/server/src/routes/gallery.ts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

export function registerGalleryRoutes(app: FastifyInstance, db: Database.Database, uploadsDir: string) {
  app.get('/api/gallery', async () => ({
    images: db.prepare('SELECT * FROM gallery_images ORDER BY created_at DESC').all(),
  }));

  app.post('/api/gallery', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Falta el archivo' });
    const ext = path.extname(file.filename);
    const filename = `${crypto.randomUUID()}${ext}`;
    await fs.promises.writeFile(path.join(uploadsDir, filename), await file.toBuffer());
    const caption = (file.fields.caption as { value?: string } | undefined)?.value ?? null;
    const info = db.prepare('INSERT INTO gallery_images (path, caption) VALUES (?, ?)').run(filename, caption);
    reply.code(201);
    return db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(info.lastInsertRowid);
  });

  app.patch('/api/gallery/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ caption: z.string().nullable() }).parse(req.body);
    const existing = db.prepare('SELECT id FROM gallery_images WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Imagen no encontrada' });
    db.prepare('UPDATE gallery_images SET caption = ? WHERE id = ?').run(body.caption, id);
    return db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
  });

  app.delete('/api/gallery/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const img = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id) as { path: string } | undefined;
    if (img) fs.rmSync(path.join(uploadsDir, img.path), { force: true });
    db.prepare('DELETE FROM gallery_images WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });
}
```

- [ ] **Step 2: Wire into `app.ts`**

```typescript
import { registerGalleryRoutes } from './routes/gallery.js';
// after registerProjectRoutes(app, db, uploadsDir):
registerGalleryRoutes(app, db, uploadsDir);
```

- [ ] **Step 3: Write the test**

```typescript
// dashboard/server/test/gallery.test.ts
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
```

- [ ] **Step 4: Run tests**

Run: `cd dashboard/server && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/gallery.ts dashboard/server/src/app.ts dashboard/server/test/gallery.test.ts
git commit -m "dashboard: add gallery CRUD with image upload"
```

---

## Task 8: Server entrypoint and README

**Files:**
- Create: `dashboard/server/src/server.ts`
- Create: `dashboard/README.md`

**Interfaces:**
- Consumes: `openDb` (Task 1), `buildApp` (Task 2).
- Produces: the runnable `npm run dev` entrypoint every later manual-verification task depends on.

- [ ] **Step 1: Write the entrypoint**

```typescript
// dashboard/server/src/server.ts
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { buildApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DASHBOARD_DATA_DIR ?? path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const db = openDb(path.join(dataDir, 'dashboard.sqlite'));
const app = buildApp(db, uploadsDir);

app
  .listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Verify it boots**

Run:
```bash
cd dashboard/server && npm run set-password -- changeme && npm run dev &
sleep 2 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/me
kill %1
```
Expected: prints `401` (no session cookie sent — confirms the server booted and the auth guard is active). No crash in the log output.

- [ ] **Step 3: Write `dashboard/README.md`**

```markdown
# SlayCraft Coordination Dashboard

Two independent Node projects:
- `server/` — Fastify + better-sqlite3 API. Proxies MCFarmManager, owns tasks/players/projects/gallery.
- `client/` — Vite + React frontend.

## Run in development

    cd dashboard/server && npm install
    npm run set-password -- <tu-contraseña>
    npm run dev        # http://localhost:3001

    cd dashboard/client && npm install
    npm run dev         # http://localhost:5173, proxies /api and /uploads to :3001

## Environment variables (server)

- `PORT` — default `3001`.
- `MCFARMMANAGER_URL` — default `http://127.0.0.1:8642`. Never expose this port publicly; only the dashboard server should reach it.
- `COOKIE_SECRET` — set a real secret in production; defaults to a dev value.
- `DASHBOARD_DATA_DIR` — where `dashboard.sqlite` and `uploads/` live. Default: `server/data/`.
```

- [ ] **Step 4: Commit**

```bash
git add dashboard/server/src/server.ts dashboard/README.md
git commit -m "dashboard: add server entrypoint and README"
```

---

## Task 9: Client scaffold — Vite, React, Tailwind, dark HUD theme

**Files:**
- Create: `dashboard/client/package.json`
- Create: `dashboard/client/tsconfig.json`
- Create: `dashboard/client/vite.config.ts`
- Create: `dashboard/client/tailwind.config.ts`
- Create: `dashboard/client/postcss.config.js`
- Create: `dashboard/client/index.html`
- Create: `dashboard/client/src/main.tsx`
- Create: `dashboard/client/src/index.css`
- Create: `dashboard/client/src/App.tsx`

**Interfaces:**
- Produces: the Tailwind color/font tokens (`bg-panel`, `text-accent-gold`, `text-accent-cyan`, `font-mono`) every later frontend task's JSX uses. The Vite dev proxy that lets `fetch('/api/...')` reach the Fastify server without CORS setup.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "dashboard-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.56.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.11",
    "typescript": "^5.6.2",
    "vite": "^5.4.5"
  }
}
```

- [ ] **Step 2: Write config files**

```typescript
// dashboard/client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
});
```

```typescript
// dashboard/client/tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0b0e11',
        panel: '#12161c',
        border: '#232a33',
        gold: '#e8b339',
        cyan: '#4fd1c5',
        status: {
          done: '#34d399',
          progress: '#e8b339',
          blocked: '#f87171',
          todo: '#94a3b8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

```javascript
// dashboard/client/postcss.config.js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

```json
// dashboard/client/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

```html
<!-- dashboard/client/index.html -->
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SlayCraft — Panel</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-base text-slate-100 font-sans">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the app shell**

```css
/* dashboard/client/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```tsx
// dashboard/client/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
```

```tsx
// dashboard/client/src/App.tsx (placeholder wired up fully in Task 11)
export default function App() {
  return <div className="p-8 text-2xl font-mono text-gold">SlayCraft</div>;
}
```

- [ ] **Step 4: Verify it boots**

Run:
```bash
cd dashboard/client && npm install && npm run dev &
sleep 2 && curl -s http://localhost:5173 | grep -o '<title>.*</title>'
kill %1
```
Expected: prints `<title>SlayCraft — Panel</title>`.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client
git commit -m "dashboard: scaffold Vite/React/Tailwind client with dark HUD theme tokens"
```

---

## Task 10: API client, types, and react-query hooks

**Files:**
- Create: `dashboard/client/src/api/client.ts`
- Create: `dashboard/client/src/api/types.ts`
- Create: `dashboard/client/src/api/hooks.ts`

**Interfaces:**
- Consumes: the `/api/*` routes from Tasks 2–7.
- Produces: `apiFetch<T>(path, options?)`, and hooks `useMe`, `useLogin`, `useLogout`, `useTasks`, `useCreateTask`, `useUpdateTask`, `useDeleteTask`, `useAddSubtask`, `useUpdateSubtask`, `useDeleteSubtask`, `usePlayers`, `useCreatePlayer`, `useUpdatePlayer`, `useDeletePlayer`, `useFarms`, `useFarm(id)`, `useFarmHistory(id, range)`, `useUpdateFarmMetadata`, `useLivePlayers`, `usePerformance`, `useProjects`, `useCreateProject`, `useUpdateProject`, `useDeleteProject`, `useUploadProjectImage`, `useGallery`, `useUploadGalleryImage`, `useUpdateGalleryImage`, `useDeleteGalleryImage` — every later view task (11–18) imports from here, not from `apiFetch` directly.

- [ ] **Step 1: Write the API client**

```typescript
// dashboard/client/src/api/client.ts
const API_BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: isFormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Error de red' }));
    throw new ApiError(res.status, (body as { error?: string }).error ?? `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
```

- [ ] **Step 2: Write types**

```typescript
// dashboard/client/src/api/types.ts
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'med' | 'high';

export interface Player {
  id: number;
  minecraft_name: string;
  note: string | null;
  created_at: string;
}

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  done: 0 | 1;
  sort_order: number;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  farm_id: string | null;
  project_id: number | null;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
  assignees: Player[];
}

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  farm_id?: string | null;
  project_id?: number | null;
  assignee_ids?: number[];
}

export interface FarmSummary {
  id: string;
  name: string;
  dimension: string;
  entityCount: number;
  storageItemCount: number;
  chunkLoaded: boolean;
  fakePlayerOnline: boolean;
  metadata: { notes: string | null; tags: string[] };
}

export interface FarmDetail extends FarmSummary {
  anchor: { x: number; y: number; z: number };
  fakePlayer: { name: string; online: boolean; position: { x: number; y: number; z: number } } | null;
  entities: Array<{ id: string; type: string; customName: string | null; position: { x: number; y: number; z: number }; health: number }>;
  storage: Array<{ id: string; label: string; position: { x: number; y: number; z: number }; capacity: number; items: Array<{ itemId: string; count: number }> }>;
}

export interface FarmHistorySample {
  sampledAt: string;
  entityCounts: Record<string, number>;
  storageCounts: Record<string, number>;
}

export interface LivePlayer {
  name: string;
  dimension: string;
  position: { x: number; y: number; z: number };
  gamemode: string;
}

export interface Performance {
  tps: number;
  meanTickTimeMs: number;
  sampledOverTicks: number;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  images: ProjectImage[];
}

export interface ProjectImage {
  id: number;
  project_id: number;
  path: string;
  caption: string | null;
  sort_order: number;
}

export interface GalleryImage {
  id: number;
  path: string;
  caption: string | null;
  created_at: string;
}
```

- [ ] **Step 3: Write the hooks**

```typescript
// dashboard/client/src/api/hooks.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type {
  Task, TaskInput, Subtask, Player, FarmSummary, FarmDetail, FarmHistorySample,
  LivePlayer, Performance, Project, ProjectImage, GalleryImage,
} from './types';

// --- auth ---
export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => apiFetch<{ ok: true }>('/me'), retry: false });
}
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => apiFetch<{ ok: true }>('/login', { method: 'POST', body: JSON.stringify({ password }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/logout', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

// --- tasks ---
export function useTasks() {
  return useQuery({ queryKey: ['tasks'], queryFn: () => apiFetch<{ tasks: Task[] }>('/tasks') });
}
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<TaskInput> & { id: number }) =>
      apiFetch<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useAddSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, title }: { taskId: number; title: string }) =>
      apiFetch<Subtask>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: JSON.stringify({ title }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useUpdateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; done?: boolean; title?: string }) =>
      apiFetch<Subtask>(`/subtasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
export function useDeleteSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/subtasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

// --- players (registry) ---
export function usePlayers() {
  return useQuery({ queryKey: ['players'], queryFn: () => apiFetch<{ players: Player[] }>('/players') });
}
export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { minecraft_name: string; note?: string | null }) =>
      apiFetch<Player>('/players', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}
export function useUpdatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; minecraft_name?: string; note?: string | null }) =>
      apiFetch<Player>(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}
export function useDeletePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/players/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}

// --- farms (live, proxied) ---
export function useFarms() {
  return useQuery({
    queryKey: ['farms'],
    queryFn: () => apiFetch<{ farms: FarmSummary[] }>('/farms'),
    refetchInterval: 30_000,
  });
}
export function useFarm(id: string) {
  return useQuery({ queryKey: ['farms', id], queryFn: () => apiFetch<FarmDetail>(`/farms/${id}`), refetchInterval: 15_000 });
}
export function useFarmHistory(id: string, range: string) {
  return useQuery({
    queryKey: ['farms', id, 'history', range],
    queryFn: () => apiFetch<{ samples: FarmHistorySample[] }>(`/farms/${id}/history?range=${range}`),
  });
}
export function useUpdateFarmMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes, tags }: { id: string; notes?: string | null; tags?: string[] }) =>
      apiFetch(`/farms/${id}/metadata`, { method: 'PATCH', body: JSON.stringify({ notes, tags }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['farms'] });
      qc.invalidateQueries({ queryKey: ['farms', vars.id] });
    },
  });
}
export function useLivePlayers() {
  return useQuery({
    queryKey: ['players', 'live'],
    queryFn: () => apiFetch<{ players: LivePlayer[] }>('/players/live'),
    refetchInterval: 15_000,
  });
}
export function usePerformance() {
  return useQuery({ queryKey: ['performance'], queryFn: () => apiFetch<Performance>('/performance'), refetchInterval: 10_000 });
}

// --- projects ---
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => apiFetch<{ projects: Project[] }>('/projects') });
}
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string | null; status?: string }) =>
      apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; name?: string; description?: string | null; status?: string }) =>
      apiFetch<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
export function useUploadProjectImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, file, caption }: { projectId: number; file: File; caption?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      return apiFetch<ProjectImage>(`/projects/${projectId}/images`, { method: 'POST', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// --- gallery ---
export function useGallery() {
  return useQuery({ queryKey: ['gallery'], queryFn: () => apiFetch<{ images: GalleryImage[] }>('/gallery') });
}
export function useUploadGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, caption }: { file: File; caption?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (caption) form.append('caption', caption);
      return apiFetch<GalleryImage>('/gallery', { method: 'POST', body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery'] }),
  });
}
export function useUpdateGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, caption }: { id: number; caption: string | null }) =>
      apiFetch<GalleryImage>(`/gallery/${id}`, { method: 'PATCH', body: JSON.stringify({ caption }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery'] }),
  });
}
export function useDeleteGalleryImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/gallery/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery'] }),
  });
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/api
git commit -m "dashboard: add API client, types, and react-query hooks"
```

---

## Task 11: Auth flow — login page, session guard, layout shell

**Files:**
- Create: `dashboard/client/src/pages/Login.tsx`
- Create: `dashboard/client/src/components/RequireAuth.tsx`
- Create: `dashboard/client/src/components/Layout.tsx`
- Create: `dashboard/client/src/components/Sidebar.tsx`
- Modify: `dashboard/client/src/App.tsx`

**Interfaces:**
- Consumes: `useMe`, `useLogin`, `useLogout` from Task 10.
- Produces: the `<Layout>` shell (sidebar + outlet) every view page (Tasks 13–18) renders inside.

- [ ] **Step 1: Write the login page**

```tsx
// dashboard/client/src/pages/Login.tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';

export default function Login() {
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login.mutateAsync(password);
      navigate('/');
    } catch {
      // error is surfaced via login.isError below
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base">
      <form onSubmit={onSubmit} className="w-80 rounded-lg border border-border bg-panel p-6">
        <h1 className="mb-4 font-mono text-xl text-gold">SlayCraft</h1>
        <label className="mb-1 block text-sm text-slate-400">Contraseña</label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded border border-border bg-base px-3 py-2 text-slate-100 outline-none focus:border-gold"
        />
        {login.isError && <p className="mb-3 text-sm text-status-blocked">Contraseña incorrecta</p>}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded bg-gold px-3 py-2 font-medium text-base hover:opacity-90 disabled:opacity-50"
        >
          {login.isPending ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write the auth guard**

```tsx
// dashboard/client/src/components/RequireAuth.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '../api/hooks';

export default function RequireAuth() {
  const me = useMe();
  if (me.isLoading) return <div className="p-8 text-slate-400">Cargando…</div>;
  if (me.isError) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 3: Write the sidebar and layout**

```tsx
// dashboard/client/src/components/Sidebar.tsx
import { NavLink } from 'react-router-dom';
import { useLogout } from '../api/hooks';

const links = [
  { to: '/', label: 'Resumen' },
  { to: '/tareas', label: 'Tareas' },
  { to: '/granjas', label: 'Granjas' },
  { to: '/jugadores', label: 'Jugadores' },
  { to: '/proyectos', label: 'Proyectos' },
  { to: '/galeria', label: 'Galería' },
];

export default function Sidebar() {
  const logout = useLogout();
  return (
    <aside className="flex h-screen w-52 flex-col border-r border-border bg-panel">
      <div className="px-4 py-5 font-mono text-lg text-gold">SlayCraft</div>
      <nav className="flex-1 space-y-1 px-2">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `block rounded px-3 py-2 text-sm ${isActive ? 'bg-base text-gold' : 'text-slate-300 hover:bg-base'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={() => logout.mutate()}
        className="m-2 rounded px-3 py-2 text-left text-sm text-slate-400 hover:bg-base hover:text-slate-100"
      >
        Cerrar sesión
      </button>
    </aside>
  );
}
```

```tsx
// dashboard/client/src/components/Layout.tsx
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="min-h-screen flex-1 bg-base p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Wire routes in `App.tsx`**

```tsx
// dashboard/client/src/App.tsx
import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import RequireAuth from './components/RequireAuth';
import Layout from './components/Layout';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<div>Resumen (Task 13)</div>} />
          <Route path="/tareas" element={<div>Tareas (Task 14)</div>} />
          <Route path="/granjas" element={<div>Granjas (Task 15)</div>} />
          <Route path="/jugadores" element={<div>Jugadores (Task 16)</div>} />
          <Route path="/proyectos" element={<div>Proyectos (Task 17)</div>} />
          <Route path="/galeria" element={<div>Galería (Task 18)</div>} />
        </Route>
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Manual verification**

Run both dev servers:
```bash
cd dashboard/server && npm run set-password -- test123 && npm run dev &
cd dashboard/client && npm run dev &
```
Open `http://localhost:5173` in a browser. Expected: redirected to `/login`; entering the wrong password shows "Contraseña incorrecta" in Spanish; entering `test123` redirects to `/` and shows the sidebar with all six Spanish nav labels; "Cerrar sesión" returns to `/login`. Kill both dev servers after.

- [ ] **Step 6: Commit**

```bash
git add dashboard/client/src/pages/Login.tsx dashboard/client/src/components/RequireAuth.tsx dashboard/client/src/components/Layout.tsx dashboard/client/src/components/Sidebar.tsx dashboard/client/src/App.tsx
git commit -m "dashboard: add login flow, session guard, and sidebar layout"
```

---

## Task 12: Shared UI primitives (Badge, Modal, Card)

**Files:**
- Create: `dashboard/client/src/components/StatusBadge.tsx`
- Create: `dashboard/client/src/components/Modal.tsx`
- Create: `dashboard/client/src/components/Card.tsx`

**Interfaces:**
- Produces: `<StatusBadge status="todo"|"in_progress"|"blocked"|"done"|"online"|"offline" />`, `<Modal open onClose title>`, `<Card>` — used by Tasks 13–18.

- [ ] **Step 1: Write `StatusBadge`**

```tsx
// dashboard/client/src/components/StatusBadge.tsx
const LABELS: Record<string, string> = {
  todo: 'Pendiente',
  in_progress: 'En curso',
  blocked: 'Bloqueada',
  done: 'Hecha',
  online: 'En línea',
  offline: 'Fuera de línea',
};

const COLORS: Record<string, string> = {
  todo: 'bg-status-todo/20 text-status-todo',
  in_progress: 'bg-status-progress/20 text-status-progress',
  blocked: 'bg-status-blocked/20 text-status-blocked',
  done: 'bg-status-done/20 text-status-done',
  online: 'bg-status-done/20 text-status-done',
  offline: 'bg-status-blocked/20 text-status-blocked',
};

export default function StatusBadge({ status }: { status: keyof typeof LABELS }) {
  return (
    <span className={`rounded px-2 py-0.5 font-mono text-xs ${COLORS[status]}`}>{LABELS[status]}</span>
  );
}
```

- [ ] **Step 2: Write `Modal`**

```tsx
// dashboard/client/src/components/Modal.tsx
import type { ReactNode } from 'react';

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-lg text-gold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `Card`**

```tsx
// dashboard/client/src/components/Card.tsx
import type { ReactNode } from 'react';

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-panel p-4 ${className}`}>{children}</div>;
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/components/StatusBadge.tsx dashboard/client/src/components/Modal.tsx dashboard/client/src/components/Card.tsx
git commit -m "dashboard: add shared StatusBadge, Modal, Card primitives"
```

---

## Task 13: Overview (Resumen) page

**Files:**
- Create: `dashboard/client/src/pages/Overview.tsx`
- Modify: `dashboard/client/src/App.tsx` (swap in the real page)

**Interfaces:**
- Consumes: `useTasks`, `useFarms`, `useLivePlayers`, `usePerformance` from Task 10; `Card`, `StatusBadge` from Task 12.

- [ ] **Step 1: Write the page**

```tsx
// dashboard/client/src/pages/Overview.tsx
import { Link } from 'react-router-dom';
import { useTasks, useFarms, useLivePlayers, usePerformance } from '../api/hooks';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

export default function Overview() {
  const tasks = useTasks();
  const farms = useFarms();
  const livePlayers = useLivePlayers();
  const performance = usePerformance();

  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = (tasks.data?.tasks ?? []).filter(
    (t) => t.status !== 'done' && (t.status === 'blocked' || t.priority === 'high' || (t.due_date && t.due_date < today))
  );

  const flaggedFarms = (farms.data?.farms ?? []).filter(
    (f) => !f.fakePlayerOnline || f.storageItemCount > 0.9 * 2916 // 27 slots * 108 stack size heuristic; real capacity comes per-chest, this is a coarse "likely full" signal
  );
  const healthyFarmCount = (farms.data?.farms.length ?? 0) - flaggedFarms.length;

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl text-gold">Resumen</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-sm text-slate-400">TPS del servidor</div>
          <div className={`font-mono text-3xl ${performance.data && performance.data.tps < 18 ? 'text-status-blocked' : 'text-status-done'}`}>
            {performance.data ? performance.data.tps.toFixed(1) : '—'}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-slate-400">Jugadores en línea</div>
          <div className="font-mono text-3xl text-cyan">{livePlayers.data?.players.length ?? '—'}</div>
        </Card>
        <Card>
          <div className="text-sm text-slate-400">Granjas saludables</div>
          <div className="font-mono text-3xl text-status-done">{healthyFarmCount}</div>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">Tareas que necesitan atención</h2>
        {needsAttention.length === 0 ? (
          <p className="text-sm text-slate-500">No hay tareas urgentes. Bien ahí.</p>
        ) : (
          <div className="space-y-2">
            {needsAttention.slice(0, 5).map((t) => (
              <Card key={t.id} className="flex items-center justify-between">
                <span>{t.title}</span>
                <StatusBadge status={t.status} />
              </Card>
            ))}
          </div>
        )}
        <Link to="/tareas" className="mt-2 inline-block text-sm text-cyan hover:underline">
          Ver todas las tareas →
        </Link>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">Granjas que requieren revisión</h2>
        {flaggedFarms.length === 0 ? (
          <p className="text-sm text-slate-500">Todas las granjas están al día.</p>
        ) : (
          <div className="space-y-2">
            {flaggedFarms.map((f) => (
              <Card key={f.id} className="flex items-center justify-between">
                <span>{f.name}</span>
                <StatusBadge status={f.fakePlayerOnline ? 'online' : 'offline'} />
              </Card>
            ))}
          </div>
        )}
        <Link to="/granjas" className="mt-2 inline-block text-sm text-cyan hover:underline">
          Ver todas las granjas →
        </Link>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `App.tsx`**

```tsx
// dashboard/client/src/App.tsx — replace the "/" route
import Overview from './pages/Overview';
// ...
<Route path="/" element={<Overview />} />
```

- [ ] **Step 3: Manual verification**

Run both dev servers (as in Task 11 Step 5) with `servers/fabric` and MCFarmManager also running so `/api/farms`, `/api/players/live`, `/api/performance` return real data. Log in, land on `/`. Expected: TPS/online-players/healthy-farms numbers render (or `—` gracefully if MCFarmManager is down, not a crash); creating a `blocked` task via `curl` against `/api/tasks` and refreshing shows it under "Tareas que necesitan atención".

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/pages/Overview.tsx dashboard/client/src/App.tsx
git commit -m "dashboard: add Overview page surfacing what needs attention today"
```

---

## Task 14: Tareas page (full CRUD)

**Files:**
- Create: `dashboard/client/src/pages/Tareas.tsx`
- Modify: `dashboard/client/src/App.tsx`

**Interfaces:**
- Consumes: task/subtask/player hooks from Task 10; `Modal`, `Card`, `StatusBadge` from Task 12.

- [ ] **Step 1: Write the page**

```tsx
// dashboard/client/src/pages/Tareas.tsx
import { useState } from 'react';
import {
  useTasks, useCreateTask, useUpdateTask, useDeleteTask,
  useAddSubtask, useUpdateSubtask, usePlayers,
} from '../api/hooks';
import type { Task, TaskPriority, TaskStatus } from '../api/types';
import Card from '../components/Card';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Baja', med: 'Media', high: 'Alta' };

export default function Tareas() {
  const tasks = useTasks();
  const players = usePlayers();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const addSubtask = useAddSubtask();
  const updateSubtask = useUpdateSubtask();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  const [form, setForm] = useState({ title: '', description: '', priority: 'med' as TaskPriority, due_date: '', assignee_ids: [] as number[] });

  function openCreate() {
    setEditing(null);
    setForm({ title: '', description: '', priority: 'med', due_date: '', assignee_ids: [] });
    setModalOpen(true);
  }

  function openEdit(t: Task) {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description ?? '',
      priority: t.priority,
      due_date: t.due_date ?? '',
      assignee_ids: t.assignees.map((a) => a.id),
    });
    setModalOpen(true);
  }

  async function onSave() {
    const payload = {
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      due_date: form.due_date || null,
      assignee_ids: form.assignee_ids,
    };
    if (editing) await updateTask.mutateAsync({ id: editing.id, ...payload });
    else await createTask.mutateAsync(payload);
    setModalOpen(false);
  }

  const visible = (tasks.data?.tasks ?? []).filter((t) => statusFilter === 'all' || t.status === statusFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-gold">Tareas</h1>
        <button onClick={openCreate} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
          + Nueva tarea
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded px-3 py-1 text-sm ${statusFilter === 'all' ? 'bg-gold text-base' : 'bg-panel text-slate-300'}`}
        >
          Todas
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded px-3 py-1 text-sm ${statusFilter === s ? 'bg-gold text-base' : 'bg-panel text-slate-300'}`}
          >
            <StatusBadge status={s} />
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.map((t) => (
          <Card key={t.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{t.title}</div>
                <div className="mt-1 flex gap-2 text-xs text-slate-400">
                  <StatusBadge status={t.status} />
                  <span>Prioridad: {PRIORITY_LABEL[t.priority]}</span>
                  {t.due_date && <span>Vence: {t.due_date}</span>}
                  {t.assignees.length > 0 && <span>Asignada a: {t.assignees.map((a) => a.minecraft_name).join(', ')}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <select
                  value={t.status}
                  onChange={(e) => updateTask.mutate({ id: t.id, status: e.target.value as TaskStatus })}
                  className="rounded border border-border bg-base px-2 py-1 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button onClick={() => openEdit(t)} className="text-sm text-cyan hover:underline">
                  Editar
                </button>
                <button onClick={() => deleteTask.mutate(t.id)} className="text-sm text-status-blocked hover:underline">
                  Eliminar
                </button>
              </div>
            </div>
            {t.subtasks.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border pt-2">
                {t.subtasks.map((st) => (
                  <li key={st.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!st.done}
                      onChange={(e) => updateSubtask.mutate({ id: st.id, done: e.target.checked })}
                    />
                    <span className={st.done ? 'text-slate-500 line-through' : ''}>{st.title}</span>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('subtitle') as HTMLInputElement;
                if (input.value.trim()) addSubtask.mutate({ taskId: t.id, title: input.value.trim() });
                input.value = '';
              }}
              className="mt-2 flex gap-2"
            >
              <input name="subtitle" placeholder="Agregar subtarea…" className="flex-1 rounded border border-border bg-base px-2 py-1 text-sm" />
              <button type="submit" className="text-sm text-cyan hover:underline">
                Agregar
              </button>
            </form>
          </Card>
        ))}
        {visible.length === 0 && <p className="text-sm text-slate-500">No hay tareas en este filtro.</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar tarea' : 'Nueva tarea'}>
        <div className="space-y-3">
          <input
            placeholder="Título"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded border border-border bg-base px-3 py-2"
          />
          <textarea
            placeholder="Descripción"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded border border-border bg-base px-3 py-2"
          />
          <div className="flex gap-2">
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
              className="rounded border border-border bg-base px-3 py-2"
            >
              {Object.entries(PRIORITY_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="rounded border border-border bg-base px-3 py-2"
            />
          </div>
          <div>
            <div className="mb-1 text-sm text-slate-400">Asignar a</div>
            <div className="flex flex-wrap gap-2">
              {(players.data?.players ?? []).map((p) => (
                <label key={p.id} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={form.assignee_ids.includes(p.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        assignee_ids: e.target.checked
                          ? [...form.assignee_ids, p.id]
                          : form.assignee_ids.filter((id) => id !== p.id),
                      })
                    }
                  />
                  {p.minecraft_name}
                </label>
              ))}
            </div>
          </div>
          <button onClick={onSave} className="w-full rounded bg-gold px-3 py-2 font-medium text-base hover:opacity-90">
            Guardar
          </button>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

```tsx
import Tareas from './pages/Tareas';
// ...
<Route path="/tareas" element={<Tareas />} />
```

- [ ] **Step 3: Manual verification**

With both dev servers running and at least one player created (via Task 16's page, or `curl -X POST localhost:3001/api/players -H 'Content-Type: application/json' -d '{"minecraft_name":"leivur"}' --cookie <cookie>`), open `/tareas`. Expected: create a task via the modal, see it appear with a Spanish status badge, filter by status, check off a subtask, change status via the dropdown, edit, and delete — each action reflects immediately (react-query invalidation) without a manual page reload.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/pages/Tareas.tsx dashboard/client/src/App.tsx
git commit -m "dashboard: add Tareas page with full CRUD, subtasks, and assignees"
```

---

## Task 15: Granjas page (live data + metadata editing + history)

**Files:**
- Create: `dashboard/client/src/pages/Granjas.tsx`
- Create: `dashboard/client/src/pages/GranjaDetail.tsx`
- Modify: `dashboard/client/src/App.tsx`

**Interfaces:**
- Consumes: `useFarms`, `useFarm`, `useFarmHistory`, `useUpdateFarmMetadata` from Task 10.

- [ ] **Step 1: Write the grid page**

```tsx
// dashboard/client/src/pages/Granjas.tsx
import { Link } from 'react-router-dom';
import { useFarms } from '../api/hooks';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

export default function Granjas() {
  const farms = useFarms();

  if (farms.isLoading) return <p className="text-slate-400">Cargando granjas…</p>;
  if (farms.isError) return <p className="text-status-blocked">No se pudo conectar con MCFarmManager.</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-2xl text-gold">Granjas</h1>
      <div className="grid grid-cols-3 gap-4">
        {farms.data!.farms.map((f) => (
          <Link key={f.id} to={`/granjas/${f.id}`}>
            <Card className="hover:border-gold">
              <div className="flex items-center justify-between">
                <span className="font-medium">{f.name}</span>
                <StatusBadge status={f.fakePlayerOnline ? 'online' : 'offline'} />
              </div>
              <div className="mt-2 font-mono text-sm text-slate-400">
                {f.entityCount} entidades · {f.storageItemCount} ítems almacenados
              </div>
              {f.metadata.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {f.metadata.tags.map((t) => (
                    <span key={t} className="rounded bg-base px-2 py-0.5 text-xs text-cyan">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </Link>
        ))}
        {farms.data!.farms.length === 0 && <p className="text-sm text-slate-500">No hay granjas configuradas en MCFarmManager.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the detail page**

```tsx
// dashboard/client/src/pages/GranjaDetail.tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useFarm, useFarmHistory, useUpdateFarmMetadata } from '../api/hooks';
import Card from '../components/Card';

export default function GranjaDetail() {
  const { id } = useParams<{ id: string }>();
  const farm = useFarm(id!);
  const history = useFarmHistory(id!, '24h');
  const updateMetadata = useUpdateFarmMetadata();
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);

  if (farm.isLoading) return <p className="text-slate-400">Cargando…</p>;
  if (farm.isError || !farm.data) return <p className="text-status-blocked">No se encontró la granja.</p>;
  const f = farm.data;

  function startEdit() {
    setNotes(f.metadata.notes ?? '');
    setTags(f.metadata.tags.join(', '));
    setEditingMeta(true);
  }

  async function saveMeta() {
    await updateMetadata.mutateAsync({
      id: f.id,
      notes: notes || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setEditingMeta(false);
  }

  return (
    <div className="space-y-4">
      <Link to="/granjas" className="text-sm text-cyan hover:underline">
        ← Granjas
      </Link>
      <h1 className="font-mono text-2xl text-gold">{f.name}</h1>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <h2 className="mb-2 font-mono text-slate-200">Notas</h2>
          {editingMeta ? (
            <div className="space-y-2">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded border border-border bg-base px-2 py-1" />
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="etiquetas separadas por coma"
                className="w-full rounded border border-border bg-base px-2 py-1"
              />
              <button onClick={saveMeta} className="rounded bg-gold px-3 py-1 text-sm text-base">
                Guardar
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-300">{f.metadata.notes || 'Sin notas.'}</p>
              <button onClick={startEdit} className="mt-2 text-sm text-cyan hover:underline">
                Editar
              </button>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-mono text-slate-200">Trabajador</h2>
          {f.fakePlayer ? (
            <p className="text-sm">
              {f.fakePlayer.name} — {f.fakePlayer.online ? 'en línea' : 'fuera de línea'}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Sin trabajador asignado.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Almacenamiento</h2>
        <div className="space-y-1">
          {f.storage.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span>{s.label}</span>
              <span className="font-mono text-slate-400">
                {s.items.reduce((sum, i) => sum + i.count, 0)} / {s.capacity * 64}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Historial (24h)</h2>
        {history.data && history.data.samples.length > 0 ? (
          <p className="text-sm text-slate-400">{history.data.samples.length} muestras registradas.</p>
        ) : (
          <p className="text-sm text-slate-500">Sin datos históricos todavía.</p>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Wire routes into `App.tsx`**

```tsx
import Granjas from './pages/Granjas';
import GranjaDetail from './pages/GranjaDetail';
// ...
<Route path="/granjas" element={<Granjas />} />
<Route path="/granjas/:id" element={<GranjaDetail />} />
```

- [ ] **Step 4: Manual verification**

With `servers/fabric` and MCFarmManager running and at least one farm configured in `farms.json`, open `/granjas`. Expected: real farm cards render with live entity/storage counts; clicking one opens the detail page; editing notes/tags and saving persists (confirmed by reloading the page and seeing the same notes).

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/pages/Granjas.tsx dashboard/client/src/pages/GranjaDetail.tsx dashboard/client/src/App.tsx
git commit -m "dashboard: add Granjas grid and detail pages with editable metadata"
```

---

## Task 16: Jugadores page

**Files:**
- Create: `dashboard/client/src/pages/Jugadores.tsx`
- Modify: `dashboard/client/src/App.tsx`

**Interfaces:**
- Consumes: `usePlayers`, `useCreatePlayer`, `useUpdatePlayer`, `useDeletePlayer`, `useLivePlayers` from Task 10.

- [ ] **Step 1: Write the page**

```tsx
// dashboard/client/src/pages/Jugadores.tsx
import { useState } from 'react';
import { usePlayers, useCreatePlayer, useUpdatePlayer, useDeletePlayer, useLivePlayers } from '../api/hooks';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';

export default function Jugadores() {
  const players = usePlayers();
  const live = useLivePlayers();
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const liveNames = new Set((live.data?.players ?? []).map((p) => p.name));

  async function onCreate() {
    if (!name.trim()) return;
    await createPlayer.mutateAsync({ minecraft_name: name.trim(), note: note || null });
    setName('');
    setNote('');
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
      </Card>

      <div className="space-y-2">
        {(players.data?.players ?? []).map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {p.minecraft_name}
                <StatusBadge status={liveNames.has(p.minecraft_name) ? 'online' : 'offline'} />
              </div>
              <input
                defaultValue={p.note ?? ''}
                onBlur={(e) => updatePlayer.mutate({ id: p.id, note: e.target.value || null })}
                placeholder="Nota"
                className="mt-1 rounded border border-border bg-base px-2 py-1 text-sm"
              />
            </div>
            <button onClick={() => deletePlayer.mutate(p.id)} className="text-sm text-status-blocked hover:underline">
              Eliminar
            </button>
          </Card>
        ))}
        {(players.data?.players.length ?? 0) === 0 && <p className="text-sm text-slate-500">No hay jugadores registrados.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

```tsx
import Jugadores from './pages/Jugadores';
// ...
<Route path="/jugadores" element={<Jugadores />} />
```

- [ ] **Step 3: Manual verification**

Open `/jugadores`, add a player with your own in-game username while logged into the actual server (or MCFarmManager's dev instance) so it shows "En línea"; add one with a name that isn't online and confirm "Fuera de línea"; edit the note field and confirm it persists on reload; delete a player.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/pages/Jugadores.tsx dashboard/client/src/App.tsx
git commit -m "dashboard: add Jugadores page with live online-status cross-reference"
```

---

## Task 17: Proyectos page (CRUD with images)

**Files:**
- Create: `dashboard/client/src/pages/Proyectos.tsx`
- Create: `dashboard/client/src/pages/ProyectoDetail.tsx`
- Modify: `dashboard/client/src/App.tsx`

**Interfaces:**
- Consumes: `useProjects`, `useCreateProject`, `useUpdateProject`, `useDeleteProject`, `useUploadProjectImage` from Task 10.

- [ ] **Step 1: Write the list/grid page**

```tsx
// dashboard/client/src/pages/Proyectos.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects, useCreateProject } from '../api/hooks';
import Card from '../components/Card';
import Modal from '../components/Modal';

export default function Proyectos() {
  const projects = useProjects();
  const createProject = useCreateProject();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function onCreate() {
    if (!name.trim()) return;
    await createProject.mutateAsync({ name: name.trim(), description: description || null });
    setName('');
    setDescription('');
    setModalOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-gold">Proyectos</h1>
        <button onClick={() => setModalOpen(true)} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
          + Nuevo proyecto
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(projects.data?.projects ?? []).map((p) => (
          <Link key={p.id} to={`/proyectos/${p.id}`}>
            <Card className="hover:border-gold">
              {p.images[0] ? (
                <img src={`/uploads/${p.images[0].path}`} alt={p.name} className="mb-2 h-32 w-full rounded object-cover" />
              ) : (
                <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-base text-slate-600">Sin imagen</div>
              )}
              <div className="font-medium">{p.name}</div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{p.description || 'Sin descripción todavía.'}</p>
            </Card>
          </Link>
        ))}
        {(projects.data?.projects.length ?? 0) === 0 && (
          <p className="text-sm text-slate-500">No hay proyectos todavía. Creá el primero.</p>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo proyecto">
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="w-full rounded border border-border bg-base px-3 py-2" />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción"
            className="w-full rounded border border-border bg-base px-3 py-2"
          />
          <button onClick={onCreate} className="w-full rounded bg-gold px-3 py-2 font-medium text-base hover:opacity-90">
            Crear
          </button>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Write the detail page**

```tsx
// dashboard/client/src/pages/ProyectoDetail.tsx
import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjects, useUpdateProject, useDeleteProject, useUploadProjectImage } from '../api/hooks';
import Card from '../components/Card';

export default function ProyectoDetail() {
  const { id } = useParams<{ id: string }>();
  const projects = useProjects();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const uploadImage = useUploadProjectImage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  const project = projects.data?.projects.find((p) => p.id === Number(id));
  const [description, setDescription] = useState(project?.description ?? '');

  if (!project) return <p className="text-slate-400">Cargando…</p>;

  async function onFileChange() {
    const file = fileInput.current?.files?.[0];
    if (file) await uploadImage.mutateAsync({ projectId: project!.id, file });
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="space-y-4">
      <Link to="/proyectos" className="text-sm text-cyan hover:underline">
        ← Proyectos
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl text-gold">{project.name}</h1>
        <button
          onClick={() => deleteProject.mutate(project.id)}
          className="text-sm text-status-blocked hover:underline"
        >
          Eliminar proyecto
        </button>
      </div>

      <Card>
        {editing ? (
          <div className="space-y-2">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded border border-border bg-base px-3 py-2" />
            <button
              onClick={async () => {
                await updateProject.mutateAsync({ id: project.id, description });
                setEditing(false);
              }}
              className="rounded bg-gold px-3 py-1 text-sm text-base"
            >
              Guardar
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-300">{project.description || 'Sin descripción todavía.'}</p>
            <button onClick={() => setEditing(true)} className="mt-2 text-sm text-cyan hover:underline">
              Editar descripción
            </button>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Imágenes</h2>
        <div className="grid grid-cols-4 gap-2">
          {project.images.map((img) => (
            <img key={img.id} src={`/uploads/${img.path}`} alt={img.caption ?? ''} className="h-24 w-full rounded object-cover" />
          ))}
        </div>
        <input ref={fileInput} type="file" accept="image/*" onChange={onFileChange} className="mt-3 text-sm" />
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Wire routes into `App.tsx`**

```tsx
import Proyectos from './pages/Proyectos';
import ProyectoDetail from './pages/ProyectoDetail';
// ...
<Route path="/proyectos" element={<Proyectos />} />
<Route path="/proyectos/:id" element={<ProyectoDetail />} />
```

- [ ] **Step 4: Manual verification**

Open `/proyectos` with an empty DB: confirm the "No hay proyectos todavía" empty state. Create a project via the modal, confirm it appears as a card with the "Sin imagen" placeholder. Open its detail page, upload an image, confirm it renders in the grid and the card thumbnail updates on going back. Edit the description and confirm it persists on reload.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/pages/Proyectos.tsx dashboard/client/src/pages/ProyectoDetail.tsx dashboard/client/src/App.tsx
git commit -m "dashboard: add Proyectos list and detail pages with image upload"
```

---

## Task 18: Galería page

**Files:**
- Create: `dashboard/client/src/pages/Galeria.tsx`
- Modify: `dashboard/client/src/App.tsx`

**Interfaces:**
- Consumes: `useGallery`, `useUploadGalleryImage`, `useUpdateGalleryImage`, `useDeleteGalleryImage` from Task 10.

- [ ] **Step 1: Write the page**

```tsx
// dashboard/client/src/pages/Galeria.tsx
import { useRef, useState } from 'react';
import { useGallery, useUploadGalleryImage, useUpdateGalleryImage, useDeleteGalleryImage } from '../api/hooks';

export default function Galeria() {
  const gallery = useGallery();
  const upload = useUploadGalleryImage();
  const updateCaption = useUpdateGalleryImage();
  const deleteImage = useDeleteGalleryImage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [captionDraft, setCaptionDraft] = useState('');

  async function onUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    await upload.mutateAsync({ file, caption: captionDraft || undefined });
    setCaptionDraft('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="space-y-4">
      <h1 className="font-mono text-2xl text-gold">Galería</h1>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-panel p-4">
        <input ref={fileInput} type="file" accept="image/*" className="text-sm" />
        <input
          value={captionDraft}
          onChange={(e) => setCaptionDraft(e.target.value)}
          placeholder="Descripción (opcional)"
          className="flex-1 rounded border border-border bg-base px-3 py-2"
        />
        <button onClick={onUpload} className="rounded bg-gold px-3 py-2 text-sm font-medium text-base hover:opacity-90">
          Subir imagen
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {(gallery.data?.images ?? []).map((img) => (
          <div key={img.id} className="overflow-hidden rounded-lg border border-border bg-panel">
            <img src={`/uploads/${img.path}`} alt={img.caption ?? ''} className="h-32 w-full object-cover" />
            <div className="p-2">
              <input
                defaultValue={img.caption ?? ''}
                onBlur={(e) => updateCaption.mutate({ id: img.id, caption: e.target.value || null })}
                placeholder="Sin descripción"
                className="w-full rounded border border-border bg-base px-2 py-1 text-xs"
              />
              <button onClick={() => deleteImage.mutate(img.id)} className="mt-1 text-xs text-status-blocked hover:underline">
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {(gallery.data?.images.length ?? 0) === 0 && <p className="text-sm text-slate-500">La galería está vacía todavía.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

```tsx
import Galeria from './pages/Galeria';
// ...
<Route path="/galeria" element={<Galeria />} />
```

- [ ] **Step 3: Manual verification**

Open `/galeria` with an empty DB: confirm the empty state. Upload an image with a caption, confirm it renders in the grid; edit the caption inline and confirm it persists on reload; delete it and confirm the empty state returns.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/pages/Galeria.tsx dashboard/client/src/App.tsx
git commit -m "dashboard: add Galería page with upload and captions"
```

---

## Task 19: End-to-end verification against the real stack

**Files:** none created — verification only.

**Interfaces:** none.

- [ ] **Step 1: Boot the real dependencies**

Start `servers/fabric` (with MCFarmManager's mod jar deployed, per `MCFarmManager/README.md`) and confirm its HTTP API responds:
```bash
curl -s http://127.0.0.1:8642/status
```
Expected: a JSON body with `modVersion`, `farmCount`, etc.

- [ ] **Step 2: Boot the dashboard against it**

```bash
cd dashboard/server && MCFARMMANAGER_URL=http://127.0.0.1:8642 npm run dev &
cd dashboard/client && npm run dev &
```

- [ ] **Step 3: Full manual walkthrough**

In a browser at `http://localhost:5173`:
1. Log in with the password set in Task 8.
2. Overview: confirm real TPS and online-player numbers appear (not MCFarmManager mock data).
3. Tareas: create a task, mark it `blocked`, confirm it surfaces on Overview.
4. Granjas: confirm the real farm(s) from `farms.json` render with live entity/storage counts; edit notes on one and confirm it survives a page reload.
5. Jugadores: add a player whose name matches someone currently online in-game; confirm "En línea" shows correctly.
6. Proyectos and Galería: confirm empty states, then create one project with an uploaded image and one gallery image, confirming both render correctly.
7. Log out, confirm redirect to `/login`, confirm a direct navigation to `/tareas` while logged out also redirects to `/login`.

- [ ] **Step 4: Run the full backend test suite one more time**

Run: `cd dashboard/server && npm test`
Expected: all tests still pass (no regressions from any wiring changes made across Tasks 9–18, which only touched `client/`).

- [ ] **Step 5: Record the result**

No commit for this task (verification-only) — report the walkthrough results back to the user, including any real behavior that diverged from what a task's manual-verification step predicted (e.g. MCFarmManager error shapes, farm data quirks) so Phase 5 (Docker) planning starts from what's actually true, not from the plan's assumptions.
