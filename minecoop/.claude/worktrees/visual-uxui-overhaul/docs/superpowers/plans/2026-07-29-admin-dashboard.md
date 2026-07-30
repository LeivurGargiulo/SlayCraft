# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-player login + in-page editing (live for tareas, spec'd but unbuilt for granjas/proyectos) with a single admin-gated dashboard at `/admin`. Players become read-only everywhere; jugadores moves from a static TS array to a Netlify Blobs store so it becomes admin-editable too.

**Architecture:** Two new Netlify Blobs stores complete the set already used by tareas — `granjas`, `proyectos`, and `jugadores` each hold a single JSON array, structurally identical in shape to the existing `tareas` store. A new `/admin/*` route tree, gated by one shared admin password (HMAC-signed session cookie, same primitives `src/lib/auth.ts` already uses — no new crypto), hosts create/edit/delete for all four collections. Every public page becomes pure read-only: no session checks, no forms, no mutation scripts.

**Tech Stack:** Astro 7, `@astrojs/netlify` (already installed), `@netlify/blobs` (already installed), Node built-in `crypto` (HMAC for the admin session cookie, `timingSafeEqual` for the password check — no scrypt needed here, see the Global Constraints note on why). No new dependencies, no new UI framework — Astro server rendering plus small inline `<script>` blocks, matching every existing form on this site.

## Global Constraints

- Node engine floor is `>=22.12.0` (package.json `engines`) — `node --experimental-strip-types` runs self-check scripts directly against `.ts` source, no build step.
- Astro `output` stays `'static'` (the project-wide default) — every route touching a blob or a session opts out individually via `export const prerender = false`.
- No new dependencies.
- Every mutating admin API endpoint (`POST`/`PATCH`/`DELETE` under `src/pages/api/admin/`) must reject non-admin requests with `401` before touching data.
- **Admin password is compared directly, not scrypt-hashed, despite the design spec's "scrypt-hashed" phrasing** — a deliberate simplification made at plan-writing time, flagged here rather than silently: player passcodes were hashed because they lived inside a mutable JSON blob, at rest alongside app data, where a hash limits blast radius if that blob ever leaked. The admin password lives only in one place — a Netlify environment variable already treated as a secret — so a stored hash would just be a second copy of the same secret with no additional protection, while adding a second env var (`ADMIN_PASSWORD_HASH`) and a manual hash-computation step for zero security gain. `src/lib/admin-auth.ts` (Task 1) compares the submitted password against `ADMIN_PASSWORD` with `timingSafeEqual`, same care against timing attacks as the passcode system, without the pointless hashing step.
- **Known lesson from earlier work on this project (do not repeat):** a local `astro dev` (or any script run outside `netlify dev:exec`/`netlify blobs:set`) writes to a *local sandbox* blob store, never the real deployed site's store. Production data for any new blob store must be populated via `netlify blobs:set <store> <key> --input <file>` — proven to work in the granjas/proyectos migration groundwork already done on this project. The local sandbox is a *separate* empty store and must be populated separately (via a temporary local endpoint, deleted after use) for local `astro dev` verification to show real data.
- Site ID for staging deploys: `d1d3b94e-1d27-4c26-8bc4-90e73418341d` (already linked via `netlify link` in earlier work — confirmed present in `.netlify/state.json`).
- Spec reference: `docs/superpowers/specs/2026-07-29-admin-dashboard-design.md`. This plan reuses migration mechanics (the `netlify blobs:set` approach, the extraction-script pattern) proven out in `docs/superpowers/plans/2026-07-28-granjas-proyectos-crud.md`, which is otherwise superseded by this plan.

---

## Task 1: Admin auth — `src/lib/admin-auth.ts`

**Files:**
- Create: `src/lib/admin-auth.ts`
- Create: `scripts/check-admin-auth.mjs`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `getSessionUser`, `setSessionCookie`, `clearSessionCookie` from `src/lib/auth.ts` (existing, unchanged).
- Produces (used by later tasks):
  - `function passwordsMatch(password: string, expected: string): boolean`
  - `function verifyAdminPassword(password: string): boolean`
  - `function isAdmin(cookies: import('astro').APIContext['cookies']): boolean`
  - `function setAdminSession(cookies: import('astro').APIContext['cookies']): void`
  - `function clearAdminSession(cookies: import('astro').APIContext['cookies']): void`

- [ ] **Step 1: Write `src/lib/admin-auth.ts`**

```ts
import { timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';
import { getSessionUser, setSessionCookie, clearSessionCookie } from './auth';

type Cookies = APIContext['cookies'];

const ADMIN_IDENTITY = 'admin';

export function passwordsMatch(password: string, expected: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function getAdminPassword(): string {
  const password = import.meta.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD env var is not set');
  return password;
}

export function verifyAdminPassword(password: string): boolean {
  return passwordsMatch(password, getAdminPassword());
}

export function isAdmin(cookies: Cookies): boolean {
  return getSessionUser(cookies) === ADMIN_IDENTITY;
}

export function setAdminSession(cookies: Cookies): void {
  setSessionCookie(cookies, ADMIN_IDENTITY);
}

export function clearAdminSession(cookies: Cookies): void {
  clearSessionCookie(cookies);
}
```

- [ ] **Step 2: Write the self-check script**

`verifyAdminPassword`/`isAdmin`/`setAdminSession` read `import.meta.env`, a Vite/Astro-only global not available under plain `node --experimental-strip-types` — same reason `scripts/check-auth.mjs` only tests `auth.ts`'s explicit-secret-parameter functions, never `getSessionUser` directly. `passwordsMatch` takes both values as parameters, so it's the one worth testing here.

Create `scripts/check-admin-auth.mjs`:
```js
import assert from 'node:assert';
import { passwordsMatch } from '../src/lib/admin-auth.ts';

assert.ok(passwordsMatch('correct-password', 'correct-password'));
assert.ok(!passwordsMatch('wrong-password', 'correct-password'));
assert.ok(!passwordsMatch('', 'correct-password'));
assert.ok(!passwordsMatch('correct-passwor', 'correct-password'));

console.log('ok: admin-auth checks passed');
```

- [ ] **Step 3: Run the self-check**

Run: `node --experimental-strip-types scripts/check-admin-auth.mjs`
Expected: prints `ok: admin-auth checks passed`.

- [ ] **Step 4: Add the env var**

Edit `.env.example`, adding a second line so it reads:
```
SESSION_SECRET=change-me-to-a-long-random-string
ADMIN_PASSWORD=change-me-to-a-long-random-password
```

Add a real value to your local `.env` (gitignored):
```bash
echo "ADMIN_PASSWORD=$(node -e "console.log(require('node:crypto').randomBytes(16).toString('hex'))")" >> .env
```
Note: once deployed, also set `ADMIN_PASSWORD` in the Netlify site's environment variables (Site settings → Environment variables) to a password you'll actually remember, not the random hex — that env var IS the credential, unlike the local dev value which just needs to exist for testing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-auth.ts scripts/check-admin-auth.mjs .env.example
git commit -m "Add admin session/password verification"
```

(Do not `git add .env` — it must stay untracked.)

---

## Task 2: Data layer — `granjas.ts`, `proyectos.ts`, `jugadores.ts`

**Files:**
- Create: `src/lib/slugify.ts`
- Modify: `src/lib/tareas.ts` (replace its local `slugify` with a re-export — no behavior change)
- Create: `src/lib/granjas.ts`
- Create: `src/lib/proyectos.ts`
- Create: `src/lib/jugadores.ts`
- Create: `scripts/check-granjas.mjs`
- Create: `scripts/check-proyectos.mjs`
- Create: `scripts/check-jugadores.mjs`

**Interfaces:**
- Consumes: `Actividad` type from `src/data/jugadores.ts` (existing, unchanged by this task).
- Produces (used by later tasks):
  - `interface Granja { id: string; title: string; coordinates: string[] }`, `type GranjaInput = Omit<Granja, 'id'>`, `getGranjas`, `createGranja`, `updateGranja`, `deleteGranja`, `parseGranjaInput`, `parseGranjaPatch`.
  - Identical set for `Proyecto`/`proyectos` in `src/lib/proyectos.ts`.
  - `interface Jugador { username: string; actividad: Actividad }`, `type JugadorInput = Jugador`, `async function getJugadores(): Promise<Jugador[]>`, `async function createJugador(input: JugadorInput): Promise<Jugador | null>` (null = username already exists), `async function updateJugador(username: string, patch: Partial<Pick<Jugador, 'actividad'>>): Promise<Jugador | null>`, `async function deleteJugador(username: string): Promise<boolean>`, `function parseJugadorInput(body: unknown): JugadorInput | null`, `function parseJugadorPatch(body: unknown): Partial<Pick<Jugador, 'actividad'>> | null`.

This task only touches library code — no pages, no build-breaking risk.

- [ ] **Step 1: Extract `slugify` into its own module**

Create `src/lib/slugify.ts`:
```ts
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
```

In `src/lib/tareas.ts`, replace the existing `export function slugify(title: string): string { ... }` block with:
```ts
export { slugify } from './slugify';
```
Place this near the top, alongside the other imports.

- [ ] **Step 2: Verify the tareas self-check still passes**

Run: `node --experimental-strip-types scripts/check-tareas.mjs`
Expected: `ok: tareas lib checks passed` (unchanged).

- [ ] **Step 3: Write `src/lib/granjas.ts`**

```ts
import { getStore } from '@netlify/blobs';
import { slugify } from './slugify';

export interface Granja {
  id: string;
  title: string;
  coordinates: string[];
}

export type GranjaInput = Omit<Granja, 'id'>;

const KEY = 'granjas';

function store() {
  return getStore('granjas');
}

export async function getGranjas(): Promise<Granja[]> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Granja[] | null) ?? [];
}

async function saveGranjas(granjas: Granja[]): Promise<void> {
  await store().setJSON(KEY, granjas);
}

export async function createGranja(input: GranjaInput): Promise<Granja> {
  const granjas = await getGranjas();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (granjas.some((g) => g.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const granja: Granja = { ...input, id };
  granjas.push(granja);
  await saveGranjas(granjas);
  return granja;
}

export async function updateGranja(id: string, patch: Partial<GranjaInput>): Promise<Granja | null> {
  const granjas = await getGranjas();
  const index = granjas.findIndex((g) => g.id === id);
  if (index === -1) return null;
  granjas[index] = { ...granjas[index], ...patch };
  await saveGranjas(granjas);
  return granjas[index];
}

export async function deleteGranja(id: string): Promise<boolean> {
  const granjas = await getGranjas();
  const next = granjas.filter((g) => g.id !== id);
  if (next.length === granjas.length) return false;
  await saveGranjas(next);
  return true;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function parseGranjaInput(body: unknown): GranjaInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim() === '') return null;
  if (!isStringArray(b.coordinates)) return null;
  return { title: b.title, coordinates: b.coordinates };
}

export function parseGranjaPatch(body: unknown): Partial<GranjaInput> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<GranjaInput> = {};
  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || b.title.trim() === '') return null;
    patch.title = b.title;
  }
  if (b.coordinates !== undefined) {
    if (!isStringArray(b.coordinates)) return null;
    patch.coordinates = b.coordinates;
  }
  return patch;
}
```

- [ ] **Step 4: Write `src/lib/proyectos.ts`**

Identical to Step 3 with every `Granja`/`granja`/`granjas` renamed to `Proyecto`/`proyecto`/`proyectos`, and `getStore('granjas')` → `getStore('proyectos')`:
```ts
import { getStore } from '@netlify/blobs';
import { slugify } from './slugify';

export interface Proyecto {
  id: string;
  title: string;
  coordinates: string[];
}

export type ProyectoInput = Omit<Proyecto, 'id'>;

const KEY = 'proyectos';

function store() {
  return getStore('proyectos');
}

export async function getProyectos(): Promise<Proyecto[]> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Proyecto[] | null) ?? [];
}

async function saveProyectos(proyectos: Proyecto[]): Promise<void> {
  await store().setJSON(KEY, proyectos);
}

export async function createProyecto(input: ProyectoInput): Promise<Proyecto> {
  const proyectos = await getProyectos();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (proyectos.some((p) => p.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const proyecto: Proyecto = { ...input, id };
  proyectos.push(proyecto);
  await saveProyectos(proyectos);
  return proyecto;
}

export async function updateProyecto(id: string, patch: Partial<ProyectoInput>): Promise<Proyecto | null> {
  const proyectos = await getProyectos();
  const index = proyectos.findIndex((p) => p.id === id);
  if (index === -1) return null;
  proyectos[index] = { ...proyectos[index], ...patch };
  await saveProyectos(proyectos);
  return proyectos[index];
}

export async function deleteProyecto(id: string): Promise<boolean> {
  const proyectos = await getProyectos();
  const next = proyectos.filter((p) => p.id !== id);
  if (next.length === proyectos.length) return false;
  await saveProyectos(next);
  return true;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function parseProyectoInput(body: unknown): ProyectoInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim() === '') return null;
  if (!isStringArray(b.coordinates)) return null;
  return { title: b.title, coordinates: b.coordinates };
}

export function parseProyectoPatch(body: unknown): Partial<ProyectoInput> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<ProyectoInput> = {};
  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || b.title.trim() === '') return null;
    patch.title = b.title;
  }
  if (b.coordinates !== undefined) {
    if (!isStringArray(b.coordinates)) return null;
    patch.coordinates = b.coordinates;
  }
  return patch;
}
```

- [ ] **Step 5: Write `src/lib/jugadores.ts`**

Unlike the other three collections, jugadores has no `slugify`d id — the Minecraft username itself is the unique key, so creation must reject duplicates instead of disambiguating them.

```ts
import { getStore } from '@netlify/blobs';
import type { Actividad } from '../data/jugadores';

export interface Jugador {
  username: string;
  actividad: Actividad;
}

export type JugadorInput = Jugador;

const KEY = 'jugadores';
const ACTIVIDADES: Actividad[] = ['activo', 'ocasional', 'inactivo'];

function store() {
  return getStore('jugadores');
}

export async function getJugadores(): Promise<Jugador[]> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Jugador[] | null) ?? [];
}

async function saveJugadores(jugadores: Jugador[]): Promise<void> {
  await store().setJSON(KEY, jugadores);
}

export async function createJugador(input: JugadorInput): Promise<Jugador | null> {
  const jugadores = await getJugadores();
  if (jugadores.some((j) => j.username === input.username)) return null;
  jugadores.push(input);
  await saveJugadores(jugadores);
  return input;
}

export async function updateJugador(
  username: string,
  patch: Partial<Pick<Jugador, 'actividad'>>
): Promise<Jugador | null> {
  const jugadores = await getJugadores();
  const index = jugadores.findIndex((j) => j.username === username);
  if (index === -1) return null;
  jugadores[index] = { ...jugadores[index], ...patch };
  await saveJugadores(jugadores);
  return jugadores[index];
}

export async function deleteJugador(username: string): Promise<boolean> {
  const jugadores = await getJugadores();
  const next = jugadores.filter((j) => j.username !== username);
  if (next.length === jugadores.length) return false;
  await saveJugadores(next);
  return true;
}

function isActividad(v: unknown): v is Actividad {
  return typeof v === 'string' && (ACTIVIDADES as string[]).includes(v);
}

export function parseJugadorInput(body: unknown): JugadorInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.username !== 'string' || b.username.trim() === '') return null;
  if (!isActividad(b.actividad)) return null;
  return { username: b.username, actividad: b.actividad };
}

export function parseJugadorPatch(body: unknown): Partial<Pick<Jugador, 'actividad'>> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<Pick<Jugador, 'actividad'>> = {};
  if (b.actividad !== undefined) {
    if (!isActividad(b.actividad)) return null;
    patch.actividad = b.actividad;
  }
  return patch;
}
```

- [ ] **Step 6: Write the self-check scripts**

Create `scripts/check-granjas.mjs`:
```js
import assert from 'node:assert';
import { parseGranjaInput, parseGranjaPatch } from '../src/lib/granjas.ts';

const valid = parseGranjaInput({ title: 'Granja de Prueba', coordinates: ['Granja: 0, 0, 0'] });
assert.ok(valid);
assert.strictEqual(valid.title, 'Granja de Prueba');
assert.deepStrictEqual(valid.coordinates, ['Granja: 0, 0, 0']);

assert.strictEqual(parseGranjaInput({ title: '', coordinates: [] }), null);
assert.strictEqual(parseGranjaInput({ title: 'X', coordinates: 'not-an-array' }), null);
assert.strictEqual(parseGranjaInput({ title: 'X', coordinates: [1, 2] }), null);

const patch = parseGranjaPatch({ title: 'Nuevo título' });
assert.deepStrictEqual(patch, { title: 'Nuevo título' });
assert.strictEqual(parseGranjaPatch({ title: '' }), null);
assert.deepStrictEqual(parseGranjaPatch({}), {});

console.log('ok: granjas lib checks passed');
```

Create `scripts/check-proyectos.mjs` — identical structure, importing from `../src/lib/proyectos.ts` and using `parseProyectoInput`/`parseProyectoPatch`:
```js
import assert from 'node:assert';
import { parseProyectoInput, parseProyectoPatch } from '../src/lib/proyectos.ts';

const valid = parseProyectoInput({ title: 'Proyecto de Prueba', coordinates: ['Spawn: 0, 0, 0'] });
assert.ok(valid);
assert.strictEqual(valid.title, 'Proyecto de Prueba');
assert.deepStrictEqual(valid.coordinates, ['Spawn: 0, 0, 0']);

assert.strictEqual(parseProyectoInput({ title: '', coordinates: [] }), null);
assert.strictEqual(parseProyectoInput({ title: 'X', coordinates: 'not-an-array' }), null);
assert.strictEqual(parseProyectoInput({ title: 'X', coordinates: [1, 2] }), null);

const patch = parseProyectoPatch({ title: 'Nuevo título' });
assert.deepStrictEqual(patch, { title: 'Nuevo título' });
assert.strictEqual(parseProyectoPatch({ title: '' }), null);
assert.deepStrictEqual(parseProyectoPatch({}), {});

console.log('ok: proyectos lib checks passed');
```

Create `scripts/check-jugadores.mjs`:
```js
import assert from 'node:assert';
import { parseJugadorInput, parseJugadorPatch } from '../src/lib/jugadores.ts';

const valid = parseJugadorInput({ username: 'TestPlayer', actividad: 'activo' });
assert.ok(valid);
assert.strictEqual(valid.username, 'TestPlayer');
assert.strictEqual(valid.actividad, 'activo');

assert.strictEqual(parseJugadorInput({ username: '', actividad: 'activo' }), null);
assert.strictEqual(parseJugadorInput({ username: 'X', actividad: 'invalido' }), null);
assert.strictEqual(parseJugadorInput({ username: 'X' }), null);

const patch = parseJugadorPatch({ actividad: 'inactivo' });
assert.deepStrictEqual(patch, { actividad: 'inactivo' });
assert.strictEqual(parseJugadorPatch({ actividad: 'invalido' }), null);
assert.deepStrictEqual(parseJugadorPatch({}), {});

console.log('ok: jugadores lib checks passed');
```

- [ ] **Step 7: Run all three new self-checks**

```bash
node --experimental-strip-types scripts/check-granjas.mjs
node --experimental-strip-types scripts/check-proyectos.mjs
node --experimental-strip-types scripts/check-jugadores.mjs
```
Expected: each prints its `ok: ...` line.

- [ ] **Step 8: Commit**

```bash
git add src/lib/slugify.ts src/lib/tareas.ts src/lib/granjas.ts src/lib/proyectos.ts src/lib/jugadores.ts
git add scripts/check-granjas.mjs scripts/check-proyectos.mjs scripts/check-jugadores.mjs
git commit -m "Add granjas/proyectos/jugadores data layer backed by Netlify Blobs"
```

---

## Task 3: Migrate jugadores to Netlify Blobs, cut over every read site

This is the smaller of the two migrations — 15 records, no content-collection or markdown involved, just a static TS array becoming a blob. Moves atomically: by the end, `src/data/jugadores.ts` no longer exports player data, and every page reading it does so from the blob instead.

**Files:**
- Modify: `src/data/jugadores.ts`
- Modify: `src/pages/jugadores.astro`
- Modify: `src/pages/jugadores/[slug].astro`
- Modify: `src/pages/tareas.astro`

**Interfaces:**
- Consumes: `getJugadores`, `Jugador` from `src/lib/jugadores.ts` (Task 2).

- [ ] **Step 1: Write the migration JSON and push it to the real production blob store**

The current 15 entries (from today's `src/data/jugadores.ts`) are small enough to transcribe directly — no extraction script needed, unlike the 46-file markdown migration in Task 4. Write `/tmp/jugadores-migrated.json` (not committed):

```bash
cat > /tmp/jugadores-migrated.json << 'EOF'
[
  {"username":"BadPlayerRQM","actividad":"ocasional"},
  {"username":"batatauw2","actividad":"inactivo"},
  {"username":"Beezywie","actividad":"inactivo"},
  {"username":"BjornViking206","actividad":"inactivo"},
  {"username":"ErickRB","actividad":"ocasional"},
  {"username":"Hiperdragon675","actividad":"inactivo"},
  {"username":"Lautysoldado","actividad":"ocasional"},
  {"username":"RetroGamesWan","actividad":"inactivo"},
  {"username":"SharckAttack323","actividad":"activo"},
  {"username":"SlayerL99","actividad":"activo"},
  {"username":"Syanurix","actividad":"activo"},
  {"username":"ElTano28","actividad":"inactivo"},
  {"username":"TitoBaiso","actividad":"inactivo"},
  {"username":"Tomyrex143","actividad":"inactivo"},
  {"username":"Itorumu","actividad":"ocasional"}
]
EOF
```

Per the Global Constraints' lesson-learned note, push it to the real deployed store:
```bash
npx netlify-cli blobs:set jugadores jugadores --input /tmp/jugadores-migrated.json
```
Expected: `Success: Blob jugadores set in store jugadores`.

- [ ] **Step 2: Shrink `src/data/jugadores.ts`**

Replace the whole file with:
```ts
export type Actividad = 'activo' | 'ocasional' | 'inactivo';

export const ACTIVIDAD_LABELS: Record<Actividad, string> = {
  activo: 'Activo',
  ocasional: 'Ocasional',
  inactivo: 'Inactivo',
};

export function skinBodyUrl(username: string, size = 200) {
  return `https://minotar.net/body/${username}/${size}.png`;
}
```

- [ ] **Step 3: Update `src/pages/jugadores.astro`**

Replace the whole file with:
```astro
---
export const prerender = false;

import BaseLayout from '../layouts/BaseLayout.astro';
import { ACTIVIDAD_LABELS, skinBodyUrl, type Actividad } from '../data/jugadores';
import { getJugadores } from '../lib/jugadores';

const jugadores = await getJugadores();
const groups: Actividad[] = ['activo', 'ocasional', 'inactivo'];
const byActividad = (a: Actividad) =>
  jugadores.filter((j) => j.actividad === a).sort((x, y) => x.username.localeCompare(y.username));
---

<BaseLayout title="Jugadores">
  <h1 class="text-2xl font-semibold">Jugadores</h1>
  <p class="mt-2 text-text-muted">Quién es quién en la cooperativa.</p>

  {
    groups.map((actividad) => {
      const items = byActividad(actividad);
      return (
        items.length > 0 && (
          <section class="mt-8">
            <h2 class="text-lg font-semibold">
              {ACTIVIDAD_LABELS[actividad]} <span class="font-mono text-sm font-normal text-text-muted">({items.length})</span>
            </h2>
            <ul data-stagger class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {items.map(({ username }) => (
                <li>
                  <a href={`/jugadores/${username}`} class="group flex flex-col items-center gap-2">
                    <img
                      src={skinBodyUrl(username, 160)}
                      alt={username}
                      width={160}
                      height={200}
                      loading="lazy"
                      class="w-32 rounded-lg border border-border object-cover transition-all duration-200 group-hover:scale-[1.03] group-hover:border-accent group-hover:shadow-md group-hover:shadow-black/40"
                    />
                    <p class="font-medium">{username}</p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )
      );
    })
  }
</BaseLayout>
```

- [ ] **Step 4: Update `src/pages/jugadores/[slug].astro`**

Replace the whole file with:
```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import RelatedTareas from '../../components/RelatedTareas.astro';
import { getTareas } from '../../lib/tareas';
import { getJugadores } from '../../lib/jugadores';
import { ACTIVIDAD_LABELS, skinBodyUrl } from '../../data/jugadores';

const jugador = (await getJugadores()).find((j) => j.username === Astro.params.slug);
if (!jugador) return new Response('Not found', { status: 404 });
const { username, actividad } = jugador;

const tareas = (await getTareas()).filter(
  (t) => t.assignee?.includes(username) || t.subtareas?.some((s) => s.assignee?.includes(username))
);
---

<BaseLayout title={username}>
  <a href="/jugadores" class="text-sm text-text-muted hover:text-accent">← Jugadores</a>

  <div class="mt-2 flex items-center gap-4">
    <img
      src={skinBodyUrl(username, 240)}
      alt={username}
      width={240}
      height={300}
      class="w-60 rounded-lg border border-border object-cover"
    />
    <div>
      <h1 class="text-2xl font-semibold">{username}</h1>
      <p class="mt-1 text-sm text-text-muted">{ACTIVIDAD_LABELS[actividad]}</p>
    </div>
  </div>

  <RelatedTareas tareas={tareas} />
</BaseLayout>
```

- [ ] **Step 5: Update `src/pages/tareas.astro`'s jugadores usage**

`tareas.astro` currently imports `JUGADORES` for two purposes: the assignee autocomplete list (`jugadoresList`, passed to `TareaForm`) and the "is this a known player" check that decides whether an assignee renders as a link (`jugadoresSet`). Replace:
```astro
import { JUGADORES } from '../data/jugadores';
```
with:
```astro
import { getJugadores } from '../lib/jugadores';
```
And replace:
```astro
const jugadoresList = JUGADORES.map((j) => j.username);
```
with:
```astro
const jugadoresList = (await getJugadores()).map((j) => j.username);
```
And replace:
```astro
const jugadoresSet: Set<string> = new Set(JUGADORES.map((j) => j.username));
```
with:
```astro
const jugadoresSet: Set<string> = new Set(jugadoresList);
```
(Reuses the already-fetched list instead of calling `getJugadores()` twice.)

- [ ] **Step 6: Populate the local sandbox too**

Step 1 wrote to the *production* blob store; `astro dev`'s local emulation is a separate, empty sandbox. Create a temporary, uncommitted endpoint:

`src/pages/api/admin/migrate-jugadores.ts`:
```ts
import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';
import { readFileSync } from 'node:fs';

export const prerender = false;

export const GET: APIRoute = async () => {
  const jugadores = JSON.parse(readFileSync('/tmp/jugadores-migrated.json', 'utf8'));
  await getStore('jugadores').setJSON('jugadores', jugadores);
  return Response.json({ jugadores: jugadores.length });
};
```

Run `astro dev --background`, then:
```bash
curl http://localhost:4321/api/admin/migrate-jugadores
```
Expected: `{"jugadores":15}`. Delete the temporary endpoint:
```bash
rm src/pages/api/admin/migrate-jugadores.ts
rmdir src/pages/api/admin 2>/dev/null || true
```

- [ ] **Step 7: Verify via `astro dev`**

With the dev server still running (restart with `astro dev --background` if stopped — deleting the temp endpoint file doesn't clear the blob data already written):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/jugadores
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/jugadores/TitoBaiso
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/tareas
```
Expected: `200` for all three. Open `/jugadores` in a browser, confirm the same 15 players grouped by actividad as before. Open `/tareas`, confirm assignee `@usernames` still link correctly for known players. Stop with `astro dev stop`.

- [ ] **Step 8: Verify a full local build succeeds**

Run: `astro build`
Expected: succeeds — every page touched in this task is `prerender = false`.

- [ ] **Step 9: Commit**

```bash
git add src/data/jugadores.ts src/pages/jugadores.astro "src/pages/jugadores/[slug].astro" src/pages/tareas.astro
git commit -m "Migrate jugadores from static data to Netlify Blobs"
```

---

## Task 4: Migrate granjas/proyectos to Netlify Blobs, cut over every read site

Same reasoning as Task 3, larger scope: by the end, the `granjas`/`proyectos` content collections have `title`/`coordinates` stripped from every markdown file (images untouched), both blobs are populated in production, and every page reading granja/proyecto titles — including three spots inside `tareas.astro` that aren't obvious from the page's own name — reads from the blob instead of the collection.

**Files:**
- Modify: `src/content.config.ts`
- Modify: all 33 files under `src/content/granjas/*.md` (strip `title`/`coordinates`, keep `images`)
- Modify: all 13 files under `src/content/proyectos/*.md` (same)
- Modify: `src/pages/granjas/index.astro`
- Modify: `src/pages/proyectos/index.astro`
- Modify: `src/pages/granjas/[slug].astro`
- Modify: `src/pages/proyectos/[slug].astro`
- Modify: `src/components/ItemCard.astro`
- Modify: `src/pages/tareas.astro`

**Interfaces:**
- Consumes: `getGranjas` from `src/lib/granjas.ts`, `getProyectos` from `src/lib/proyectos.ts` (Task 2).

- [ ] **Step 1: Write and run a one-off extraction script**

Not committed — a one-time local tool, deleted after use. Write `/tmp/migrate-granjas-proyectos.mjs`:
```js
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import yaml from 'js-yaml';

function extract(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  return files.map((file) => {
    const raw = readFileSync(`${dir}/${file}`, 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    const fm = yaml.load(match[1]);
    const id = file.replace(/\.md$/, '');
    return { id, title: fm.title, coordinates: fm.coordinates ?? [] };
  });
}

const granjas = extract('src/content/granjas');
const proyectos = extract('src/content/proyectos');

writeFileSync('/tmp/granjas-migrated.json', JSON.stringify(granjas));
writeFileSync('/tmp/proyectos-migrated.json', JSON.stringify(proyectos));
console.log('granjas:', granjas.length, 'proyectos:', proyectos.length);
```

Run: `node /tmp/migrate-granjas-proyectos.mjs`
Expected: `granjas: 33 proyectos: 13`

- [ ] **Step 2: Sanity-check the extracted data**

```bash
node -e "
const g = require('/tmp/granjas-migrated.json');
const p = require('/tmp/proyectos-migrated.json');
console.log('sample granja:', JSON.stringify(g[0]));
console.log('sample proyecto:', JSON.stringify(p[0]));
console.log('unique granja ids:', new Set(g.map(x=>x.id)).size, '/', g.length);
console.log('unique proyecto ids:', new Set(p.map(x=>x.id)).size, '/', p.length);
"
```
Expected: unique-id counts match totals (33/33, 13/13), both samples show real `title`/`coordinates`.

- [ ] **Step 3: Push both JSON files into the real production blob stores**

```bash
npx netlify-cli blobs:set granjas granjas --input /tmp/granjas-migrated.json
npx netlify-cli blobs:set proyectos proyectos --input /tmp/proyectos-migrated.json
```
Expected: `Success: Blob granjas set in store granjas` and the same for `proyectos`.

- [ ] **Step 4: Strip `title`/`coordinates` from every markdown file**

Write `/tmp/strip-granjas-proyectos-frontmatter.mjs` (not committed):
```js
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import yaml from 'js-yaml';

function stripFields(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const path = `${dir}/${file}`;
    const raw = readFileSync(path, 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const fm = yaml.load(match[1]);
    const rest = match[2] ?? '';
    const newFrontmatter = yaml.dump({ images: fm.images });
    writeFileSync(path, `---\n${newFrontmatter}---\n${rest}`);
  }
  console.log(`stripped ${files.length} files in ${dir}`);
}

stripFields('src/content/granjas');
stripFields('src/content/proyectos');
```

Run: `node /tmp/strip-granjas-proyectos-frontmatter.mjs`
Expected: `stripped 33 files in src/content/granjas` and `stripped 13 files in src/content/proyectos`

- [ ] **Step 5: Spot-check a couple of stripped files**

```bash
cat src/content/granjas/granja-ghast.md
cat src/content/proyectos/zona-industrial.md
```
Expected: only an `images:` list in frontmatter — no `title`, no `coordinates`. (If these exact filenames don't exist, `ls src/content/granjas src/content/proyectos` and pick any two.)

- [ ] **Step 6: Update `src/content.config.ts`**

Replace the whole file with:
```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const proyectos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/proyectos' }),
  schema: ({ image }) =>
    z.object({
      images: z.array(image()).min(1),
    }),
});

const granjas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/granjas' }),
  schema: ({ image }) =>
    z.object({
      images: z.array(image()).min(1),
    }),
});

export const collections = { proyectos, granjas };
```

- [ ] **Step 7: Update `src/pages/granjas/[slug].astro`**

Replace the whole file with:
```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import CoordList from '../../components/CoordList.astro';
import Gallery from '../../components/Gallery.astro';
import RelatedTareas from '../../components/RelatedTareas.astro';
import { getEntry } from 'astro:content';
import { getTareas } from '../../lib/tareas';
import { getGranjas } from '../../lib/granjas';

const granja = (await getGranjas()).find((g) => g.id === Astro.params.slug);
if (!granja) return new Response('Not found', { status: 404 });

const imageEntry = await getEntry('granjas', granja.id);

const tareas = (await getTareas()).filter((t) => t.granjas?.includes(granja.id));
---

<BaseLayout title={granja.title}>
  <a href="/granjas" class="text-sm text-text-muted hover:text-accent">← Granjas</a>

  <h1 class="mt-2 text-2xl font-semibold">{granja.title}</h1>

  {imageEntry && (
    <div class="mt-6">
      <Gallery images={imageEntry.data.images} alt={granja.title} />
    </div>
  )}

  <div class="mt-8">
    <CoordList coordinates={granja.coordinates} />
  </div>

  <RelatedTareas tareas={tareas} />
</BaseLayout>
```

- [ ] **Step 8: Update `src/pages/proyectos/[slug].astro`**

Replace the whole file with:
```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import CoordList from '../../components/CoordList.astro';
import Gallery from '../../components/Gallery.astro';
import RelatedTareas from '../../components/RelatedTareas.astro';
import { getEntry } from 'astro:content';
import { getTareas } from '../../lib/tareas';
import { getProyectos } from '../../lib/proyectos';

const proyecto = (await getProyectos()).find((p) => p.id === Astro.params.slug);
if (!proyecto) return new Response('Not found', { status: 404 });

const imageEntry = await getEntry('proyectos', proyecto.id);

const tareas = (await getTareas()).filter((t) => t.proyectos?.includes(proyecto.id));
---

<BaseLayout title={proyecto.title}>
  <a href="/proyectos" class="text-sm text-text-muted hover:text-accent">← Proyectos</a>

  <h1 class="mt-2 text-2xl font-semibold">{proyecto.title}</h1>

  {imageEntry && (
    <div class="mt-6">
      <Gallery images={imageEntry.data.images} alt={proyecto.title} />
    </div>
  )}

  <div class="mt-8">
    <CoordList coordinates={proyecto.coordinates} />
  </div>

  <RelatedTareas tareas={tareas} />
</BaseLayout>
```

- [ ] **Step 9: Update `src/pages/granjas/index.astro`**

Replace the whole file with:
```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import ItemCard from '../../components/ItemCard.astro';
import { getEntry } from 'astro:content';
import { getGranjas } from '../../lib/granjas';

const rawGranjas = (await getGranjas()).sort((a, b) => a.title.localeCompare(b.title));
const granjas = await Promise.all(
  rawGranjas.map(async (g) => {
    const entry = await getEntry('granjas', g.id);
    return { granja: g, image: entry?.data.images[0] };
  })
);
---

<BaseLayout title="Granjas">
  <h1 class="text-2xl font-semibold">Granjas</h1>
  <p class="mt-2 text-text-muted">Granjas automáticas del servidor.</p>

  <ul data-stagger class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
    {
      granjas.map(({ granja, image }) => (
        <li>
          <ItemCard href={`/granjas/${granja.id}`} image={image} alt={granja.title} title={granja.title} />
        </li>
      ))
    }
  </ul>
</BaseLayout>
```

- [ ] **Step 10: Update `src/pages/proyectos/index.astro`**

Replace the whole file with:
```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import ItemCard from '../../components/ItemCard.astro';
import { getEntry } from 'astro:content';
import { getProyectos } from '../../lib/proyectos';

const rawProyectos = (await getProyectos()).sort((a, b) => a.title.localeCompare(b.title));
const proyectos = await Promise.all(
  rawProyectos.map(async (p) => {
    const entry = await getEntry('proyectos', p.id);
    return { proyecto: p, image: entry?.data.images[0] };
  })
);
---

<BaseLayout title="Proyectos">
  <h1 class="text-2xl font-semibold">Proyectos</h1>
  <p class="mt-2 text-text-muted">Construcciones y estructuras del servidor.</p>

  <ul data-stagger class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
    {
      proyectos.map(({ proyecto, image }) => (
        <li>
          <ItemCard href={`/proyectos/${proyecto.id}`} image={image} alt={proyecto.title} title={proyecto.title} />
        </li>
      ))
    }
  </ul>
</BaseLayout>
```

- [ ] **Step 11: Update `src/components/ItemCard.astro` to accept an optional image**

Replace the whole file with:
```astro
---
import { Image } from 'astro:assets';

interface Props {
  href: string;
  image?: ImageMetadata;
  alt: string;
  title: string;
}
const { href, image, alt, title } = Astro.props;
---

<a
  href={href}
  class="group block overflow-hidden rounded-lg border border-border bg-surface transition-all hover:border-accent hover:shadow-md hover:shadow-black/40"
>
  {image ? (
    <Image
      src={image}
      alt={alt}
      class="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
    />
  ) : (
    <div class="aspect-[4/3] w-full bg-surface-2" aria-hidden="true" />
  )}
  <p class="p-2 text-sm font-medium">{title}</p>
</a>
```

- [ ] **Step 12: Update `src/pages/tareas.astro`'s granja/proyecto usage**

`tareas.astro` reads granja/proyecto titles in three places: the `allGranjas`/`allProyectos` dropdown options passed to `TareaForm`, and, for each tarea, the "linked granjas/proyectos" chips built via `getEntry`. All three currently read `.data.title` from the content collection, which no longer has a `title` field after Step 6 — this must be cut over in the same commit as the schema change or the page breaks.

Replace:
```astro
import { getEntry, getCollection } from 'astro:content';
import { JUGADORES } from '../data/jugadores';
import { getTareas, type Tarea } from '../lib/tareas';
import { getSessionUser } from '../lib/auth';
import TareaForm from '../components/TareaForm.astro';

const sessionUser = getSessionUser(Astro.cookies);

const jugadoresList = (await getJugadores()).map((j) => j.username);
const allGranjas = (await getCollection('granjas')).map((g) => ({ id: g.id, title: g.data.title }));
const allProyectos = (await getCollection('proyectos')).map((p) => ({ id: p.id, title: p.data.title }));

const jugadoresSet: Set<string> = new Set(jugadoresList);

const rawTareas = await getTareas();

const tareas = await Promise.all(
  rawTareas.map(async (t) => ({
    tarea: t,
    proyectos: t.proyectos
      ? (await Promise.all(t.proyectos.map((id) => getEntry('proyectos', id)))).filter((p) => p !== undefined)
      : [],
    granjas: t.granjas
      ? (await Promise.all(t.granjas.map((id) => getEntry('granjas', id)))).filter((g) => g !== undefined)
      : [],
  }))
);
```
with:
```astro
import { getJugadores } from '../lib/jugadores';
import { getTareas, type Tarea } from '../lib/tareas';
import { getGranjas } from '../lib/granjas';
import { getProyectos } from '../lib/proyectos';
import { getSessionUser } from '../lib/auth';
import TareaForm from '../components/TareaForm.astro';

const sessionUser = getSessionUser(Astro.cookies);

const jugadoresList = (await getJugadores()).map((j) => j.username);
const jugadoresSet: Set<string> = new Set(jugadoresList);

const allGranjas = (await getGranjas()).map((g) => ({ id: g.id, title: g.title }));
const allProyectos = (await getProyectos()).map((p) => ({ id: p.id, title: p.title }));
const granjaTitles = new Map(allGranjas.map((g) => [g.id, g.title]));
const proyectoTitles = new Map(allProyectos.map((p) => [p.id, p.title]));

const rawTareas = await getTareas();

const tareas = rawTareas.map((t) => ({
  tarea: t,
  proyectos: (t.proyectos ?? [])
    .filter((id) => proyectoTitles.has(id))
    .map((id) => ({ id, title: proyectoTitles.get(id)! })),
  granjas: (t.granjas ?? [])
    .filter((id) => granjaTitles.has(id))
    .map((id) => ({ id, title: granjaTitles.get(id)! })),
}));
```
(`getEntry`/`getCollection` from `astro:content` are no longer used anywhere in this file — the import is dropped entirely, not just trimmed.)

Further down, replace the `proyectoOptions` computation:
```astro
const proyectoOptions = [
  ...new Map(tareas.flatMap((t) => t.proyectos.map((p) => [p.id, p.data.title]))),
].sort((a, b) => a[1].localeCompare(b[1]));
```
with:
```astro
const proyectoOptions = [
  ...new Map(tareas.flatMap((t) => t.proyectos.map((p) => [p.id, p.title]))),
].sort((a, b) => a[1].localeCompare(b[1]));
```

In the template, inside the "linked granjas/proyectos" chips block, replace:
```astro
{proyectos.map((p) => (
  <a
    href={`/proyectos/${p.id}`}
    class="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text transition-colors hover:border-accent hover:text-accent"
  >
    {p.data.title}
  </a>
))}
{granjas.map((g) => (
  <a
    href={`/granjas/${g.id}`}
    class="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text transition-colors hover:border-accent hover:text-accent"
  >
    {g.data.title}
  </a>
))}
```
with:
```astro
{proyectos.map((p) => (
  <a
    href={`/proyectos/${p.id}`}
    class="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text transition-colors hover:border-accent hover:text-accent"
  >
    {p.title}
  </a>
))}
{granjas.map((g) => (
  <a
    href={`/granjas/${g.id}`}
    class="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text transition-colors hover:border-accent hover:text-accent"
  >
    {g.title}
  </a>
))}
```

- [ ] **Step 13: Populate the local sandbox too**

Create `src/pages/api/admin/migrate-granjas-proyectos.ts` (temporary, not committed):
```ts
import type { APIRoute } from 'astro';
import { getStore } from '@netlify/blobs';
import { readFileSync } from 'node:fs';

export const prerender = false;

export const GET: APIRoute = async () => {
  const granjas = JSON.parse(readFileSync('/tmp/granjas-migrated.json', 'utf8'));
  const proyectos = JSON.parse(readFileSync('/tmp/proyectos-migrated.json', 'utf8'));
  await getStore('granjas').setJSON('granjas', granjas);
  await getStore('proyectos').setJSON('proyectos', proyectos);
  return Response.json({ granjas: granjas.length, proyectos: proyectos.length });
};
```

Run `astro dev --background`, then:
```bash
curl http://localhost:4321/api/admin/migrate-granjas-proyectos
```
Expected: `{"granjas":33,"proyectos":13}`. Delete the temp endpoint:
```bash
rm src/pages/api/admin/migrate-granjas-proyectos.ts
rmdir src/pages/api/admin 2>/dev/null || true
```

- [ ] **Step 14: Verify via `astro dev` with real local data**

Restart with `astro dev --background` if stopped (deleting the temp endpoint doesn't clear the blob data):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/granjas
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/proyectos
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/tareas
```
Expected: `200` for all three. Open `/granjas` and `/proyectos` in a browser, confirm titles/images render (same 33/13 entries). Open `/tareas`, confirm any tarea with linked granjas/proyectos still shows its chip labels correctly (not blank). Stop with `astro dev stop`.

- [ ] **Step 15: Verify a full local build succeeds**

Run: `astro build`
Expected: succeeds — no page in this task reads a blob at prerender time.

- [ ] **Step 16: Commit**

```bash
git add src/content.config.ts src/content/granjas src/content/proyectos
git add src/pages/granjas src/pages/proyectos src/components/ItemCard.astro src/pages/tareas.astro
git commit -m "Migrate granjas/proyectos title+coordinates to Netlify Blobs"
```

---

## Task 5: Admin login, logout, and overview pages

**Files:**
- Create: `src/pages/admin/login.astro`
- Create: `src/pages/api/admin/login.ts`
- Create: `src/pages/api/admin/logout.ts`
- Create: `src/pages/admin/index.astro`

**Interfaces:**
- Consumes: `isAdmin`, `verifyAdminPassword`, `setAdminSession`, `clearAdminSession` from `src/lib/admin-auth.ts` (Task 1); `getTareas` from `src/lib/tareas.ts`; `getGranjas`, `getProyectos`, `getJugadores` from Task 2.

- [ ] **Step 1: Write `src/pages/admin/login.astro`**

```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import { isAdmin } from '../../lib/admin-auth';

if (isAdmin(Astro.cookies)) return Astro.redirect('/admin');

const error = Astro.url.searchParams.get('error');
---

<BaseLayout title="Admin · Iniciar sesión">
  <h1 class="text-2xl font-semibold">Panel de administración</h1>
  {error && <p class="mt-2 text-sm text-red-500">Clave incorrecta.</p>}
  <form method="POST" action="/api/admin/login" class="mt-4 flex max-w-sm flex-col gap-3">
    <label class="flex flex-col gap-1 text-sm">
      Clave
      <input type="password" name="password" required class="rounded border border-border bg-surface px-2 py-1.5" />
    </label>
    <button type="submit" class="mt-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg">Entrar</button>
  </form>
</BaseLayout>
```

- [ ] **Step 2: Write `src/pages/api/admin/login.ts`**

```ts
import type { APIRoute } from 'astro';
import { verifyAdminPassword, setAdminSession } from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');

  if (!verifyAdminPassword(password)) {
    return redirect('/admin/login?error=1');
  }

  setAdminSession(cookies);
  return redirect('/admin');
};
```

- [ ] **Step 3: Write `src/pages/api/admin/logout.ts`**

```ts
import type { APIRoute } from 'astro';
import { clearAdminSession } from '../../../lib/admin-auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearAdminSession(cookies);
  return redirect('/admin/login');
};
```

- [ ] **Step 4: Write `src/pages/admin/index.astro`**

```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import { isAdmin } from '../../lib/admin-auth';
import { getTareas } from '../../lib/tareas';
import { getGranjas } from '../../lib/granjas';
import { getProyectos } from '../../lib/proyectos';
import { getJugadores } from '../../lib/jugadores';

if (!isAdmin(Astro.cookies)) return Astro.redirect('/admin/login');

const [tareas, granjas, proyectos, jugadores] = await Promise.all([
  getTareas(),
  getGranjas(),
  getProyectos(),
  getJugadores(),
]);

const sections = [
  { href: '/admin/tareas', label: 'Tareas', count: tareas.length },
  { href: '/admin/granjas', label: 'Granjas', count: granjas.length },
  { href: '/admin/proyectos', label: 'Proyectos', count: proyectos.length },
  { href: '/admin/jugadores', label: 'Jugadores', count: jugadores.length },
];
---

<BaseLayout title="Admin">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-semibold">Panel de administración</h1>
    <form method="POST" action="/api/admin/logout">
      <button type="submit" class="text-sm text-accent hover:underline">Cerrar sesión</button>
    </form>
  </div>

  <ul class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
    {sections.map((s) => (
      <li>
        <a
          href={s.href}
          class="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
        >
          <p class="text-2xl font-semibold">{s.count}</p>
          <p class="text-sm text-text-muted">{s.label}</p>
        </a>
      </li>
    ))}
  </ul>
</BaseLayout>
```

- [ ] **Step 5: Manual verification**

Run `astro dev --background`. Visit `/admin` — confirm redirect to `/admin/login`. Submit the wrong password — confirm redirect to `/admin/login?error=1` with the error message shown. Submit the correct password (the value you put in local `.env`'s `ADMIN_PASSWORD` in Task 1) — confirm redirect to `/admin` showing four section tiles with real counts (35 tareas, 33 granjas, 13 proyectos, 15 jugadores, assuming Tasks 3–4 already ran). Click "Cerrar sesión" — confirm redirect to `/admin/login`, and that visiting `/admin` again redirects back to login. Stop with `astro dev stop`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/login.astro src/pages/api/admin/login.ts src/pages/api/admin/logout.ts src/pages/admin/index.astro
git commit -m "Add admin login, logout, and dashboard overview"
```

---

## Task 6: Admin tareas section, strip public edit UI

**Files:**
- Create: `src/pages/api/admin/tareas/index.ts`
- Create: `src/pages/api/admin/tareas/[id].ts`
- Create: `src/pages/admin/tareas.astro`
- Modify: `src/pages/tareas.astro`
- Delete: `src/pages/api/tareas/index.ts`
- Delete: `src/pages/api/tareas/[id].ts`

**Interfaces:**
- Consumes: `createTarea`, `updateTarea`, `deleteTarea`, `parseTareaInput`, `parseTareaPatch`, `Tarea` from `src/lib/tareas.ts`; `isAdmin` from `src/lib/admin-auth.ts`; the existing `TareaForm` component (`src/components/TareaForm.astro`, unchanged — its props were never player-specific).

- [ ] **Step 1: Write `src/pages/api/admin/tareas/index.ts`**

```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { createTarea, parseTareaInput } from '../../../../lib/tareas';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseTareaInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const tarea = await createTarea(input);
  return Response.json(tarea, { status: 201 });
};
```

- [ ] **Step 2: Write `src/pages/api/admin/tareas/[id].ts`**

```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { updateTarea, deleteTarea, parseTareaPatch } from '../../../../lib/tareas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseTareaPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const tarea = await updateTarea(params.id!, patch);
  if (!tarea) return new Response('Tarea no encontrada', { status: 404 });
  return Response.json(tarea);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteTarea(params.id!);
  if (!deleted) return new Response('Tarea no encontrada', { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Delete the old player-gated tareas API**

```bash
rm src/pages/api/tareas/index.ts "src/pages/api/tareas/[id].ts"
rmdir src/pages/api/tareas 2>/dev/null || true
```

- [ ] **Step 4: Write `src/pages/admin/tareas.astro`**

No filters, no priority color-coding — this is a working list for the one admin, not the public-facing display. Reuses `TareaForm` as-is (its props — `jugadores`, `granjaOptions`, `proyectoOptions` — were always plain strings/objects, never player-session-aware).

```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import TareaForm from '../../components/TareaForm.astro';
import { isAdmin } from '../../lib/admin-auth';
import { getTareas } from '../../lib/tareas';
import { getGranjas } from '../../lib/granjas';
import { getProyectos } from '../../lib/proyectos';
import { getJugadores } from '../../lib/jugadores';

if (!isAdmin(Astro.cookies)) return Astro.redirect('/admin/login');

const tareas = (await getTareas()).sort((a, b) => a.priority - b.priority);
const jugadoresList = (await getJugadores()).map((j) => j.username);
const granjaOptions = (await getGranjas()).map((g) => ({ id: g.id, title: g.title }));
const proyectoOptions = (await getProyectos()).map((p) => ({ id: p.id, title: p.title }));

const statusLabels: Record<string, string> = { pendiente: 'Pendiente', 'en-progreso': 'En progreso' };
---

<BaseLayout title="Admin · Tareas">
  <a href="/admin" class="text-sm text-text-muted hover:text-accent">← Admin</a>
  <h1 class="mt-2 text-2xl font-semibold">
    Tareas <span class="font-mono text-sm font-normal text-text-muted">({tareas.length})</span>
  </h1>

  <details class="mt-4 rounded border border-border p-3">
    <summary class="cursor-pointer text-sm font-medium">+ Nueva tarea</summary>
    <div class="mt-3">
      <TareaForm mode="create" jugadores={jugadoresList} granjaOptions={granjaOptions} proyectoOptions={proyectoOptions} />
    </div>
  </details>

  <ul class="mt-6 flex flex-col divide-y divide-border border-t border-b border-border">
    {tareas.map((t) => (
      <li class="py-3">
        <div class="flex flex-wrap items-center gap-2">
          <p class="font-medium uppercase">{t.title}</p>
          <span class="text-xs text-text-muted">{statusLabels[t.status]} · Prioridad {t.priority}</span>
        </div>
        {t.assignee && t.assignee.length > 0 && (
          <p class="mt-0.5 font-mono text-sm text-text-muted">{t.assignee.map((a) => `@${a}`).join(' ')}</p>
        )}
        <div class="mt-2 flex items-center gap-3">
          <details>
            <summary class="cursor-pointer text-xs text-accent">Editar</summary>
            <div class="mt-2">
              <TareaForm mode="edit" tarea={t} jugadores={jugadoresList} granjaOptions={granjaOptions} proyectoOptions={proyectoOptions} />
            </div>
          </details>
          <button type="button" data-delete-tarea data-id={t.id} class="text-xs text-red-500 hover:underline">
            Eliminar
          </button>
        </div>
      </li>
    ))}
    {tareas.length === 0 && <li class="py-3 text-sm text-text-muted">Sin tareas.</li>}
  </ul>
</BaseLayout>

<script>
  function reloadAfterWrite() {
    // ponytail: same eventual-consistency heuristic used elsewhere for Netlify Blobs.
    setTimeout(() => location.reload(), 1500);
  }

  function readSubtareas(form) {
    return Array.from(form.querySelectorAll('[data-subtarea-row]'))
      .map((row) => ({
        title: row.querySelector('[name="subtarea_title"]').value.trim(),
        done: row.querySelector('[name="subtarea_done"]').checked,
        assignee: row.querySelector('[name="subtarea_assignee"]').value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((s) => s.title);
  }

  function buildPayload(form) {
    const title = form.querySelector('[name="title"]').value.trim();
    const status = form.querySelector('[name="status"]').value;
    const priority = Number(form.querySelector('[name="priority"]').value);
    const assignee = form.querySelector('[name="assignee"]').value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const notes = form.querySelector('[name="notes"]').value;
    const granjas = Array.from(form.querySelectorAll('[name="granjas"] option:checked')).map((o) => o.value);
    const proyectos = Array.from(form.querySelectorAll('[name="proyectos"] option:checked')).map((o) => o.value);
    const subtareas = readSubtareas(form);
    return { title, status, priority, assignee, notes, granjas, proyectos, subtareas };
  }

  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('[data-add-subtarea]');
    if (addBtn) {
      const wrapper = addBtn.parentElement;
      const template = wrapper?.querySelector('[data-subtarea-template]');
      const container = wrapper?.querySelector('[data-subtareas-container]');
      if (template && container) {
        container.appendChild(template.content.cloneNode(true));
      }
      return;
    }

    const removeBtn = e.target.closest('[data-remove-subtarea]');
    if (removeBtn) {
      removeBtn.closest('[data-subtarea-row]')?.remove();
      return;
    }

    const deleteBtn = e.target.closest('[data-delete-tarea]');
    if (deleteBtn) {
      if (!confirm('¿Eliminar esta tarea?')) return;
      fetch(`/api/admin/tareas/${deleteBtn.dataset.id}`, { method: 'DELETE' }).then((res) => {
        if (res.ok) reloadAfterWrite();
        else alert('Error al eliminar la tarea.');
      });
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-tarea-form]');
    if (!form) return;
    e.preventDefault();
    const payload = buildPayload(form);
    const mode = form.dataset.mode;
    const url = mode === 'create' ? '/api/admin/tareas' : `/api/admin/tareas/${form.dataset.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(
      (res) => {
        if (res.ok) reloadAfterWrite();
        else alert('Error al guardar la tarea.');
      }
    );
  });
</script>
```

Note: this `<script>` has no `data-astro-rerun`, matching the established fix on the public tareas page (`document`-level listeners must attach exactly once, not re-stack on soft navigation).

- [ ] **Step 5: Strip session/edit UI from the public `src/pages/tareas.astro`**

Replace the whole file with the read-only version — same filters, same listing/grouping/priority display as today, no login link, no forms, no edit/delete controls, no `TareaForm` import, no `getSessionUser` import:

```astro
---
export const prerender = false;

import BaseLayout from '../layouts/BaseLayout.astro';
import { getJugadores } from '../lib/jugadores';
import { getTareas, type Tarea } from '../lib/tareas';
import { getGranjas } from '../lib/granjas';
import { getProyectos } from '../lib/proyectos';

const jugadoresList = (await getJugadores()).map((j) => j.username);
const jugadoresSet: Set<string> = new Set(jugadoresList);

const allGranjas = (await getGranjas()).map((g) => ({ id: g.id, title: g.title }));
const allProyectos = (await getProyectos()).map((p) => ({ id: p.id, title: p.title }));
const granjaTitles = new Map(allGranjas.map((g) => [g.id, g.title]));
const proyectoTitles = new Map(allProyectos.map((p) => [p.id, p.title]));

const rawTareas = await getTareas();

const tareas = rawTareas.map((t) => ({
  tarea: t,
  proyectos: (t.proyectos ?? [])
    .filter((id) => proyectoTitles.has(id))
    .map((id) => ({ id, title: proyectoTitles.get(id)! })),
  granjas: (t.granjas ?? [])
    .filter((id) => granjaTitles.has(id))
    .map((id) => ({ id, title: granjaTitles.get(id)! })),
}));

const priorityLabels: Record<number, string> = { 1: 'Muy Alta', 2: 'Alta', 3: 'Media', 4: 'Baja', 5: 'Muy Baja' };
const priorityBorderClass: Record<number, string> = {
  1: 'border-priority-muy-alta',
  2: 'border-priority-alta',
  3: 'border-priority-media',
  4: 'border-priority-baja',
  5: 'border-priority-muy-baja',
};
const priorityBorderLeftClass: Record<number, string> = {
  1: 'border-l-priority-muy-alta',
  2: 'border-l-priority-alta',
  3: 'border-l-priority-media',
  4: 'border-l-priority-baja',
  5: 'border-l-priority-muy-baja',
};
const priorityTextClass: Record<number, string> = {
  1: 'text-priority-muy-alta',
  2: 'text-priority-alta',
  3: 'text-priority-media',
  4: 'text-priority-baja',
  5: 'text-priority-muy-baja',
};

const groups: { key: 'pendiente' | 'en-progreso'; label: string }[] = [
  { key: 'pendiente', label: 'Pendiente' },
  { key: 'en-progreso', label: 'En Progreso' },
];

const assigneeOptions = [
  ...new Set(
    tareas.flatMap((t) => [
      ...(t.tarea.assignee ?? []),
      ...(t.tarea.subtareas?.flatMap((s) => s.assignee ?? []) ?? []),
    ])
  ),
].sort((a, b) => a.localeCompare(b));

const proyectoOptions = [
  ...new Map(tareas.flatMap((t) => t.proyectos.map((p) => [p.id, p.title]))),
].sort((a, b) => a[1].localeCompare(b[1]));

const priorityOptions = Object.entries(priorityLabels).sort((a, b) => Number(a[0]) - Number(b[0]));
---

<BaseLayout title="Tareas">
  <h1 class="text-2xl font-semibold">Tareas</h1>
  <p class="mt-2 text-text-muted">Lista de pendientes del servidor.</p>

  <div class="mt-4 flex flex-wrap gap-3">
    <select id="filter-jugador" class="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text">
      <option value="">Jugador: todos</option>
      {assigneeOptions.map((a) => <option value={a}>@{a}</option>)}
    </select>
    <select id="filter-priority" class="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text">
      <option value="">Prioridad: todas</option>
      {priorityOptions.map(([value, label]) => <option value={value}>{label}</option>)}
    </select>
    <select id="filter-proyecto" class="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text">
      <option value="">Proyecto: todos</option>
      {proyectoOptions.map(([id, title]) => <option value={id}>{title}</option>)}
    </select>
  </div>

  {
    groups.map((group) => {
      const items = tareas
        .filter((t) => t.tarea.status === group.key && t.tarea.priority > 0)
        .sort((a, b) => a.tarea.priority - b.tarea.priority);
      return (
        <section class="mt-8">
          <h2 class="text-lg font-semibold">
            {group.label} <span class="font-mono text-sm font-normal text-text-muted">({items.length})</span>
          </h2>
          {items.length === 0 ? (
            <p class="mt-2 text-sm text-text-muted">Sin tareas.</p>
          ) : (
            <ul data-tareas-list data-stagger class="mt-3 flex flex-col divide-y divide-border border-t border-b border-border">
              {items.map(({ tarea: t, proyectos, granjas }) => (
                <li
                  class:list={['flex items-start gap-3 border-l-2 py-3 pl-3', priorityBorderLeftClass[t.priority]]}
                  data-priority={t.priority}
                  data-assignees={[...(t.assignee ?? []), ...(t.subtareas?.flatMap((s) => s.assignee ?? []) ?? [])].join(' ')}
                  data-proyectos={proyectos.map((p) => p.id).join(' ')}
                >
                  <span class="mt-0.5 font-mono text-text-muted" aria-hidden="true">
                    ☐
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-medium uppercase">{t.title}</p>
                      <span
                        class:list={[
                          'rounded-full border px-2 py-0.5 text-xs font-medium',
                          priorityBorderClass[t.priority],
                          priorityTextClass[t.priority],
                        ]}
                      >
                        {priorityLabels[t.priority]}
                      </span>
                    </div>
                    {t.assignee && (
                      <p class="mt-0.5 text-sm text-text-muted">
                        <span class="font-mono">
                          {t.assignee.map((a, i) => (
                            <>
                              {i > 0 && ' '}
                              {jugadoresSet.has(a) ? (
                                <a href={`/jugadores/${a}`} class="hover:text-accent hover:underline">
                                  @{a}
                                </a>
                              ) : (
                                <>@{a}</>
                              )}
                            </>
                          ))}
                        </span>
                      </p>
                    )}
                    {t.notes && <p class="mt-1 text-sm text-text-muted">{t.notes}</p>}

                    {(proyectos.length > 0 || granjas.length > 0) && (
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        {proyectos.map((p) => (
                          <a
                            href={`/proyectos/${p.id}`}
                            class="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text transition-colors hover:border-accent hover:text-accent"
                          >
                            {p.title}
                          </a>
                        ))}
                        {granjas.map((g) => (
                          <a
                            href={`/granjas/${g.id}`}
                            class="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text transition-colors hover:border-accent hover:text-accent"
                          >
                            {g.title}
                          </a>
                        ))}
                      </div>
                    )}

                    {t.subtareas && t.subtareas.length > 0 && (
                      <ul class="mt-2 flex flex-col gap-1 border-l border-border pl-3">
                        {t.subtareas.map((s) => (
                          <li class="flex items-center gap-2 text-sm">
                            <span class="font-mono text-text-muted" aria-hidden="true">
                              {s.done ? '☑' : '☐'}
                            </span>
                            <span class:list={['uppercase', s.done && 'text-text-muted line-through']}>{s.title}</span>
                            {s.assignee && (
                              <span class="font-mono text-xs text-text-muted">
                                {s.assignee.map((a, i) => (
                                  <>
                                    {i > 0 && ' '}
                                    {jugadoresSet.has(a) ? (
                                      <a href={`/jugadores/${a}`} class="hover:text-accent hover:underline">
                                        @{a}
                                      </a>
                                    ) : (
                                      <>@{a}</>
                                    )}
                                  </>
                                ))}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
              <li data-empty-placeholder class="hidden py-3 text-sm text-text-muted">Sin resultados para estos filtros.</li>
            </ul>
          )}
        </section>
      );
    })
  }
</BaseLayout>

<script data-astro-rerun>
  const jugadorSelect = document.getElementById('filter-jugador');
  const prioritySelect = document.getElementById('filter-priority');
  const proyectoSelect = document.getElementById('filter-proyecto');

  function applyFilters() {
    const jugador = jugadorSelect.value;
    const priority = prioritySelect.value;
    const proyecto = proyectoSelect.value;

    document.querySelectorAll('ul[data-tareas-list]').forEach((ul) => {
      let visibleCount = 0;
      ul.querySelectorAll('li[data-priority]').forEach((li) => {
        const assignees = li.dataset.assignees?.split(' ') ?? [];
        const proyectos = li.dataset.proyectos?.split(' ') ?? [];
        const visible =
          (!jugador || assignees.includes(jugador)) &&
          (!priority || li.dataset.priority === priority) &&
          (!proyecto || proyectos.includes(proyecto));
        li.classList.toggle('hidden', !visible);
        if (visible) visibleCount++;
      });
      ul.querySelector('[data-empty-placeholder]')?.classList.toggle('hidden', visibleCount > 0);
    });
  }

  jugadorSelect.addEventListener('change', applyFilters);
  prioritySelect.addEventListener('change', applyFilters);
  proyectoSelect.addEventListener('change', applyFilters);
</script>
```

- [ ] **Step 6: Verify via `astro dev`**

Run `astro dev --background`. Visit `/tareas` — confirm the listing and filters render exactly as before, with zero login link, zero edit/delete controls, zero "+ Nueva tarea". Log in at `/admin/login`, visit `/admin/tareas` — confirm the same tareas appear, expand "+ Nueva tarea", create one, confirm it appears after the page reloads; expand "Editar" on it, change its status, confirm the change sticks; click "Eliminar", confirm it's removed. Confirm unauthenticated requests to the new endpoints are rejected:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4321/api/admin/tareas
```
Expected: `401` (or `403` from Astro's own CSRF origin-check on a bare `curl` with no matching `Origin` header — already-known, expected behavior, not a bug). Stop with `astro dev stop`.

- [ ] **Step 7: Verify a full local build succeeds**

Run: `astro build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/pages/api/admin/tareas src/pages/admin/tareas.astro src/pages/tareas.astro
git add src/pages/api/tareas
git commit -m "Add admin tareas section, strip public edit UI"
```

---

## Task 7: Admin granjas/proyectos section

**Files:**
- Create: `src/pages/api/admin/granjas/index.ts`
- Create: `src/pages/api/admin/granjas/[id].ts`
- Create: `src/pages/api/admin/proyectos/index.ts`
- Create: `src/pages/api/admin/proyectos/[id].ts`
- Create: `src/components/GranjaForm.astro`
- Create: `src/components/ProyectoForm.astro`
- Create: `src/pages/admin/granjas.astro`
- Create: `src/pages/admin/proyectos.astro`

**Interfaces:**
- Consumes: `createGranja`, `updateGranja`, `deleteGranja`, `parseGranjaInput`, `parseGranjaPatch`, `Granja` from `src/lib/granjas.ts`; the `Proyecto` equivalents from `src/lib/proyectos.ts`; `isAdmin` from `src/lib/admin-auth.ts`.

- [ ] **Step 1: Write `src/pages/api/admin/granjas/index.ts`**

```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { createGranja, parseGranjaInput } from '../../../../lib/granjas';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseGranjaInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const granja = await createGranja(input);
  return Response.json(granja, { status: 201 });
};
```

- [ ] **Step 2: Write `src/pages/api/admin/granjas/[id].ts`**

```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { updateGranja, deleteGranja, parseGranjaPatch } from '../../../../lib/granjas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseGranjaPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const granja = await updateGranja(params.id!, patch);
  if (!granja) return new Response('Granja no encontrada', { status: 404 });
  return Response.json(granja);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteGranja(params.id!);
  if (!deleted) return new Response('Granja no encontrada', { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Write `src/pages/api/admin/proyectos/index.ts`**

```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { createProyecto, parseProyectoInput } from '../../../../lib/proyectos';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseProyectoInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const proyecto = await createProyecto(input);
  return Response.json(proyecto, { status: 201 });
};
```

- [ ] **Step 4: Write `src/pages/api/admin/proyectos/[id].ts`**

```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { updateProyecto, deleteProyecto, parseProyectoPatch } from '../../../../lib/proyectos';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseProyectoPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const proyecto = await updateProyecto(params.id!, patch);
  if (!proyecto) return new Response('Proyecto no encontrado', { status: 404 });
  return Response.json(proyecto);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteProyecto(params.id!);
  if (!deleted) return new Response('Proyecto no encontrado', { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 5: Write `src/components/GranjaForm.astro`**

Coordinates as one per line in a plain textarea — each is a flat string, no dynamic add/remove-row UI needed.

```astro
---
import type { Granja } from '../lib/granjas';

interface Props {
  mode: 'create' | 'edit';
  granja?: Granja;
}
const { mode, granja } = Astro.props;
---

<form data-granja-form data-mode={mode} data-id={granja?.id ?? ''} class="flex flex-col gap-3 rounded border border-border p-3">
  <label class="flex flex-col gap-1 text-sm">
    Título
    <input name="title" required value={granja?.title ?? ''} class="rounded border border-border bg-surface px-2 py-1.5" />
  </label>

  <label class="flex flex-col gap-1 text-sm">
    Coordenadas (una por línea)
    <textarea
      name="coordinates"
      rows="3"
      placeholder="Granja: 0, 0, 0"
      class="rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm"
    >{(granja?.coordinates ?? []).join('\n')}</textarea>
  </label>

  <div class="mt-1 flex gap-2">
    <button type="submit" class="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg">
      {mode === 'create' ? 'Crear granja' : 'Guardar cambios'}
    </button>
  </div>
</form>
```

- [ ] **Step 6: Write `src/components/ProyectoForm.astro`**

Identical structure, `proyecto`/`Proyecto` naming, `data-proyecto-form`:
```astro
---
import type { Proyecto } from '../lib/proyectos';

interface Props {
  mode: 'create' | 'edit';
  proyecto?: Proyecto;
}
const { mode, proyecto } = Astro.props;
---

<form data-proyecto-form data-mode={mode} data-id={proyecto?.id ?? ''} class="flex flex-col gap-3 rounded border border-border p-3">
  <label class="flex flex-col gap-1 text-sm">
    Título
    <input name="title" required value={proyecto?.title ?? ''} class="rounded border border-border bg-surface px-2 py-1.5" />
  </label>

  <label class="flex flex-col gap-1 text-sm">
    Coordenadas (una por línea)
    <textarea
      name="coordinates"
      rows="3"
      placeholder="Spawn: 0, 0, 0"
      class="rounded border border-border bg-surface px-2 py-1.5 font-mono text-sm"
    >{(proyecto?.coordinates ?? []).join('\n')}</textarea>
  </label>

  <div class="mt-1 flex gap-2">
    <button type="submit" class="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg">
      {mode === 'create' ? 'Crear proyecto' : 'Guardar cambios'}
    </button>
  </div>
</form>
```

- [ ] **Step 7: Write `src/pages/admin/granjas.astro`**

```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import GranjaForm from '../../components/GranjaForm.astro';
import { isAdmin } from '../../lib/admin-auth';
import { getGranjas } from '../../lib/granjas';

if (!isAdmin(Astro.cookies)) return Astro.redirect('/admin/login');

const granjas = (await getGranjas()).sort((a, b) => a.title.localeCompare(b.title));
---

<BaseLayout title="Admin · Granjas">
  <a href="/admin" class="text-sm text-text-muted hover:text-accent">← Admin</a>
  <h1 class="mt-2 text-2xl font-semibold">
    Granjas <span class="font-mono text-sm font-normal text-text-muted">({granjas.length})</span>
  </h1>

  <details class="mt-4 rounded border border-border p-3">
    <summary class="cursor-pointer text-sm font-medium">+ Nueva granja</summary>
    <div class="mt-3">
      <GranjaForm mode="create" />
    </div>
  </details>

  <ul class="mt-6 flex flex-col divide-y divide-border border-t border-b border-border">
    {granjas.map((g) => (
      <li class="py-3">
        <p class="font-medium">{g.title}</p>
        <div class="mt-2 flex items-center gap-3">
          <details>
            <summary class="cursor-pointer text-xs text-accent">Editar</summary>
            <div class="mt-2">
              <GranjaForm mode="edit" granja={g} />
            </div>
          </details>
          <button type="button" data-delete-granja data-id={g.id} class="text-xs text-red-500 hover:underline">
            Eliminar
          </button>
        </div>
      </li>
    ))}
    {granjas.length === 0 && <li class="py-3 text-sm text-text-muted">Sin granjas.</li>}
  </ul>
</BaseLayout>

<script>
  function reloadAfterWrite() {
    setTimeout(() => location.reload(), 1500);
  }

  function buildPayload(form) {
    const title = form.querySelector('[name="title"]').value.trim();
    const coordinates = form.querySelector('[name="coordinates"]').value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return { title, coordinates };
  }

  document.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete-granja]');
    if (deleteBtn) {
      if (!confirm('¿Eliminar esta granja?')) return;
      fetch(`/api/admin/granjas/${deleteBtn.dataset.id}`, { method: 'DELETE' }).then((res) => {
        if (res.ok) reloadAfterWrite();
        else alert('Error al eliminar la granja.');
      });
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-granja-form]');
    if (!form) return;
    e.preventDefault();
    const payload = buildPayload(form);
    const mode = form.dataset.mode;
    const url = mode === 'create' ? '/api/admin/granjas' : `/api/admin/granjas/${form.dataset.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(
      (res) => {
        if (res.ok) reloadAfterWrite();
        else alert('Error al guardar la granja.');
      }
    );
  });
</script>
```

- [ ] **Step 8: Write `src/pages/admin/proyectos.astro`**

Same structure, `proyecto`/`Proyecto` naming:
```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import ProyectoForm from '../../components/ProyectoForm.astro';
import { isAdmin } from '../../lib/admin-auth';
import { getProyectos } from '../../lib/proyectos';

if (!isAdmin(Astro.cookies)) return Astro.redirect('/admin/login');

const proyectos = (await getProyectos()).sort((a, b) => a.title.localeCompare(b.title));
---

<BaseLayout title="Admin · Proyectos">
  <a href="/admin" class="text-sm text-text-muted hover:text-accent">← Admin</a>
  <h1 class="mt-2 text-2xl font-semibold">
    Proyectos <span class="font-mono text-sm font-normal text-text-muted">({proyectos.length})</span>
  </h1>

  <details class="mt-4 rounded border border-border p-3">
    <summary class="cursor-pointer text-sm font-medium">+ Nuevo proyecto</summary>
    <div class="mt-3">
      <ProyectoForm mode="create" />
    </div>
  </details>

  <ul class="mt-6 flex flex-col divide-y divide-border border-t border-b border-border">
    {proyectos.map((p) => (
      <li class="py-3">
        <p class="font-medium">{p.title}</p>
        <div class="mt-2 flex items-center gap-3">
          <details>
            <summary class="cursor-pointer text-xs text-accent">Editar</summary>
            <div class="mt-2">
              <ProyectoForm mode="edit" proyecto={p} />
            </div>
          </details>
          <button type="button" data-delete-proyecto data-id={p.id} class="text-xs text-red-500 hover:underline">
            Eliminar
          </button>
        </div>
      </li>
    ))}
    {proyectos.length === 0 && <li class="py-3 text-sm text-text-muted">Sin proyectos.</li>}
  </ul>
</BaseLayout>

<script>
  function reloadAfterWrite() {
    setTimeout(() => location.reload(), 1500);
  }

  function buildPayload(form) {
    const title = form.querySelector('[name="title"]').value.trim();
    const coordinates = form.querySelector('[name="coordinates"]').value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return { title, coordinates };
  }

  document.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete-proyecto]');
    if (deleteBtn) {
      if (!confirm('¿Eliminar este proyecto?')) return;
      fetch(`/api/admin/proyectos/${deleteBtn.dataset.id}`, { method: 'DELETE' }).then((res) => {
        if (res.ok) reloadAfterWrite();
        else alert('Error al eliminar el proyecto.');
      });
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-proyecto-form]');
    if (!form) return;
    e.preventDefault();
    const payload = buildPayload(form);
    const mode = form.dataset.mode;
    const url = mode === 'create' ? '/api/admin/proyectos' : `/api/admin/proyectos/${form.dataset.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(
      (res) => {
        if (res.ok) reloadAfterWrite();
        else alert('Error al guardar el proyecto.');
      }
    );
  });
</script>
```

- [ ] **Step 9: Verify via `astro dev`**

Run `astro dev --background`. Log in at `/admin/login`. Visit `/admin/granjas`, create one, edit its title, delete it — confirm each step reflects after reload. Repeat for `/admin/proyectos`. Confirm `/granjas` and `/proyectos` (public) show no create/edit/delete controls, unaffected. Stop with `astro dev stop`.

- [ ] **Step 10: Verify a full local build succeeds**

Run: `astro build`
Expected: succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/pages/api/admin/granjas src/pages/api/admin/proyectos
git add src/components/GranjaForm.astro src/components/ProyectoForm.astro
git add src/pages/admin/granjas.astro src/pages/admin/proyectos.astro
git commit -m "Add admin granjas/proyectos section"
```

---

## Task 8: Admin jugadores section, remove old player-login system

**Files:**
- Create: `src/pages/api/admin/jugadores/index.ts`
- Create: `src/pages/api/admin/jugadores/[id].ts`
- Create: `src/components/JugadorForm.astro`
- Create: `src/pages/admin/jugadores.astro`
- Delete: `src/pages/login.astro`
- Delete: `src/pages/api/login.ts`
- Delete: `src/pages/api/logout.ts`
- Delete: `src/lib/players.ts`
- Delete: `scripts/set-passcode.mjs`

**Interfaces:**
- Consumes: `createJugador`, `updateJugador`, `deleteJugador`, `parseJugadorInput`, `parseJugadorPatch`, `Jugador` from `src/lib/jugadores.ts`; `ACTIVIDAD_LABELS` from `src/data/jugadores.ts`; `isAdmin` from `src/lib/admin-auth.ts`.

- [ ] **Step 1: Write `src/pages/api/admin/jugadores/index.ts`**

Unlike the other three collections, a duplicate `username` is a real conflict (not auto-disambiguated), so this returns `409` instead of always succeeding.

```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { createJugador, parseJugadorInput } from '../../../../lib/jugadores';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseJugadorInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const jugador = await createJugador(input);
  if (!jugador) return new Response('El jugador ya existe', { status: 409 });
  return Response.json(jugador, { status: 201 });
};
```

- [ ] **Step 2: Write `src/pages/api/admin/jugadores/[id].ts`**

The route param is named `id` for consistency with the other three collections' route files, but its value is the jugador's `username` (jugadores have no separate slug id).

```ts
import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { updateJugador, deleteJugador, parseJugadorPatch } from '../../../../lib/jugadores';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseJugadorPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const jugador = await updateJugador(params.id!, patch);
  if (!jugador) return new Response('Jugador no encontrado', { status: 404 });
  return Response.json(jugador);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteJugador(params.id!);
  if (!deleted) return new Response('Jugador no encontrado', { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Write `src/components/JugadorForm.astro`**

Username is only editable at creation — it's the record's key, not a patchable field.

```astro
---
import type { Jugador } from '../lib/jugadores';
import { ACTIVIDAD_LABELS, type Actividad } from '../data/jugadores';

interface Props {
  mode: 'create' | 'edit';
  jugador?: Jugador;
}
const { mode, jugador } = Astro.props;
const actividades: Actividad[] = ['activo', 'ocasional', 'inactivo'];
---

<form data-jugador-form data-mode={mode} data-username={jugador?.username ?? ''} class="flex flex-col gap-3 rounded border border-border p-3">
  <label class="flex flex-col gap-1 text-sm">
    Usuario (Minecraft)
    <input
      name="username"
      required
      value={jugador?.username ?? ''}
      readonly={mode === 'edit'}
      class="rounded border border-border bg-surface px-2 py-1.5 read-only:opacity-60"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm">
    Actividad
    <select name="actividad" class="rounded border border-border bg-surface px-2 py-1.5">
      {actividades.map((a) => (
        <option value={a} selected={(jugador?.actividad ?? 'activo') === a}>{ACTIVIDAD_LABELS[a]}</option>
      ))}
    </select>
  </label>

  <div class="mt-1 flex gap-2">
    <button type="submit" class="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg">
      {mode === 'create' ? 'Crear jugador' : 'Guardar cambios'}
    </button>
  </div>
</form>
```

- [ ] **Step 4: Write `src/pages/admin/jugadores.astro`**

```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import JugadorForm from '../../components/JugadorForm.astro';
import { isAdmin } from '../../lib/admin-auth';
import { getJugadores } from '../../lib/jugadores';
import { ACTIVIDAD_LABELS } from '../../data/jugadores';

if (!isAdmin(Astro.cookies)) return Astro.redirect('/admin/login');

const jugadores = (await getJugadores()).sort((a, b) => a.username.localeCompare(b.username));
---

<BaseLayout title="Admin · Jugadores">
  <a href="/admin" class="text-sm text-text-muted hover:text-accent">← Admin</a>
  <h1 class="mt-2 text-2xl font-semibold">
    Jugadores <span class="font-mono text-sm font-normal text-text-muted">({jugadores.length})</span>
  </h1>

  <details class="mt-4 rounded border border-border p-3">
    <summary class="cursor-pointer text-sm font-medium">+ Nuevo jugador</summary>
    <div class="mt-3">
      <JugadorForm mode="create" />
    </div>
  </details>

  <ul class="mt-6 flex flex-col divide-y divide-border border-t border-b border-border">
    {jugadores.map((j) => (
      <li class="flex items-center justify-between gap-3 py-3">
        <div>
          <p class="font-medium">{j.username}</p>
          <p class="text-xs text-text-muted">{ACTIVIDAD_LABELS[j.actividad]}</p>
        </div>
        <div class="flex items-center gap-3">
          <details>
            <summary class="cursor-pointer text-xs text-accent">Editar</summary>
            <div class="mt-2">
              <JugadorForm mode="edit" jugador={j} />
            </div>
          </details>
          <button type="button" data-delete-jugador data-username={j.username} class="text-xs text-red-500 hover:underline">
            Eliminar
          </button>
        </div>
      </li>
    ))}
    {jugadores.length === 0 && <li class="py-3 text-sm text-text-muted">Sin jugadores.</li>}
  </ul>
</BaseLayout>

<script>
  function reloadAfterWrite() {
    setTimeout(() => location.reload(), 1500);
  }

  document.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete-jugador]');
    if (deleteBtn) {
      if (!confirm('¿Eliminar este jugador?')) return;
      fetch(`/api/admin/jugadores/${encodeURIComponent(deleteBtn.dataset.username)}`, { method: 'DELETE' }).then(
        (res) => {
          if (res.ok) reloadAfterWrite();
          else alert('Error al eliminar el jugador.');
        }
      );
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-jugador-form]');
    if (!form) return;
    e.preventDefault();
    const username = form.querySelector('[name="username"]').value.trim();
    const actividad = form.querySelector('[name="actividad"]').value;
    const mode = form.dataset.mode;
    const url =
      mode === 'create'
        ? '/api/admin/jugadores'
        : `/api/admin/jugadores/${encodeURIComponent(form.dataset.username)}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';
    const body = mode === 'create' ? { username, actividad } : { actividad };
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
      (res) => {
        if (res.ok) reloadAfterWrite();
        else alert('Error al guardar el jugador.');
      }
    );
  });
</script>
```

- [ ] **Step 5: Remove the old player-login system**

```bash
rm src/pages/login.astro src/pages/api/login.ts src/pages/api/logout.ts src/lib/players.ts scripts/set-passcode.mjs
```
The `players` Netlify Blobs store (per-player passcode hashes) is left in place, unused — inert once nothing reads it, not worth a one-off deletion step.

- [ ] **Step 6: Verify via `astro dev`**

Run `astro dev --background`. Confirm `/login` now 404s (the page no longer exists). Log in at `/admin/login`, visit `/admin/jugadores`, create a test jugador, confirm it appears; expand "Editar", change its actividad, confirm the change sticks (username field shows read-only); click "Eliminar", confirm removal. Confirm the public `/jugadores` and `/jugadores/<username>` pages still work for real players, unaffected. Stop with `astro dev stop`.

- [ ] **Step 7: Verify a full local build succeeds**

Run: `astro build`
Expected: succeeds.

- [ ] **Step 8: Run every self-check**

```bash
node --experimental-strip-types scripts/check-tareas.mjs
node --experimental-strip-types scripts/check-auth.mjs
node --experimental-strip-types scripts/check-admin-auth.mjs
node --experimental-strip-types scripts/check-granjas.mjs
node --experimental-strip-types scripts/check-proyectos.mjs
node --experimental-strip-types scripts/check-jugadores.mjs
```
Expected: all six print their `ok: ...` line. (`check-auth.mjs` still exists and still passes — `auth.ts` itself is unchanged, only its consumers shifted from per-player to admin-only.)

- [ ] **Step 9: Commit**

```bash
git add src/pages/api/admin/jugadores src/components/JugadorForm.astro src/pages/admin/jugadores.astro
git add -u src/pages/login.astro src/pages/api/login.ts src/pages/api/logout.ts src/lib/players.ts scripts/set-passcode.mjs
git commit -m "Add admin jugadores section, remove player login system"
```

---

## Task 9: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full local build and every self-check**

```bash
astro build
node --experimental-strip-types scripts/check-tareas.mjs
node --experimental-strip-types scripts/check-auth.mjs
node --experimental-strip-types scripts/check-admin-auth.mjs
node --experimental-strip-types scripts/check-granjas.mjs
node --experimental-strip-types scripts/check-proyectos.mjs
node --experimental-strip-types scripts/check-jugadores.mjs
```
Expected: build succeeds, all six self-checks pass.

- [ ] **Step 2: Deploy to a staging URL**

The real `ADMIN_PASSWORD` only needs to exist in the Netlify site's environment variables (Task 1 already noted this) — set it there now if not already done (Site settings → Environment variables), picking a real password you'll remember. This branch also needs adding to the site's allowed branches:
```bash
npx netlify-cli api updateSite --data '{"site_id":"d1d3b94e-1d27-4c26-8bc4-90e73418341d","body":{"build_settings":{"allowed_branches":["main","feature/admin-dashboard"]}}}'
git push origin feature/admin-dashboard
npx netlify-cli api createSiteBuild --data '{"site_id":"d1d3b94e-1d27-4c26-8bc4-90e73418341d","body":{"branch":"feature/admin-dashboard"}}'
```
Poll the returned `deploy_id` until its `state` is `ready` or `error`:
```bash
npx netlify-cli api getSiteDeploy --data '{"site_id":"d1d3b94e-1d27-4c26-8bc4-90e73418341d","deploy_id":"<deploy_id from above>"}'
```
Expected: `state: "ready"`; the deploy's `deploy_ssl_url` gives the staging URL (`https://<branch-name>--slayerl99.netlify.app`).

- [ ] **Step 3: Manual end-to-end verification against the staging URL**

Using the staging URL and the real `ADMIN_PASSWORD` set in Netlify's environment variables:

1. Visit `/tareas`, `/granjas`, `/proyectos`, `/jugadores` while logged out of everything — confirm all four render read-only, with zero login links, zero edit/create/delete controls anywhere.
2. Visit `/login` — confirm `404` (removed).
3. Visit `/admin` — confirm redirect to `/admin/login`. Submit the wrong password — confirm the error message. Submit the real password — confirm redirect to `/admin` with four section tiles showing real counts.
4. In `/admin/tareas`: create a tarea with a title, priority, one assignee, and one subtarea; confirm it appears after reload. Edit it (change status, add a granja link); confirm the change sticks. Delete it; confirm it disappears. Confirm the public `/tareas` reflects the same data throughout (still read-only there).
5. In `/admin/granjas`: create one with a title and two coordinate lines (placeholder image card, no gallery); edit its title; delete it. Confirm an existing granja with real images still shows its gallery correctly on its public detail page, unaffected.
6. Repeat Step 5 for `/admin/proyectos`.
7. In `/admin/jugadores`: create a test player with an actividad; confirm it appears on the public `/jugadores` page grouped correctly; edit its actividad; delete it, confirming it disappears from the public listing too.
8. Click "Cerrar sesión" from `/admin` — confirm redirect to `/admin/login`, and that `/admin` and all `/admin/*` subpages redirect back to login when visited directly afterward.
9. Confirm all real production data survived the migrations: same 35 tareas (adjusted for any created/deleted during this verification), same 33 granjas, same 13 proyectos, same 15 real jugadores, all with correct titles/coordinates/actividades.

- [ ] **Step 4: Commit (only if verification surfaced a fix)**

If Step 3 found something to fix, commit it with a message describing what was found and fixed. If everything passed cleanly, there's nothing to commit here.
