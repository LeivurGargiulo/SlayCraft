# Player Auth & Task CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let coop players log in with a per-player passcode and create, edit, and delete tareas from the website.

**Architecture:** Add the `@astrojs/netlify` adapter; leave `output` at its default `'static'` and opt only the new/changed routes into on-demand rendering with `export const prerender = false`. Task and player data move from git-tracked markdown/TS into two Netlify Blobs stores (`tareas`, `players`), read and written through small helper modules. Auth is a stateless HMAC-signed cookie — no session table.

**Tech Stack:** Astro 7, `@astrojs/netlify`, `@netlify/blobs`, Node built-in `crypto` (scrypt for passcodes, HMAC for cookies). No new UI framework, no ORM, no test framework (none exists in this repo today — self-checks use plain `node:assert` scripts run via `node --experimental-strip-types`, matching Node ≥22.12 already required by `package.json` engines).

## Global Constraints

- Node engine floor is `>=22.12.0` (package.json `engines`) — `node --experimental-strip-types` is available on this floor and is used to run self-check scripts directly against `.ts` source.
- Astro output stays `'static'` (the default) for the whole project — never set `output: 'server'` globally. Only specific routes opt out via `export const prerender = false`.
- No new UI/test framework dependencies. Only new deps: `@netlify/blobs` (and whatever `astro add netlify` installs for the adapter itself).
- Passcodes are hashed with `node:crypto` `scryptSync`, never stored or logged in plaintext.
- Every mutating API endpoint (`POST`/`PATCH`/`DELETE` under `src/pages/api/`) must reject unauthenticated requests with `401` before touching data.
- Spec reference: `docs/superpowers/specs/2026-07-27-player-auth-tareas-crud-design.md`.
- **SUPERSEDED, kept for record:** Tasks 4-7 (below) were executed under the belief that
  `granjas/[slug].astro`, `proyectos/[slug].astro`, and `jugadores/[slug].astro` could stay statically
  prerendered while reading the `tareas` blob at build time, with local `astro build` failing there as
  an accepted, dev-only limitation (Netlify's hosted build was expected to succeed per their
  build-plugin docs). **This turned out to be false**: the actual Netlify hosted build failed with the
  same `MissingBlobsEnvironmentError`, discovered only when a real deploy was attempted post-Task-8.
  The fix (applied directly, not as a numbered task): all three pages were changed to
  `export const prerender = false`, same as `tareas.astro` — proven to work, and their related-tareas
  lists are now live instead of stale-until-next-deploy, as a side benefit. A plain local
  `astro build` now succeeds for the whole site. Ignore the local-build-limitation framing in Tasks
  4-7's steps below; it no longer applies.

---

## Task 1: Add the Netlify adapter

**Files:**
- Modify: `astro.config.mjs`
- Modify: `package.json`, `package-lock.json` (via CLI, not hand-edited)

**Interfaces:**
- Produces: a working `astro build` and `astro dev` with the Netlify adapter installed. No exported functions from this task.

- [ ] **Step 1: Install the adapter**

Run:
```bash
npx astro add netlify
```
Accept the prompt to install the dependency and update `astro.config.mjs`. Do **not** let it change `output` to `'server'` if it asks — keep the default (`'static'`); if the CLI adds `output: 'server'` automatically, edit `astro.config.mjs` afterward to remove that line so `output` stays unset (default `'static'`).

- [ ] **Step 2: Verify the config**

Open `astro.config.mjs` and confirm it looks like this (adapter present, no `output` override):
```js
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: netlify(),
});
```

- [ ] **Step 3: Verify the build still works**

Run: `astro build`
Expected: build succeeds, output includes a `.netlify/` (or `dist/`) directory with no errors. All existing pages still prerender (no behavior change yet — no page has opted out of prerendering).

- [ ] **Step 4: Verify dev server still works**

Run: `astro dev --background`, then `astro dev status`, then check `astro dev logs` for errors. Visit `/`, `/tareas`, `/granjas` in a browser to confirm the site still renders normally. Stop it with `astro dev stop` when done.

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs package.json package-lock.json
git commit -m "Add Netlify adapter for upcoming on-demand routes"
```

---

## Task 2: `src/lib/tareas.ts` — tarea data + validation

**Files:**
- Create: `src/lib/tareas.ts`
- Create: `scripts/check-tareas.mjs`
- Modify: `package.json` (add `@netlify/blobs` dependency)

**Interfaces:**
- Produces (used by later tasks):
  - `interface Subtarea { title: string; done: boolean; assignee?: string[] }`
  - `interface Tarea { id: string; title: string; status: 'pendiente' | 'en-progreso'; assignee?: string[]; priority: number; notes?: string; granjas?: string[]; proyectos?: string[]; subtareas?: Subtarea[] }`
  - `type TareaInput = Omit<Tarea, 'id'>`
  - `function slugify(title: string): string`
  - `async function getTareas(): Promise<Tarea[]>`
  - `async function createTarea(input: TareaInput): Promise<Tarea>`
  - `async function updateTarea(id: string, patch: Partial<TareaInput>): Promise<Tarea | null>`
  - `async function deleteTarea(id: string): Promise<boolean>`
  - `function parseTareaInput(body: unknown): TareaInput | null`
  - `function parseTareaPatch(body: unknown): Partial<TareaInput> | null`

- [ ] **Step 1: Install the blobs package**

Run: `npm install @netlify/blobs`

- [ ] **Step 2: Write `src/lib/tareas.ts`**

```ts
import { getStore } from '@netlify/blobs';

export interface Subtarea {
  title: string;
  done: boolean;
  assignee?: string[];
}

export interface Tarea {
  id: string;
  title: string;
  status: 'pendiente' | 'en-progreso';
  assignee?: string[];
  priority: number;
  notes?: string;
  granjas?: string[];
  proyectos?: string[];
  subtareas?: Subtarea[];
}

export type TareaInput = Omit<Tarea, 'id'>;

const KEY = 'tareas';

function store() {
  return getStore('tareas');
}

export async function getTareas(): Promise<Tarea[]> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Tarea[] | null) ?? [];
}

async function saveTareas(tareas: Tarea[]): Promise<void> {
  await store().setJSON(KEY, tareas);
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function createTarea(input: TareaInput): Promise<Tarea> {
  const tareas = await getTareas();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (tareas.some((t) => t.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const tarea: Tarea = { ...input, id };
  tareas.push(tarea);
  await saveTareas(tareas);
  return tarea;
}

export async function updateTarea(id: string, patch: Partial<TareaInput>): Promise<Tarea | null> {
  const tareas = await getTareas();
  const index = tareas.findIndex((t) => t.id === id);
  if (index === -1) return null;
  tareas[index] = { ...tareas[index], ...patch };
  await saveTareas(tareas);
  return tareas[index];
}

export async function deleteTarea(id: string): Promise<boolean> {
  const tareas = await getTareas();
  const next = tareas.filter((t) => t.id !== id);
  if (next.length === tareas.length) return false;
  await saveTareas(next);
  return true;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function parseSubtareas(v: unknown): Subtarea[] {
  if (!Array.isArray(v)) throw new Error('subtareas debe ser un arreglo');
  return v.map((s) => {
    if (typeof s !== 'object' || s === null) throw new Error('subtarea inválida');
    const { title, done, assignee } = s as Record<string, unknown>;
    if (typeof title !== 'string' || title.trim() === '') throw new Error('subtarea.title inválido');
    if (typeof done !== 'boolean') throw new Error('subtarea.done inválido');
    if (assignee !== undefined && !isStringArray(assignee)) throw new Error('subtarea.assignee inválido');
    return { title, done, assignee: assignee as string[] | undefined };
  });
}

export function parseTareaInput(body: unknown): TareaInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim() === '') return null;
  if (b.status !== 'pendiente' && b.status !== 'en-progreso') return null;
  if (typeof b.priority !== 'number' || !Number.isInteger(b.priority) || b.priority < 0 || b.priority > 5) return null;
  if (b.assignee !== undefined && !isStringArray(b.assignee)) return null;
  if (b.notes !== undefined && typeof b.notes !== 'string') return null;
  if (b.granjas !== undefined && !isStringArray(b.granjas)) return null;
  if (b.proyectos !== undefined && !isStringArray(b.proyectos)) return null;
  try {
    const subtareas = b.subtareas !== undefined ? parseSubtareas(b.subtareas) : undefined;
    return {
      title: b.title,
      status: b.status,
      priority: b.priority,
      assignee: b.assignee as string[] | undefined,
      notes: b.notes as string | undefined,
      granjas: b.granjas as string[] | undefined,
      proyectos: b.proyectos as string[] | undefined,
      subtareas,
    };
  } catch {
    return null;
  }
}

export function parseTareaPatch(body: unknown): Partial<TareaInput> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<TareaInput> = {};
  try {
    if (b.title !== undefined) {
      if (typeof b.title !== 'string' || b.title.trim() === '') return null;
      patch.title = b.title;
    }
    if (b.status !== undefined) {
      if (b.status !== 'pendiente' && b.status !== 'en-progreso') return null;
      patch.status = b.status;
    }
    if (b.priority !== undefined) {
      if (typeof b.priority !== 'number' || !Number.isInteger(b.priority) || b.priority < 0 || b.priority > 5) return null;
      patch.priority = b.priority;
    }
    if (b.assignee !== undefined) {
      if (!isStringArray(b.assignee)) return null;
      patch.assignee = b.assignee;
    }
    if (b.notes !== undefined) {
      if (typeof b.notes !== 'string') return null;
      patch.notes = b.notes;
    }
    if (b.granjas !== undefined) {
      if (!isStringArray(b.granjas)) return null;
      patch.granjas = b.granjas;
    }
    if (b.proyectos !== undefined) {
      if (!isStringArray(b.proyectos)) return null;
      patch.proyectos = b.proyectos;
    }
    if (b.subtareas !== undefined) {
      patch.subtareas = parseSubtareas(b.subtareas);
    }
    return patch;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Write the self-check script**

Create `scripts/check-tareas.mjs`:
```js
import assert from 'node:assert';
import { slugify, parseTareaInput, parseTareaPatch } from '../src/lib/tareas.ts';

assert.strictEqual(slugify('Construir Granja de Ghast'), 'construir-granja-de-ghast');
assert.strictEqual(slugify('Árbol Mágico!!'), 'arbol-magico');

const valid = parseTareaInput({ title: 'Test', status: 'pendiente', priority: 2 });
assert.ok(valid);
assert.strictEqual(valid.title, 'Test');

assert.strictEqual(parseTareaInput({ title: '', status: 'pendiente', priority: 2 }), null);
assert.strictEqual(parseTareaInput({ title: 'Test', status: 'invalido', priority: 2 }), null);
assert.strictEqual(parseTareaInput({ title: 'Test', status: 'pendiente', priority: 9 }), null);
assert.strictEqual(
  parseTareaInput({ title: 'Test', status: 'pendiente', priority: 1, subtareas: [{ title: 'x' }] }),
  null
);

const patch = parseTareaPatch({ priority: 3 });
assert.deepStrictEqual(patch, { priority: 3 });
assert.strictEqual(parseTareaPatch({ priority: 99 }), null);
assert.deepStrictEqual(parseTareaPatch({}), {});

console.log('ok: tareas lib checks passed');
```

- [ ] **Step 4: Run the self-check**

Run: `node --experimental-strip-types scripts/check-tareas.mjs`
Expected: prints `ok: tareas lib checks passed` with no assertion errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tareas.ts scripts/check-tareas.mjs package.json package-lock.json
git commit -m "Add tareas data layer backed by Netlify Blobs"
```

---

## Task 3: `src/lib/players.ts` + `src/lib/auth.ts` — passcodes and sessions

**Files:**
- Create: `src/lib/players.ts`
- Create: `src/lib/auth.ts`
- Create: `scripts/check-auth.mjs`
- Create: `.env.example`
- Modify: `.env` (local only, not committed — create if it doesn't exist)

**Interfaces:**
- Consumes: none from earlier tasks.
- Produces (used by later tasks):
  - `interface Player { passcodeHash: string }`
  - `async function getPlayers(): Promise<Record<string, Player>>`
  - `function hashPasscode(passcode: string): string`
  - `function verifyPasscode(passcode: string, passcodeHash: string): boolean`
  - `async function setPasscode(username: string, passcode: string): Promise<void>`
  - `function createSessionCookieValue(username: string, secret: string): string`
  - `function verifySessionCookieValue(value: string, secret: string): string | null`
  - `function getSessionUser(cookies: import('astro').APIContext['cookies']): string | null`
  - `function setSessionCookie(cookies: import('astro').APIContext['cookies'], username: string): void`
  - `function clearSessionCookie(cookies: import('astro').APIContext['cookies']): void`

- [ ] **Step 1: Write `src/lib/players.ts`**

```ts
import { getStore } from '@netlify/blobs';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export interface Player {
  passcodeHash: string;
}

const KEY = 'players';

function store() {
  return getStore('players');
}

export async function getPlayers(): Promise<Record<string, Player>> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Record<string, Player> | null) ?? {};
}

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(passcode, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPasscode(passcode: string, passcodeHash: string): boolean {
  const [salt, hashHex] = passcodeHash.split(':');
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(passcode, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function setPasscode(username: string, passcode: string): Promise<void> {
  const players = await getPlayers();
  players[username] = { passcodeHash: hashPasscode(passcode) };
  await store().setJSON(KEY, players);
}
```

- [ ] **Step 2: Write `src/lib/auth.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { APIContext } from 'astro';

type Cookies = APIContext['cookies'];

const COOKIE_NAME = 'session';

function sign(username: string, secret: string): string {
  return createHmac('sha256', secret).update(username).digest('hex');
}

export function createSessionCookieValue(username: string, secret: string): string {
  return `${username}.${sign(username, secret)}`;
}

export function verifySessionCookieValue(value: string, secret: string): string | null {
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const username = value.slice(0, dotIndex);
  const signature = value.slice(dotIndex + 1);
  const expected = Buffer.from(sign(username, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return username;
}

function getSecret(): string {
  const secret = import.meta.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is not set');
  return secret;
}

export function getSessionUser(cookies: Cookies): string | null {
  const raw = cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySessionCookieValue(raw, getSecret());
}

export function setSessionCookie(cookies: Cookies, username: string): void {
  cookies.set(COOKIE_NAME, createSessionCookieValue(username, getSecret()), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(COOKIE_NAME, { path: '/' });
}
```

- [ ] **Step 3: Add the env var**

Create `.env.example`:
```
SESSION_SECRET=change-me-to-a-long-random-string
```

Add a real random value to your local `.env` (create the file if missing — it's gitignored):
```bash
echo "SESSION_SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")" >> .env
```

Note: once deployed, also set `SESSION_SECRET` in the Netlify site's environment variables (Site settings → Environment variables) — this plan covers local dev only.

- [ ] **Step 4: Write the self-check script**

Create `scripts/check-auth.mjs`:
```js
import assert from 'node:assert';
import { createSessionCookieValue, verifySessionCookieValue } from '../src/lib/auth.ts';
import { hashPasscode, verifyPasscode } from '../src/lib/players.ts';

const secret = 'test-secret';
const cookie = createSessionCookieValue('TitoBaiso', secret);
assert.strictEqual(verifySessionCookieValue(cookie, secret), 'TitoBaiso');
assert.strictEqual(verifySessionCookieValue(cookie, 'wrong-secret'), null);
assert.strictEqual(verifySessionCookieValue(cookie + 'x', secret), null);
assert.strictEqual(verifySessionCookieValue('garbage', secret), null);

const hash = hashPasscode('correct-horse');
assert.ok(verifyPasscode('correct-horse', hash));
assert.ok(!verifyPasscode('wrong-passcode', hash));

console.log('ok: auth checks passed');
```

- [ ] **Step 5: Run the self-check**

Run: `node --experimental-strip-types scripts/check-auth.mjs`
Expected: prints `ok: auth checks passed` with no assertion errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/players.ts src/lib/auth.ts scripts/check-auth.mjs .env.example
git commit -m "Add passcode hashing and signed-cookie session helpers"
```

(Do not `git add .env` — it must stay untracked.)

---

## Task 4: Migrate tareas to the blob and cut over every call site

This task moves atomically: by the end of it, the `tareas` content collection is gone and every
page that used it reads from the blob instead. The build must pass at the end of this task (it
will not pass partway through, since deleting the collection breaks any page still calling
`getCollection('tareas')`).

**Files:**
- Create (temporary, deleted at the end of this task): `src/pages/api/admin/migrate-tareas.ts`
- Delete: `src/content/tareas/*.md` (35 files)
- Modify: `src/content.config.ts` (remove the `tareas` collection)
- Modify: `src/pages/granjas/[slug].astro`
- Modify: `src/pages/proyectos/[slug].astro`
- Modify: `src/pages/jugadores/[slug].astro`
- Modify: `src/components/RelatedTareas.astro`

**Interfaces:**
- Consumes: `getTareas` from `src/lib/tareas.ts` (Task 2), `Tarea` type.

- [ ] **Step 1: Write the temporary migration endpoint**

Create `src/pages/api/admin/migrate-tareas.ts`:
```ts
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getStore } from '@netlify/blobs';
import type { Tarea } from '../../../lib/tareas';

export const prerender = false;

export const GET: APIRoute = async () => {
  const raw = await getCollection('tareas');
  const tareas: Tarea[] = raw.map((t) => ({
    id: t.id,
    title: t.data.title,
    status: t.data.status,
    assignee: t.data.assignee,
    priority: t.data.priority,
    notes: t.data.notes,
    granjas: t.data.granjas?.map((ref) => ref.id),
    proyectos: t.data.proyectos?.map((ref) => ref.id),
    subtareas: t.data.subtareas ?? undefined,
  }));

  await getStore('tareas').setJSON('tareas', tareas);
  return Response.json({ migrated: tareas.length });
};
```

- [ ] **Step 2: Run the migration locally**

Run: `astro dev --background`, then:
```bash
curl http://localhost:4321/api/admin/migrate-tareas
```
Expected: `{"migrated":35}`. Then run `curl http://localhost:4321/api/admin/migrate-tareas` a second time is harmless (idempotent — it always rewrites the full blob from the current markdown files, which still exist at this point). Stop the server after with `astro dev stop`.

- [ ] **Step 3: Delete the migration endpoint and the markdown files**

```bash
rm src/pages/api/admin/migrate-tareas.ts
rmdir src/pages/api/admin --ignore-fail-on-non-empty 2>/dev/null || true
rm src/content/tareas/*.md
```

- [ ] **Step 4: Remove the `tareas` collection from `src/content.config.ts`**

Edit `src/content.config.ts` to remove the `tareas` collection, its `assignee` schema helper, and the now-unused `reference` import. The file should read:
```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const coordinates = z.array(z.string());

const proyectos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/proyectos' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      images: z.array(image()).min(1),
      coordinates,
    }),
});

const granjas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/granjas' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      images: z.array(image()).min(1),
      coordinates,
    }),
});

export const collections = { proyectos, granjas };
```

- [ ] **Step 5: Update `RelatedTareas.astro`'s prop type**

In `src/components/RelatedTareas.astro`, replace:
```astro
import type { CollectionEntry } from 'astro:content';

interface Props {
  tareas: CollectionEntry<'tareas'>[];
}
const { tareas } = Astro.props;

const statusLabels: Record<string, string> = { pendiente: 'Pendiente', 'en-progreso': 'En progreso' };
```
with:
```astro
import type { Tarea } from '../lib/tareas';

interface Props {
  tareas: Tarea[];
}
const { tareas } = Astro.props;

const statusLabels: Record<string, string> = { pendiente: 'Pendiente', 'en-progreso': 'En progreso' };
```
And in the template, replace `t.data.title` with `t.title` and `t.data.status` with `t.status` (two occurrences).

- [ ] **Step 6: Update `src/pages/granjas/[slug].astro`**

Replace:
```astro
import { getCollection } from 'astro:content';
```
with (add alongside the existing `astro:content` import used for `granjas`):
```astro
import { getCollection } from 'astro:content';
import { getTareas } from '../../lib/tareas';
```
Replace:
```astro
const tareas = (await getCollection('tareas')).filter((t) => t.data.granjas?.some((ref) => ref.id === entry.id));
```
with:
```astro
const tareas = (await getTareas()).filter((t) => t.granjas?.includes(entry.id));
```

- [ ] **Step 7: Update `src/pages/proyectos/[slug].astro`**

Same change as Step 6, adapted: import `getTareas` from `'../../lib/tareas'`, replace
```astro
const tareas = (await getCollection('tareas')).filter((t) => t.data.proyectos?.some((ref) => ref.id === entry.id));
```
with:
```astro
const tareas = (await getTareas()).filter((t) => t.proyectos?.includes(entry.id));
```

- [ ] **Step 8: Update `src/pages/jugadores/[slug].astro`**

Replace:
```astro
import { getCollection } from 'astro:content';
```
with:
```astro
import { getTareas } from '../../lib/tareas';
```
(this page no longer needs `astro:content` at all — `JUGADORES` already comes from `src/data/jugadores`). Replace:
```astro
const tareas = (await getCollection('tareas')).filter(
  (t) => t.data.assignee?.includes(username) || t.data.subtareas?.some((s) => s.assignee?.includes(username))
);
```
with:
```astro
const tareas = (await getTareas()).filter(
  (t) => t.assignee?.includes(username) || t.subtareas?.some((s) => s.assignee?.includes(username))
);
```

- [ ] **Step 9: Verify via `astro dev` (not `astro build`)**

Per the Global Constraints' known local-build limitation: `granjas/[slug].astro`,
`proyectos/[slug].astro`, and `jugadores/[slug].astro` read the `tareas` blob at prerender time, and
Netlify Blobs' local emulation only covers `astro dev`, not a one-shot `astro build` — so `astro build`
is expected to fail on these three routes from this task onward (`MissingBlobsEnvironmentError`). That
failure is not a regression to fix. Also expected at this point in the plan: `tareas.astro` itself
still calls the now-removed `getCollection('tareas')`/`getEntry` — it will show its own build error
until Task 5 rewrites it. Neither failure means this task's changes are wrong. Verify correctness via
`astro dev --background` instead (Step 10).

- [ ] **Step 10: Manual spot-check**

With the dev server running, visit a granja detail page, a proyecto detail page, and a jugador detail page that had related tareas before (e.g. `/jugadores/TitoBaiso`) — confirm the "Tareas relacionadas" section still shows the same tareas as before the migration. Stop with `astro dev stop`.

- [ ] **Step 11: Commit**

```bash
git add src/content.config.ts src/components/RelatedTareas.astro
git add "src/pages/granjas/[slug].astro" "src/pages/proyectos/[slug].astro" "src/pages/jugadores/[slug].astro"
git add src/content/tareas
git commit -m "Migrate tareas from markdown collection to Netlify Blobs"
```

---

## Task 5: Rewrite `tareas.astro` to read from the blob (read-only)

This task only swaps the data source and keeps today's rendering behavior identical — no login or
edit UI yet (that's Tasks 6–7). Splitting it out keeps this diff reviewable on its own.

**Files:**
- Modify: `src/pages/tareas.astro`

**Interfaces:**
- Consumes: `getTareas`, `Tarea` from `src/lib/tareas.ts`.

- [ ] **Step 1: Replace the frontmatter data loading**

In `src/pages/tareas.astro`, replace:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { getCollection, getEntry } from 'astro:content';
import { JUGADORES } from '../data/jugadores';

const rawTareas = await getCollection('tareas');
const jugadoresSet: Set<string> = new Set(JUGADORES.map((j) => j.username));

const tareas = await Promise.all(
  rawTareas.map(async (t) => ({
    entry: t,
    proyectos: t.data.proyectos ? await Promise.all(t.data.proyectos.map((ref) => getEntry(ref))) : [],
    granjas: t.data.granjas ? await Promise.all(t.data.granjas.map((ref) => getEntry(ref))) : [],
  }))
);
```
with:
```astro
---
export const prerender = false;

import BaseLayout from '../layouts/BaseLayout.astro';
import { getEntry } from 'astro:content';
import { JUGADORES } from '../data/jugadores';
import { getTareas, type Tarea } from '../lib/tareas';

const jugadoresSet: Set<string> = new Set(JUGADORES.map((j) => j.username));

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

- [ ] **Step 2: Update every remaining reference from `t.entry.data.X` / `t.entry` to the flat shape**

In the rest of the frontmatter (`assigneeOptions`, `proyectoOptions`) and the template, replace:
- `t.entry.data.assignee` → `t.tarea.assignee`
- `t.entry.data.subtareas` → `t.tarea.subtareas`
- `t.entry.data.status` → `t.tarea.status`
- `t.entry.data.priority` → `t.tarea.priority`
- `t.entry.data.title` → `t.tarea.title`
- `t.entry.data.notes` → `t.tarea.notes`
- `{ entry: t, proyectos, granjas }` (in the `.map` destructure inside the template) → `{ tarea: t, proyectos, granjas }`, and every `t.data.X` inside that block → `t.X`

Concretely, the `assigneeOptions` and `proyectoOptions` block becomes:
```astro
const assigneeOptions = [
  ...new Set(
    tareas.flatMap((t) => [
      ...(t.tarea.assignee ?? []),
      ...(t.tarea.subtareas?.flatMap((s) => s.assignee ?? []) ?? []),
    ])
  ),
].sort((a, b) => a.localeCompare(b));

const proyectoOptions = [
  ...new Map(tareas.flatMap((t) => t.proyectos.map((p) => [p.id, p.data.title]))),
].sort((a, b) => a[1].localeCompare(b[1]));
```
(the `.filter((p) => p !== undefined)` on `proyectos` is no longer needed here since it's already filtered when built above).

And the template's items block becomes (full replacement of the `items.map(...)` body, same structure, just `entry: t` → `tarea: t` and every `t.data.X` → `t.X`):
```astro
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
```
Also update the `items` computation itself just above the template (`groups.map(...)`), replacing `t.entry.data.status`/`t.entry.data.priority` with `t.tarea.status`/`t.tarea.priority`:
```astro
const items = tareas
  .filter((t) => t.tarea.status === group.key && t.tarea.priority > 0)
  .sort((a, b) => a.tarea.priority - b.tarea.priority);
```

- [ ] **Step 3: Verify the page still works via `astro dev`**

Per the Global Constraints' known local-build limitation, a whole-site `astro build` still fails at
this point — not because of this task (this task's own `tareas.astro` is now `prerender = false` and
unaffected), but because `granjas/[slug].astro`, `proyectos/[slug].astro`, and `jugadores/[slug].astro`
still can't read the `tareas` blob during a local build. That's expected and pre-existing; don't chase
it here. Verify this task with `astro dev --background` instead: visit `/tareas`, confirm it renders
exactly as before (same tareas, same filters working via the existing client script — that script only
touches `data-*` attributes and DOM, untouched by this task). Stop with `astro dev stop`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/tareas.astro
git commit -m "Read tareas.astro from the Netlify Blobs data source"
```

---

## Task 6: Login and logout

**Files:**
- Create: `src/pages/login.astro`
- Create: `src/pages/api/login.ts`
- Create: `src/pages/api/logout.ts`
- Modify: `src/pages/tareas.astro`

**Interfaces:**
- Consumes: `getSessionUser`, `setSessionCookie`, `clearSessionCookie` from `src/lib/auth.ts`; `getPlayers`, `verifyPasscode` from `src/lib/players.ts`; `JUGADORES` from `src/data/jugadores.ts`.

- [ ] **Step 1: Write `src/pages/login.astro`**

```astro
---
export const prerender = false;

import BaseLayout from '../layouts/BaseLayout.astro';
import { JUGADORES } from '../data/jugadores';
import { getSessionUser } from '../lib/auth';

const sessionUser = getSessionUser(Astro.cookies);
if (sessionUser) return Astro.redirect('/tareas');

const error = Astro.url.searchParams.get('error');
---

<BaseLayout title="Iniciar sesión">
  <h1 class="text-2xl font-semibold">Iniciar sesión</h1>
  {error && <p class="mt-2 text-sm text-red-500">Usuario o clave incorrectos.</p>}
  <form method="POST" action="/api/login" class="mt-4 flex max-w-sm flex-col gap-3">
    <label class="flex flex-col gap-1 text-sm">
      Jugador
      <select name="username" required class="rounded border border-border bg-surface px-2 py-1.5">
        {JUGADORES.map((j) => <option value={j.username}>{j.username}</option>)}
      </select>
    </label>
    <label class="flex flex-col gap-1 text-sm">
      Clave
      <input type="password" name="passcode" required class="rounded border border-border bg-surface px-2 py-1.5" />
    </label>
    <button type="submit" class="mt-2 rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg">Entrar</button>
  </form>
</BaseLayout>
```

- [ ] **Step 2: Write `src/pages/api/login.ts`**

```ts
import type { APIRoute } from 'astro';
import { getPlayers, verifyPasscode } from '../../lib/players';
import { setSessionCookie } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const username = String(form.get('username') ?? '');
  const passcode = String(form.get('passcode') ?? '');

  const players = await getPlayers();
  const player = players[username];
  if (!player || !verifyPasscode(passcode, player.passcodeHash)) {
    return redirect('/login?error=1');
  }

  setSessionCookie(cookies, username);
  return redirect('/tareas');
};
```

- [ ] **Step 3: Write `src/pages/api/logout.ts`**

```ts
import type { APIRoute } from 'astro';
import { clearSessionCookie } from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  clearSessionCookie(cookies);
  return redirect('/tareas');
};
```

- [ ] **Step 4: Add session state + a login/logout control to `tareas.astro`**

In `src/pages/tareas.astro`, add to the frontmatter (after the `getTareas` import):
```astro
import { getSessionUser } from '../lib/auth';

const sessionUser = getSessionUser(Astro.cookies);
```
And in the template, right after the `<p class="mt-2 text-text-muted">Lista de pendientes del servidor.</p>` line, add:
```astro
<div class="mt-3">
  {sessionUser ? (
    <form method="POST" action="/api/logout" class="inline-flex items-center gap-2">
      <span class="text-sm text-text-muted">Sesión: <strong class="text-text">{sessionUser}</strong></span>
      <button type="submit" class="text-sm text-accent hover:underline">Cerrar sesión</button>
    </form>
  ) : (
    <a href="/login" class="text-sm text-accent hover:underline">Iniciar sesión</a>
  )}
</div>
```

- [ ] **Step 5: Manual verification**

No passcode exists for any player yet (Task 8 sets real ones), so this step only verifies the
*failure path*. Run `astro dev --background`, visit `/login`, submit any username/passcode
combination, and confirm it redirects to `/login?error=1` and shows "Usuario o clave incorrectos."
Confirm `/tareas` still shows the "Iniciar sesión" link (not logged in). Stop with `astro dev stop`.
Full login-success verification happens in Task 8 once real passcodes exist.

- [ ] **Step 6: Commit**

```bash
git add src/pages/login.astro src/pages/api/login.ts src/pages/api/logout.ts src/pages/tareas.astro
git commit -m "Add player login and logout"
```

---

## Task 7: Task CRUD — API endpoints, form component, wiring

**Files:**
- Create: `src/pages/api/tareas/index.ts`
- Create: `src/pages/api/tareas/[id].ts`
- Create: `src/components/TareaForm.astro`
- Modify: `src/pages/tareas.astro`

**Interfaces:**
- Consumes: `createTarea`, `updateTarea`, `deleteTarea`, `parseTareaInput`, `parseTareaPatch`, `Tarea` from `src/lib/tareas.ts`; `getSessionUser` from `src/lib/auth.ts`.

- [ ] **Step 1: Write `src/pages/api/tareas/index.ts`**

```ts
import type { APIRoute } from 'astro';
import { getSessionUser } from '../../../lib/auth';
import { createTarea, parseTareaInput } from '../../../lib/tareas';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseTareaInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const tarea = await createTarea(input);
  return Response.json(tarea, { status: 201 });
};
```

- [ ] **Step 2: Write `src/pages/api/tareas/[id].ts`**

```ts
import type { APIRoute } from 'astro';
import { getSessionUser } from '../../../lib/auth';
import { updateTarea, deleteTarea, parseTareaPatch } from '../../../lib/tareas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseTareaPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const tarea = await updateTarea(params.id!, patch);
  if (!tarea) return new Response('Tarea no encontrada', { status: 404 });
  return Response.json(tarea);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteTarea(params.id!);
  if (!deleted) return new Response('Tarea no encontrada', { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Write `src/components/TareaForm.astro`**

Shared form for both create and edit, matching every field in the `Tarea` type (title, status,
priority, assignee, notes, granjas/proyectos links, subtareas):
```astro
---
import type { Tarea } from '../lib/tareas';

interface Props {
  mode: 'create' | 'edit';
  tarea?: Tarea;
  jugadores: string[];
  granjaOptions: { id: string; title: string }[];
  proyectoOptions: { id: string; title: string }[];
}

const { mode, tarea, jugadores, granjaOptions, proyectoOptions } = Astro.props;
const subtareas = tarea?.subtareas ?? [];
---

<form data-tarea-form data-mode={mode} data-id={tarea?.id ?? ''} class="flex flex-col gap-3 rounded border border-border p-3">
  <datalist id="jugadores-list">
    {jugadores.map((j) => <option value={j} />)}
  </datalist>

  <label class="flex flex-col gap-1 text-sm">
    Título
    <input name="title" required value={tarea?.title ?? ''} class="rounded border border-border bg-surface px-2 py-1.5" />
  </label>

  <div class="flex gap-3">
    <label class="flex flex-1 flex-col gap-1 text-sm">
      Estado
      <select name="status" class="rounded border border-border bg-surface px-2 py-1.5">
        <option value="pendiente" selected={(tarea?.status ?? 'pendiente') === 'pendiente'}>Pendiente</option>
        <option value="en-progreso" selected={tarea?.status === 'en-progreso'}>En progreso</option>
      </select>
    </label>

    <label class="flex flex-1 flex-col gap-1 text-sm">
      Prioridad
      <select name="priority" class="rounded border border-border bg-surface px-2 py-1.5">
        {[0, 1, 2, 3, 4, 5].map((p) => (
          <option value={p} selected={(tarea?.priority ?? 3) === p}>{p}</option>
        ))}
      </select>
    </label>
  </div>

  <label class="flex flex-col gap-1 text-sm">
    Jugador(es) asignado(s) (separados por coma)
    <input
      name="assignee"
      list="jugadores-list"
      value={(tarea?.assignee ?? []).join(', ')}
      placeholder="usuario1, usuario2"
      class="rounded border border-border bg-surface px-2 py-1.5"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm">
    Notas
    <textarea name="notes" class="rounded border border-border bg-surface px-2 py-1.5">{tarea?.notes ?? ''}</textarea>
  </label>

  <div class="flex gap-3">
    <label class="flex flex-1 flex-col gap-1 text-sm">
      Granjas vinculadas
      <select name="granjas" multiple class="h-24 rounded border border-border bg-surface px-2 py-1.5">
        {granjaOptions.map((g) => (
          <option value={g.id} selected={tarea?.granjas?.includes(g.id)}>{g.title}</option>
        ))}
      </select>
    </label>

    <label class="flex flex-1 flex-col gap-1 text-sm">
      Proyectos vinculados
      <select name="proyectos" multiple class="h-24 rounded border border-border bg-surface px-2 py-1.5">
        {proyectoOptions.map((p) => (
          <option value={p.id} selected={tarea?.proyectos?.includes(p.id)}>{p.title}</option>
        ))}
      </select>
    </label>
  </div>

  <div>
    <p class="text-sm font-medium">Subtareas</p>
    <div data-subtareas-container class="mt-2 flex flex-col gap-2">
      {subtareas.map((s) => (
        <fieldset data-subtarea-row class="flex items-center gap-2 rounded border border-border p-2">
          <input name="subtarea_title" value={s.title} placeholder="Título" class="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm" />
          <label class="flex items-center gap-1 text-xs">
            <input type="checkbox" name="subtarea_done" checked={s.done} />
            Hecho
          </label>
          <input
            name="subtarea_assignee"
            list="jugadores-list"
            value={(s.assignee ?? []).join(', ')}
            placeholder="Asignado(s)"
            class="w-40 rounded border border-border bg-surface px-2 py-1 text-sm"
          />
          <button type="button" data-remove-subtarea class="text-xs text-red-500">✕</button>
        </fieldset>
      ))}
    </div>
    <template data-subtarea-template>
      <fieldset data-subtarea-row class="flex items-center gap-2 rounded border border-border p-2">
        <input name="subtarea_title" placeholder="Título" class="flex-1 rounded border border-border bg-surface px-2 py-1 text-sm" />
        <label class="flex items-center gap-1 text-xs">
          <input type="checkbox" name="subtarea_done" />
          Hecho
        </label>
        <input
          name="subtarea_assignee"
          list="jugadores-list"
          placeholder="Asignado(s)"
          class="w-40 rounded border border-border bg-surface px-2 py-1 text-sm"
        />
        <button type="button" data-remove-subtarea class="text-xs text-red-500">✕</button>
      </fieldset>
    </template>
    <button type="button" data-add-subtarea class="mt-2 text-xs text-accent hover:underline">+ Agregar subtarea</button>
  </div>

  <div class="mt-1 flex gap-2">
    <button type="submit" class="rounded bg-accent px-3 py-1.5 text-sm font-medium text-bg">
      {mode === 'create' ? 'Crear tarea' : 'Guardar cambios'}
    </button>
    {mode === 'edit' && tarea && (
      <button type="button" data-delete-tarea data-id={tarea.id} class="rounded border border-border px-3 py-1.5 text-sm text-red-500">
        Eliminar tarea
      </button>
    )}
  </div>
</form>
```

- [ ] **Step 4: Wire the form into `src/pages/tareas.astro` and add the client script**

In the frontmatter, add (alongside the existing imports):
```astro
import { getCollection } from 'astro:content';
import TareaForm from '../components/TareaForm.astro';

const jugadoresList = JUGADORES.map((j) => j.username);
const allGranjas = (await getCollection('granjas')).map((g) => ({ id: g.id, title: g.data.title }));
const allProyectos = (await getCollection('proyectos')).map((p) => ({ id: p.id, title: p.data.title }));
```

Right after the login/logout `<div>` added in Task 6, add the "new tarea" form (only when logged in):
```astro
{sessionUser && (
  <details class="mt-4 rounded border border-border p-3">
    <summary class="cursor-pointer text-sm font-medium">+ Nueva tarea</summary>
    <div class="mt-3">
      <TareaForm mode="create" jugadores={jugadoresList} granjaOptions={allGranjas} proyectoOptions={allProyectos} />
    </div>
  </details>
)}
```

Inside each task `<li>`, right after the `{t.subtareas && ...}` block and before the closing `</div>` of `min-w-0 flex-1`, add:
```astro
{sessionUser && (
  <div class="mt-2 flex items-center gap-3">
    <details>
      <summary class="cursor-pointer text-xs text-accent">Editar</summary>
      <div class="mt-2">
        <TareaForm mode="edit" tarea={t} jugadores={jugadoresList} granjaOptions={allGranjas} proyectoOptions={allProyectos} />
      </div>
    </details>
    <button type="button" data-delete-tarea data-id={t.id} class="text-xs text-red-500 hover:underline">
      Eliminar
    </button>
  </div>
)}
```

At the bottom of the file, after the existing `<script data-astro-rerun>` block (the filters script), add a second script block:
```astro
<script data-astro-rerun>
  function readSubtareas(form: HTMLFormElement) {
    return Array.from(form.querySelectorAll<HTMLElement>('[data-subtarea-row]'))
      .map((row) => ({
        title: (row.querySelector('[name="subtarea_title"]') as HTMLInputElement).value.trim(),
        done: (row.querySelector('[name="subtarea_done"]') as HTMLInputElement).checked,
        assignee: (row.querySelector('[name="subtarea_assignee"]') as HTMLInputElement).value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }))
      .filter((s) => s.title);
  }

  function buildPayload(form: HTMLFormElement) {
    const title = (form.querySelector('[name="title"]') as HTMLInputElement).value.trim();
    const status = (form.querySelector('[name="status"]') as HTMLSelectElement).value;
    const priority = Number((form.querySelector('[name="priority"]') as HTMLSelectElement).value);
    const assignee = (form.querySelector('[name="assignee"]') as HTMLInputElement).value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const notes = (form.querySelector('[name="notes"]') as HTMLTextAreaElement).value;
    const granjas = Array.from(form.querySelectorAll<HTMLOptionElement>('[name="granjas"] option:checked')).map(
      (o) => o.value
    );
    const proyectos = Array.from(form.querySelectorAll<HTMLOptionElement>('[name="proyectos"] option:checked')).map(
      (o) => o.value
    );
    const subtareas = readSubtareas(form);
    return { title, status, priority, assignee, notes, granjas, proyectos, subtareas };
  }

  document.addEventListener('click', (e) => {
    const addBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-add-subtarea]');
    if (addBtn) {
      const wrapper = addBtn.parentElement;
      const template = wrapper?.querySelector<HTMLTemplateElement>('[data-subtarea-template]');
      const container = wrapper?.querySelector<HTMLElement>('[data-subtareas-container]');
      if (template && container) {
        container.appendChild(template.content.cloneNode(true));
      }
      return;
    }

    const removeBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-remove-subtarea]');
    if (removeBtn) {
      removeBtn.closest('[data-subtarea-row]')?.remove();
      return;
    }

    const deleteBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-delete-tarea]');
    if (deleteBtn) {
      if (!confirm('¿Eliminar esta tarea?')) return;
      fetch(`/api/tareas/${deleteBtn.dataset.id}`, { method: 'DELETE' }).then((res) => {
        if (res.ok) location.reload();
        else alert('Error al eliminar la tarea.');
      });
    }
  });

  document.addEventListener('submit', (e) => {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-tarea-form]');
    if (!form) return;
    e.preventDefault();
    const payload = buildPayload(form);
    const mode = form.dataset.mode;
    const url = mode === 'create' ? '/api/tareas' : `/api/tareas/${form.dataset.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(
      (res) => {
        if (res.ok) location.reload();
        else alert('Error al guardar la tarea.');
      }
    );
  });
</script>
```

- [ ] **Step 5: Verify via `astro dev`**

Per the Global Constraints' known local-build limitation, a whole-site `astro build` still fails at
`granjas/[slug].astro`/`proyectos/[slug].astro`/`jugadores/[slug].astro` — pre-existing, unrelated to
this task (none of this task's files are among those three). Verify this task with
`astro dev --background` instead: visit `/tareas`, confirm no console/type errors surface and the page
still loads. Stop with `astro dev stop`. (Full functional verification happens in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/tareas src/components/TareaForm.astro src/pages/tareas.astro
git commit -m "Add tarea create/edit/delete UI and API endpoints"
```

---

## Task 8: Set real passcodes and end-to-end verification

**Files:**
- Create: `scripts/set-passcode.mjs`

**Interfaces:**
- Consumes: `setPasscode` from `src/lib/players.ts`.

- [ ] **Step 1: Write the admin script**

```js
import { setPasscode } from '../src/lib/players.ts';

const [username, passcode] = process.argv.slice(2);
if (!username || !passcode) {
  console.error('Usage: netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs <username> <passcode>');
  process.exit(1);
}

await setPasscode(username, passcode);
console.log(`Passcode set for ${username}`);
```

- [ ] **Step 2: Set a passcode for each of the 15 players**

This needs the Netlify CLI logged in and linked to the site (`netlify login`, `netlify link`, one-time setup if not already done). Run once per player, picking your own passcodes:
```bash
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs BadPlayerRQM <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs batatauw2 <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs Beezywie <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs BjornViking206 <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs ErickRB <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs Hiperdragon675 <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs Lautysoldado <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs RetroGamesWan <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs SharckAttack323 <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs SlayerL99 <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs Syanurix <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs ElTano28 <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs TitoBaiso <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs Tomyrex143 <passcode>
netlify dev:exec -- node --experimental-strip-types scripts/set-passcode.mjs Itorumu <passcode>
```
Each prints `Passcode set for <username>`.

- [ ] **Step 3: End-to-end manual verification**

Run `astro dev --background`. In a browser:
1. Visit `/tareas` while logged out — confirm the list renders and only the "Iniciar sesión" link shows (no forms/edit/delete controls).
2. Visit `/login`, pick a player, enter their passcode, submit — confirm redirect to `/tareas` and the header now shows "Sesión: `<username>`" with a "Cerrar sesión" link.
3. Expand "+ Nueva tarea", fill in a title, priority, and one assignee, add one subtarea, submit — confirm the page reloads and the new tarea appears in the correct priority group.
4. Expand "Editar" on that new tarea, change its status to "En progreso" and add a granja link, submit — confirm the change is reflected after reload, and that it now appears under "En progreso".
5. Click "Eliminar" on that tarea, confirm the browser confirm dialog, confirm it disappears after reload.
6. Click "Cerrar sesión" — confirm redirect to `/tareas` and the edit/delete/new-tarea controls disappear again.
7. Visit a granja or proyecto detail page that has related tareas and confirm "Tareas relacionadas" still renders correctly (unaffected by this task).

Stop the dev server with `astro dev stop`.

- [ ] **Step 4: Commit**

```bash
git add scripts/set-passcode.mjs
git commit -m "Add admin script for setting player passcodes"
```
