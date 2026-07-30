# Granjas & Proyectos CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in players create, edit, and delete granjas and proyectos (title + coordinates) from the site, the way they already can with tareas.

**Architecture:** Two new Netlify Blobs stores (`granjas`, `proyectos`), structurally identical to the existing `tareas` store, each holding `{id, title, coordinates}[]`. The content collections shrink to just `images: image[]` — images stay a git-managed, build-time-optimized field, completely untouched by this work; only `title`/`coordinates` move to the blob. Every page that reads a blob must be on-demand (`prerender = false`) — the two index listing pages are the only pages this plan makes dynamic for the first time; the two detail pages are already on-demand from earlier work.

**Tech Stack:** Astro 7, `@netlify/blobs` (already a dependency), `js-yaml` (already present in `node_modules` as a transitive dependency — used only by an ephemeral, uncommitted migration script, never imported by shipped code). No new dependencies.

## Global Constraints

- Astro `output` stays `'static'` (the project-wide default, unchanged) — every new/changed route that touches a blob opts out individually via `export const prerender = false`.
- No new dependencies beyond what's already installed.
- No ownership checks on any endpoint — any logged-in player can create/edit/delete any granja/proyecto, matching the tareas precedent. Every mutating endpoint (`POST`/`PATCH`/`DELETE`) must still reject unauthenticated requests with `401` before touching data.
- No image upload/management UI — images stay a content-collection field, edited only by adding files to the repo. A granja/proyecto created via the web UI has no images until one is added that way; this is expected, not a bug.
- **Known lesson from the tareas migration (do not repeat):** a local `astro dev` (or any local script run outside `netlify dev:exec`/`netlify blobs:set`) writes to a *local sandbox* blob store, not the real deployed site's store. The production `granjas`/`proyectos` blobs must be populated via `netlify blobs:set <store> <key> --input <file>` (direct, real-site write, already proven to work) — never by hitting a local dev server and assuming it reached production.
- Spec reference: `docs/superpowers/specs/2026-07-28-granjas-proyectos-crud-design.md`.

---

## Task 1: `src/lib/granjas.ts` + `src/lib/proyectos.ts` — data layer

**Files:**
- Create: `src/lib/slugify.ts`
- Modify: `src/lib/tareas.ts` (replace its local `slugify` definition with a re-export from the new shared module — no behavior change)
- Create: `src/lib/granjas.ts`
- Create: `src/lib/proyectos.ts`
- Create: `scripts/check-granjas.mjs`
- Create: `scripts/check-proyectos.mjs`

**Interfaces:**
- Produces (used by later tasks):
  - `interface Granja { id: string; title: string; coordinates: string[] }`
  - `type GranjaInput = Omit<Granja, 'id'>`
  - `async function getGranjas(): Promise<Granja[]>`
  - `async function createGranja(input: GranjaInput): Promise<Granja>`
  - `async function updateGranja(id: string, patch: Partial<GranjaInput>): Promise<Granja | null>`
  - `async function deleteGranja(id: string): Promise<boolean>`
  - `function parseGranjaInput(body: unknown): GranjaInput | null`
  - `function parseGranjaPatch(body: unknown): Partial<GranjaInput> | null`
  - Identical set for `Proyecto`/`ProyectoInput`/`getProyectos`/`createProyecto`/`updateProyecto`/`deleteProyecto`/`parseProyectoInput`/`parseProyectoPatch` in `src/lib/proyectos.ts`.

This task only touches library code — no pages, no build-breaking risk.

- [ ] **Step 1: Extract `slugify` into its own module**

`src/lib/tareas.ts` currently defines `slugify` locally (used by `createTarea`'s id-collision loop). Since `granjas.ts` and `proyectos.ts` need the identical function, extract it once.

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

In `src/lib/tareas.ts`, replace the existing `export function slugify(title: string): string { ... }` block (the whole function body) with:
```ts
export { slugify } from './slugify';
```
Place this re-export near the top of the file, alongside the other imports — `scripts/check-tareas.mjs` already does `import { slugify, ... } from '../src/lib/tareas.ts'`, and this re-export keeps that working unchanged.

- [ ] **Step 2: Verify the tareas self-check still passes after the extraction**

Run: `node --experimental-strip-types scripts/check-tareas.mjs`
Expected: `ok: tareas lib checks passed` (unchanged — confirms the re-export didn't break anything).

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

Identical to Step 3, with every `Granja`/`granja`/`granjas` renamed to `Proyecto`/`proyecto`/`proyectos`, and `getStore('granjas')` → `getStore('proyectos')`:
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

- [ ] **Step 5: Write the self-check scripts**

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

- [ ] **Step 6: Run both new self-checks**

Run: `node --experimental-strip-types scripts/check-granjas.mjs`
Expected: `ok: granjas lib checks passed`

Run: `node --experimental-strip-types scripts/check-proyectos.mjs`
Expected: `ok: proyectos lib checks passed`

- [ ] **Step 7: Commit**

```bash
git add src/lib/slugify.ts src/lib/tareas.ts src/lib/granjas.ts src/lib/proyectos.ts scripts/check-granjas.mjs scripts/check-proyectos.mjs
git commit -m "Add granjas/proyectos data layer backed by Netlify Blobs"
```

---

## Task 2: Migrate data and cut over every read site (atomic)

This task moves atomically, same reasoning as the earlier tareas migration: by the end, the
`granjas`/`proyectos` content collections have `title`/`coordinates` stripped from every markdown
file, both blobs are populated (including the **real production store**, not just a local sandbox),
and all four read-side pages (two index, two detail) read `title`/`coordinates` from the blob instead
of collection data. Splitting this into smaller pieces isn't possible — shrinking the schema breaks
all four pages simultaneously.

**Files:**
- Modify: `src/content.config.ts`
- Modify: all 33 files under `src/content/granjas/*.md` (strip `title`/`coordinates` from frontmatter, keep `images`)
- Modify: all 13 files under `src/content/proyectos/*.md` (same)
- Modify: `src/pages/granjas/index.astro`
- Modify: `src/pages/proyectos/index.astro`
- Modify: `src/pages/granjas/[slug].astro`
- Modify: `src/pages/proyectos/[slug].astro`

**Interfaces:**
- Consumes: `getGranjas` from `src/lib/granjas.ts`, `getProyectos` from `src/lib/proyectos.ts` (Task 1).

- [ ] **Step 1: Write and run a one-off extraction + migration script**

This script is **not committed** — it's a one-time local tool, deleted after use, same as the earlier
tareas migration's temporary endpoint. Write it to `/tmp/migrate-granjas-proyectos.mjs`:

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

Run it from the repo root: `node /tmp/migrate-granjas-proyectos.mjs`
Expected output: `granjas: 33 proyectos: 13`

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
Expected: unique-id counts match total counts (33/33, 13/13), and both samples show a real `title` string and a `coordinates` array of strings (not `undefined`).

- [ ] **Step 3: Push both JSON files into the real production blob stores**

Per the Global Constraints' lesson-learned note: use `netlify blobs:set`, which writes directly to
the real, deployed site's store — not a local sandbox. This requires the Netlify CLI to be logged in
and this repo linked to the site (already done in earlier work on this project; if starting fresh,
run `netlify login` then `netlify link` first).

```bash
npx netlify-cli blobs:set granjas granjas --input /tmp/granjas-migrated.json
npx netlify-cli blobs:set proyectos proyectos --input /tmp/proyectos-migrated.json
```
Expected: `Success: Blob granjas set in store granjas` and the same for `proyectos`.

- [ ] **Step 4: Write and run a script to strip `title`/`coordinates` from every markdown file**

Write to `/tmp/strip-granjas-proyectos-frontmatter.mjs` (also not committed):
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
Expected: each file's frontmatter now contains only an `images:` list — no `title`, no `coordinates`.

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
(The "+ Nueva granja" / "Editar" / "Eliminar" controls are added in Task 4 — this step is purely the
data-source cutover, matching the same incremental approach the tareas plan used.)

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

- [ ] **Step 12: Populate the local dev sandbox too, so local verification is meaningful**

Step 3 wrote the real data to the *production* blob store via `netlify blobs:set` — correct for
production, but `astro dev`'s local blob emulation is a separate, empty sandbox (this is exactly the
lesson-learned note in the Global Constraints: local and production stores are never the same
store). Without this step, every page that reads `getGranjas()`/`getProyectos()` would show empty
locally, and the two detail-page curl checks below would 404 — not because anything is broken, but
because there's nothing in the local store yet. Populate it the same way the earlier tareas migration
did: a temporary, uncommitted local admin endpoint.

Create `src/pages/api/admin/migrate-granjas-proyectos.ts` (temporary — deleted at the end of this
step, never committed):
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
Expected: `{"granjas":33,"proyectos":13}`. Then delete the temporary endpoint:
```bash
rm src/pages/api/admin/migrate-granjas-proyectos.ts
rmdir src/pages/api/admin 2>/dev/null || true
```

- [ ] **Step 13: Verify via `astro dev` with real local data**

With the dev server still running (restart it with `astro dev --background` if you stopped it —
deleting the temp endpoint file doesn't clear the blob data you just wrote):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/granjas
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/proyectos
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/granjas/granja-ghast
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/proyectos/zona-industrial
```
Expected: `200` for all four. Then open `/granjas` and `/proyectos` in a browser and confirm titles
and images render correctly (same 33 granjas / 13 proyectos, same images, just sourced differently
now). Stop with `astro dev stop`.

- [ ] **Step 14: Verify a full local build succeeds**

Run: `astro build`
Expected: succeeds with no errors. (Unlike the tareas migration, this should be clean on the first
try locally — no page in this task reads a blob at prerender time; the two index pages and two detail
pages are all `prerender = false`.)

- [ ] **Step 15: Commit**

```bash
git add src/content.config.ts src/content/granjas src/content/proyectos
git add src/pages/granjas src/pages/proyectos src/components/ItemCard.astro
git commit -m "Migrate granjas/proyectos title+coordinates to Netlify Blobs"
```

---

## Task 3: CRUD API endpoints

**Files:**
- Create: `src/pages/api/granjas/index.ts`
- Create: `src/pages/api/granjas/[id].ts`
- Create: `src/pages/api/proyectos/index.ts`
- Create: `src/pages/api/proyectos/[id].ts`

**Interfaces:**
- Consumes: `createGranja`, `updateGranja`, `deleteGranja`, `parseGranjaInput`, `parseGranjaPatch` from `src/lib/granjas.ts`; the `Proyecto` equivalents from `src/lib/proyectos.ts`; `getSessionUser` from `src/lib/auth.ts` (unchanged, already exists).

- [ ] **Step 1: Write `src/pages/api/granjas/index.ts`**

```ts
import type { APIRoute } from 'astro';
import { getSessionUser } from '../../../lib/auth';
import { createGranja, parseGranjaInput } from '../../../lib/granjas';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseGranjaInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const granja = await createGranja(input);
  return Response.json(granja, { status: 201 });
};
```

- [ ] **Step 2: Write `src/pages/api/granjas/[id].ts`**

```ts
import type { APIRoute } from 'astro';
import { getSessionUser } from '../../../lib/auth';
import { updateGranja, deleteGranja, parseGranjaPatch } from '../../../lib/granjas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseGranjaPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const granja = await updateGranja(params.id!, patch);
  if (!granja) return new Response('Granja no encontrada', { status: 404 });
  return Response.json(granja);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteGranja(params.id!);
  if (!deleted) return new Response('Granja no encontrada', { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Write `src/pages/api/proyectos/index.ts`**

```ts
import type { APIRoute } from 'astro';
import { getSessionUser } from '../../../lib/auth';
import { createProyecto, parseProyectoInput } from '../../../lib/proyectos';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseProyectoInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const proyecto = await createProyecto(input);
  return Response.json(proyecto, { status: 201 });
};
```

- [ ] **Step 4: Write `src/pages/api/proyectos/[id].ts`**

```ts
import type { APIRoute } from 'astro';
import { getSessionUser } from '../../../lib/auth';
import { updateProyecto, deleteProyecto, parseProyectoPatch } from '../../../lib/proyectos';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseProyectoPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const proyecto = await updateProyecto(params.id!, patch);
  if (!proyecto) return new Response('Proyecto no encontrado', { status: 404 });
  return Response.json(proyecto);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  const user = getSessionUser(cookies);
  if (!user) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteProyecto(params.id!);
  if (!deleted) return new Response('Proyecto no encontrado', { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 5: Verify via `astro dev`**

Run `astro dev --background`. Confirm unauthenticated requests are rejected:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4321/api/granjas
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:4321/api/granjas/some-id
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:4321/api/granjas/some-id
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4321/api/proyectos
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH http://localhost:4321/api/proyectos/some-id
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:4321/api/proyectos/some-id
```
Expected: `401` for every request (no session cookie sent) — except possibly `403` from Astro's own
CSRF origin-check if the request has no matching `Origin` header (known, expected behavior already
seen with the tareas endpoints; not a bug). Stop with `astro dev stop`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/granjas src/pages/api/proyectos
git commit -m "Add granjas/proyectos CRUD API endpoints"
```

---

## Task 4: Form components + wiring into the listing pages

**Files:**
- Create: `src/components/GranjaForm.astro`
- Create: `src/components/ProyectoForm.astro`
- Modify: `src/pages/granjas/index.astro`
- Modify: `src/pages/proyectos/index.astro`

**Interfaces:**
- Consumes: `Granja` type from `src/lib/granjas.ts`, `Proyecto` type from `src/lib/proyectos.ts`, `getSessionUser` from `src/lib/auth.ts`.

- [ ] **Step 1: Write `src/components/GranjaForm.astro`**

Coordinates are edited as one per line in a plain textarea — simpler than tareas' subtareas editor
since each coordinate is a single flat string, not a multi-field record, so no dynamic add/remove-row
UI is needed here.

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

- [ ] **Step 2: Write `src/components/ProyectoForm.astro`**

Identical structure with `proyecto`/`Proyecto` naming and `data-proyecto-form`:
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

- [ ] **Step 3: Wire create/edit/delete into `src/pages/granjas/index.astro`**

Replace the whole file with:
```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import ItemCard from '../../components/ItemCard.astro';
import GranjaForm from '../../components/GranjaForm.astro';
import { getEntry } from 'astro:content';
import { getGranjas } from '../../lib/granjas';
import { getSessionUser } from '../../lib/auth';

const sessionUser = getSessionUser(Astro.cookies);

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

  {sessionUser && (
    <details class="mt-4 rounded border border-border p-3">
      <summary class="cursor-pointer text-sm font-medium">+ Nueva granja</summary>
      <div class="mt-3">
        <GranjaForm mode="create" />
      </div>
    </details>
  )}

  <ul data-stagger class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
    {
      granjas.map(({ granja, image }) => (
        <li>
          <ItemCard href={`/granjas/${granja.id}`} image={image} alt={granja.title} title={granja.title} />
          {sessionUser && (
            <div class="mt-1 flex items-center gap-3 text-xs">
              <details>
                <summary class="cursor-pointer text-accent">Editar</summary>
                <div class="mt-2">
                  <GranjaForm mode="edit" granja={granja} />
                </div>
              </details>
              <button type="button" data-delete-granja data-id={granja.id} class="text-red-500 hover:underline">
                Eliminar
              </button>
            </div>
          )}
        </li>
      ))
    }
  </ul>
</BaseLayout>

<script>
  function reloadAfterWrite() {
    // ponytail: same heuristic delay used for tareas — Netlify Blobs reads are eventually
    // consistent (measured ~1-2s propagation there); upgrade to optimistic DOM updates if flaky.
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
      fetch(`/api/granjas/${deleteBtn.dataset.id}`, { method: 'DELETE' }).then((res) => {
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
    const url = mode === 'create' ? '/api/granjas' : `/api/granjas/${form.dataset.id}`;
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

Note: unlike tareas.astro, this `<script>` has no `data-astro-rerun` — same reasoning as the earlier
fix on tareas.astro: these listeners are attached to `document` (which persists across soft
navigations), so they must attach exactly once, not re-stack on every visit.

- [ ] **Step 4: Wire create/edit/delete into `src/pages/proyectos/index.astro`**

Replace the whole file with the same structure, `proyecto`/`Proyecto` naming, `data-proyecto-form`,
`data-delete-proyecto`, and endpoints under `/api/proyectos`:
```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import ItemCard from '../../components/ItemCard.astro';
import ProyectoForm from '../../components/ProyectoForm.astro';
import { getEntry } from 'astro:content';
import { getProyectos } from '../../lib/proyectos';
import { getSessionUser } from '../../lib/auth';

const sessionUser = getSessionUser(Astro.cookies);

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

  {sessionUser && (
    <details class="mt-4 rounded border border-border p-3">
      <summary class="cursor-pointer text-sm font-medium">+ Nuevo proyecto</summary>
      <div class="mt-3">
        <ProyectoForm mode="create" />
      </div>
    </details>
  )}

  <ul data-stagger class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
    {
      proyectos.map(({ proyecto, image }) => (
        <li>
          <ItemCard href={`/proyectos/${proyecto.id}`} image={image} alt={proyecto.title} title={proyecto.title} />
          {sessionUser && (
            <div class="mt-1 flex items-center gap-3 text-xs">
              <details>
                <summary class="cursor-pointer text-accent">Editar</summary>
                <div class="mt-2">
                  <ProyectoForm mode="edit" proyecto={proyecto} />
                </div>
              </details>
              <button type="button" data-delete-proyecto data-id={proyecto.id} class="text-red-500 hover:underline">
                Eliminar
              </button>
            </div>
          )}
        </li>
      ))
    }
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
      fetch(`/api/proyectos/${deleteBtn.dataset.id}`, { method: 'DELETE' }).then((res) => {
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
    const url = mode === 'create' ? '/api/proyectos' : `/api/proyectos/${form.dataset.id}`;
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

- [ ] **Step 5: Verify via `astro dev`**

Run `astro dev --background`. Visit `/granjas` and `/proyectos` logged out — confirm no create/edit/
delete controls show, listings render as before. Confirm `astro build` still succeeds (no type/syntax
errors introduced). Stop with `astro dev stop`.

- [ ] **Step 6: Commit**

```bash
git add src/components/GranjaForm.astro src/components/ProyectoForm.astro src/pages/granjas/index.astro src/pages/proyectos/index.astro
git commit -m "Add granja/proyecto create/edit/delete UI"
```

---

## Task 5: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full local build**

Run: `astro build`
Expected: succeeds cleanly.

- [ ] **Step 2: Re-run every self-check**

```bash
node --experimental-strip-types scripts/check-tareas.mjs
node --experimental-strip-types scripts/check-auth.mjs
node --experimental-strip-types scripts/check-granjas.mjs
node --experimental-strip-types scripts/check-proyectos.mjs
```
Expected: all four print their `ok: ...` line.

- [ ] **Step 3: Deploy to a staging URL for real end-to-end verification**

Real player passcodes only ever exist in the *production* blob store (set during the earlier tareas
work) — `astro dev`'s local sandbox has no player accounts at all, so logging in locally isn't
possible. This branch also isn't in the Netlify site's `allowed_branches` yet. Enable it and trigger
a build (requires the Netlify CLI already logged in and this repo linked — already true from earlier
work on this project):
```bash
npx netlify-cli api updateSite --data '{"site_id":"d1d3b94e-1d27-4c26-8bc4-90e73418341d","body":{"build_settings":{"allowed_branches":["main","feature/granjas-proyectos-crud"]}}}'
git push origin feature/granjas-proyectos-crud
npx netlify-cli api createSiteBuild --data '{"site_id":"d1d3b94e-1d27-4c26-8bc4-90e73418341d","body":{"branch":"feature/granjas-proyectos-crud"}}'
```
Poll the returned `deploy_id` until its `state` is `ready` or `error`:
```bash
npx netlify-cli api getSiteDeploy --data '{"site_id":"d1d3b94e-1d27-4c26-8bc4-90e73418341d","deploy_id":"<deploy_id from above>"}'
```
Expected: `state: "ready"`, and the deploy's `deploy_ssl_url` field gives the staging URL to test
against (formatted like `https://<branch-name>--slayerl99.netlify.app`).

- [ ] **Step 4: Manual end-to-end verification against the staging URL**

Using the staging URL from Step 3, and a real player's username + passcode (ask the human for a
passcode if you don't have one on hand — do not guess or invent one):

1. Log in via `/login`.
2. Visit `/granjas`, expand "+ Nueva granja", create one with a title and two coordinate lines,
   submit — confirm it appears in the grid after the page reloads, with a placeholder (no image)
   card.
3. Expand "Editar" on that new granja, change its title, submit — confirm the change shows after
   reload.
4. Click "Eliminar" on it, confirm the browser dialog, confirm it disappears after reload.
5. Visit an existing granja with real images (e.g. `/granjas/granja-ghast`) — confirm its image
   gallery and coordinates still render correctly, completely unaffected by this feature.
6. Repeat steps 2-5 for `/proyectos` (create/edit/delete a proyecto; confirm an existing proyecto
   like `/proyectos/zona-industrial` still shows its images correctly).
7. Log out, confirm no create/edit/delete controls show on either listing page.

- [ ] **Step 5: Commit (if any fixes were needed during verification)**

Only if Step 4 surfaced something to fix — commit with a message describing what was found and fixed,
following the same pattern the tareas plan's post-verification bugfixes used.
