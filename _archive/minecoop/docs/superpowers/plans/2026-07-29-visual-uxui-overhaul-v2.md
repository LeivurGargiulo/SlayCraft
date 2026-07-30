# Visual UX/UI Overhaul v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the v2 design (`docs/superpowers/specs/2026-07-29-visual-uxui-overhaul-v2-design.md`) — per-section Minecraft-material colors, a bigger typographic system, a shared priority badge, and structural changes to the homepage, list pages, detail pages, sidebar, and admin.

**Architecture:** All changes land on top of the already-shipped `feature/visual-uxui-overhaul` branch (v1: tokens infra, `motion.js` tilt/parallax, `DetailHeader`, pixel font, `--color-wood`). This plan is executed in that branch's worktree, not from `main`. Work proceeds foundation-first (color tokens, `PriorityBadge`, `updatedAt`) since every structural task depends on at least one foundation piece.

**Tech Stack:** Astro 7 (SSR via `@astrojs/netlify`, `prerender = false` on every touched page), Tailwind CSS 4, TypeScript, Netlify Blobs (`@netlify/blobs`) as the data store, vanilla `<script>` for all client interactivity (no framework, no new dependencies).

## Global Constraints

- Work happens in the `feature/visual-uxui-overhaul` worktree (`.claude/worktrees/visual-uxui-overhaul`), continuing that branch — NOT based on `main`, which lacks v1's infra.
- No new npm dependencies (spec non-goal). All new interactivity (sort controls) reuses the existing vanilla `<script data-astro-rerun>` pattern already used by `tareas.astro`'s filters and `Gallery.astro`'s carousel.
- No React, no WebGL/3D engine (spec non-goal).
- No category/tag field added to granjas or proyectos (spec non-goal, explicitly declined during brainstorming).
- **Tailwind v4 dynamic-class constraint:** Tailwind's build-time scanner only generates a utility class if the literal class string appears somewhere in project source. A runtime template string like `` `border-${section}/40` `` will NOT work — the class won't exist in the compiled CSS. Any component that picks a color class based on a *variable* (a `section` prop) MUST look it up in `src/lib/section-colors.ts`'s `SECTION_COLORS` map (built in Task 1), whose literal strings Tailwind's scanner can see. Page templates where the section is fixed at author-time (e.g. `granjas/index.astro` always being granjas) may hardcode literal classes directly — no lookup needed there.
- Every touched `.astro` page already has (and keeps) `export const prerender = false;` — do not remove it.
- Dev server: `astro dev --background` (per this repo's `CLAUDE.md`); check with `astro dev status`, logs with `astro dev logs`, stop with `astro dev stop`.
- No test runner is configured (`package.json` has no `test` script). The one existing test (`src/scripts/motion.test.mjs`) runs directly via `node --test` against a plain, framework-free `.js` module — follow that shape for anything with real branching logic; trivial lookups/one-liners get no test, matching the existing repo convention.

---

### Task 1: Foundation — section color tokens + section-color class map + pixel-label utility

**Files:**
- Modify: `src/styles/global.css`
- Create: `src/lib/section-colors.ts`

**Interfaces:**
- Produces: `SectionKey` type (`'proyectos' | 'granjas' | 'jugadores' | 'tareas' | 'galeria' | 'admin' | 'accent'`) and `SECTION_COLORS: Record<SectionKey, { border: string; borderHover: string; text: string; hoverText: string; bg: string }>`, both exported from `src/lib/section-colors.ts`. Every later task that needs a per-section color imports from here.
- Produces: `.label-pixel` CSS utility class (pixel-font eyebrow label), and six new `--color-*` theme tokens, both in `src/styles/global.css`.

- [ ] **Step 1: Add the six section color tokens to `global.css`**

In `src/styles/global.css`, inside the existing `@theme { ... }` block, add these lines right after `--color-wood: #7a5233;`:

```css
  --color-proyectos: #5a9bf5;
  --color-granjas: #3fb968;
  --color-jugadores: #a371f7;
  --color-tareas: #39c5cf;
  --color-galeria: #d4a72c;
  --color-admin: #9c7ec4;
```

(Proyectos/granjas intentionally reuse the existing accent/accent-2 hex values so the base palette doesn't shift; the other four are new. All six were checked for ≥4.5:1 contrast against `--color-bg` (#0d1117) and `--color-surface` (#161b22).)

- [ ] **Step 2: Add the `.label-pixel` utility**

In `src/styles/global.css`, add this after the existing `.bg-voxel-grid { ... }` block (end of file):

```css

.label-pixel {
  font-family: var(--font-pixel);
  font-size: 0.625rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
```

- [ ] **Step 3: Create the section-color class map**

Create `src/lib/section-colors.ts`:

```ts
export type SectionKey = 'proyectos' | 'granjas' | 'jugadores' | 'tareas' | 'galeria' | 'admin' | 'accent';

interface SectionClasses {
  border: string;
  borderHover: string;
  text: string;
  hoverText: string;
  bg: string;
}

export const SECTION_COLORS: Record<SectionKey, SectionClasses> = {
  proyectos: {
    border: 'border-proyectos/40',
    borderHover: 'hover:border-proyectos/80',
    text: 'text-proyectos',
    hoverText: 'hover:text-proyectos',
    bg: 'bg-proyectos',
  },
  granjas: {
    border: 'border-granjas/40',
    borderHover: 'hover:border-granjas/80',
    text: 'text-granjas',
    hoverText: 'hover:text-granjas',
    bg: 'bg-granjas',
  },
  jugadores: {
    border: 'border-jugadores/40',
    borderHover: 'hover:border-jugadores/80',
    text: 'text-jugadores',
    hoverText: 'hover:text-jugadores',
    bg: 'bg-jugadores',
  },
  tareas: {
    border: 'border-tareas/40',
    borderHover: 'hover:border-tareas/80',
    text: 'text-tareas',
    hoverText: 'hover:text-tareas',
    bg: 'bg-tareas',
  },
  galeria: {
    border: 'border-galeria/40',
    borderHover: 'hover:border-galeria/80',
    text: 'text-galeria',
    hoverText: 'hover:text-galeria',
    bg: 'bg-galeria',
  },
  admin: {
    border: 'border-admin/40',
    borderHover: 'hover:border-admin/80',
    text: 'text-admin',
    hoverText: 'hover:text-admin',
    bg: 'bg-admin',
  },
  accent: {
    border: 'border-accent/40',
    borderHover: 'hover:border-accent/80',
    text: 'text-accent',
    hoverText: 'hover:text-accent',
    bg: 'bg-accent',
  },
};
```

- [ ] **Step 4: Verify Tailwind actually generated the new utilities**

Run: `cd .claude/worktrees/visual-uxui-overhaul && npm run build`
Then run: `grep -o '\.border-granjas\\/40{[^}]*}' dist/_astro/*.css`
Expected: a non-empty match showing the compiled rule (e.g. `.border-granjas\/40{border-color:color-mix(in srgb,#3fb968 40%,transparent)}` or equivalent). If empty, the token/class isn't wired up — check Step 1/3 before moving on. Repeat the grep for `admin`, `tareas`, `jugadores`, `galeria` to confirm all six landed.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/lib/section-colors.ts
git commit -m "feat: add per-section color tokens and pixel-label utility"
```

---

### Task 2: `PriorityBadge` shared component

**Files:**
- Create: `src/lib/priority.ts`
- Create: `src/components/PriorityBadge.astro`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PRIORITY_LABELS: Record<number, string>` (exported from `src/lib/priority.ts`, used by Task 3's filter `<select>`); `<PriorityBadge priority={number} />` Astro component (props: `priority: number`), used by Tasks 3, 4, 5.

- [ ] **Step 1: Create the priority lookup module**

Create `src/lib/priority.ts` (this is the single source of truth — `tareas.astro` currently duplicates these three maps inline, `admin/tareas.astro` shows priority as plain text with none of them; both get fixed in Tasks 3–4):

```ts
export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Muy Alta',
  2: 'Alta',
  3: 'Media',
  4: 'Baja',
  5: 'Muy Baja',
};

export const PRIORITY_BORDER_CLASS: Record<number, string> = {
  1: 'border-priority-muy-alta',
  2: 'border-priority-alta',
  3: 'border-priority-media',
  4: 'border-priority-baja',
  5: 'border-priority-muy-baja',
};

export const PRIORITY_TEXT_CLASS: Record<number, string> = {
  1: 'text-priority-muy-alta',
  2: 'text-priority-alta',
  3: 'text-priority-media',
  4: 'text-priority-baja',
  5: 'text-priority-muy-baja',
};
```

- [ ] **Step 2: Create the `PriorityBadge` component**

Create `src/components/PriorityBadge.astro` (markup is byte-for-byte what `tareas.astro` currently inlines, just parameterized):

```astro
---
import { PRIORITY_LABELS, PRIORITY_BORDER_CLASS, PRIORITY_TEXT_CLASS } from '../lib/priority';

interface Props {
  priority: number;
}
const { priority } = Astro.props;
---

<span
  class:list={[
    'rounded-full border px-2 py-0.5 text-[9px] font-pixel',
    PRIORITY_BORDER_CLASS[priority],
    PRIORITY_TEXT_CLASS[priority],
  ]}
>
  {PRIORITY_LABELS[priority]}
</span>
```

No dedicated test: this is a pure lookup + template with no branching, matching this repo's existing convention of only testing modules with real logic (see `motion.test.mjs`). It's verified visually once wired into a real page in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/lib/priority.ts src/components/PriorityBadge.astro
git commit -m "feat: add PriorityBadge component"
```

---

### Task 3: Wire `PriorityBadge` into `tareas.astro`

**Files:**
- Modify: `src/pages/tareas.astro`

**Interfaces:**
- Consumes: `PriorityBadge` (Task 2), `PRIORITY_LABELS` (Task 2).

- [ ] **Step 1: Replace the local priority maps with the shared ones, remove the now-dead ones**

In `src/pages/tareas.astro`, replace:

```ts
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
```

with:

```ts
import { PRIORITY_LABELS } from '../lib/priority';

const priorityBorderLeftClass: Record<number, string> = {
  1: 'border-l-priority-muy-alta',
  2: 'border-l-priority-alta',
  3: 'border-l-priority-media',
  4: 'border-l-priority-baja',
  5: 'border-l-priority-muy-baja',
};
```

(`priorityBorderLeftClass` stays local — it colors the `<li>`'s left border strip, a different usage than the badge. `priorityBorderClass`/`priorityTextClass` are dropped entirely since the badge markup they fed is about to be replaced by the component.)

Add the `PriorityBadge` import and update the one place `priorityLabels` was referenced for the filter `<select>` options — change:

```ts
const priorityOptions = Object.entries(priorityLabels).sort((a, b) => Number(a[0]) - Number(b[0]));
```

to:

```ts
const priorityOptions = Object.entries(PRIORITY_LABELS).sort((a, b) => Number(a[0]) - Number(b[0]));
```

Also add, near the top of the frontmatter's other imports:

```ts
import PriorityBadge from '../components/PriorityBadge.astro';
```

- [ ] **Step 2: Replace the inline badge markup**

Replace:

```astro
<span
  class:list={[
    'rounded-full border px-2 py-0.5 text-[9px] font-pixel',
    priorityBorderClass[t.priority],
    priorityTextClass[t.priority],
  ]}
>
  {priorityLabels[t.priority]}
</span>
```

with:

```astro
<PriorityBadge priority={t.priority} />
```

- [ ] **Step 3: Verify**

Run: `cd .claude/worktrees/visual-uxui-overhaul && astro dev --background`
Run: `curl -s http://localhost:4321/tareas | grep -o 'font-pixel[^<]*' | head -3`
Expected: output shows priority badge text (e.g. `Muy Alta`) still rendering — same visual result as before, now component-backed. Also confirm the priority filter `<select>` still lists all 5 levels: `curl -s http://localhost:4321/tareas | grep -o '<option value="[0-9]">[^<]*</option>'` should show 5 options.
Run: `astro dev stop`

- [ ] **Step 4: Commit**

```bash
git add src/pages/tareas.astro
git commit -m "refactor: use shared PriorityBadge in tareas.astro"
```

---

### Task 4: Wire `PriorityBadge` into `admin/tareas.astro`

**Files:**
- Modify: `src/pages/admin/tareas.astro`

**Interfaces:**
- Consumes: `PriorityBadge` (Task 2).

- [ ] **Step 1: Add the import**

At the top of `src/pages/admin/tareas.astro`'s frontmatter, add:

```ts
import PriorityBadge from '../../components/PriorityBadge.astro';
```

- [ ] **Step 2: Replace the plain-text priority with the badge**

Replace:

```astro
<span class="text-xs text-text-muted">{statusLabels[t.status]} · Prioridad {t.priority}</span>
```

with:

```astro
<span class="text-xs text-text-muted">{statusLabels[t.status]}</span>
<PriorityBadge priority={t.priority} />
```

- [ ] **Step 3: Verify**

Run: `astro dev --background`
Log in as admin (or reuse an existing session cookie if available), then:
Run: `curl -s -b "<admin-cookie>" http://localhost:4321/admin/tareas | grep -o 'font-pixel[^<]*'`
Expected: non-empty — priority now renders as a colored badge instead of the string `"Prioridad N"`. If no session cookie is available in this environment, verify visually instead: open `/admin/tareas` in a browser after logging in and confirm the priority badge appears next to each tarea's status.
Run: `astro dev stop`

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/tareas.astro
git commit -m "feat: show priority as a colored badge in admin/tareas.astro"
```

---

### Task 5: `PriorityBadge` + priority sort in `RelatedTareas.astro`

**Files:**
- Modify: `src/components/RelatedTareas.astro`

**Interfaces:**
- Consumes: `PriorityBadge` (Task 2), `Tarea` type (`src/lib/tareas.ts`, unchanged).
- Produces: no change to the `Props` interface (`{ tareas: Tarea[] }`) — behavior change only (priority-sorted, badged).

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `src/components/RelatedTareas.astro`:

```astro
---
import type { Tarea } from '../lib/tareas';
import PriorityBadge from './PriorityBadge.astro';

interface Props {
  tareas: Tarea[];
}
const { tareas } = Astro.props;
const sorted = [...tareas].sort((a, b) => a.priority - b.priority);

const statusLabels: Record<string, string> = { pendiente: 'Pendiente', 'en-progreso': 'En progreso' };
---

{
  sorted.length > 0 && (
    <div class="mt-6">
      <h2 class="text-sm font-medium text-text-muted">Tareas relacionadas</h2>
      <ul class="mt-2 flex flex-col divide-y divide-border border-t border-b border-border">
        {sorted.map((t) => (
          <li class="flex items-center gap-3 py-2 text-sm">
            <span class="font-mono text-text-muted" aria-hidden="true">
              ☐
            </span>
            <span class="uppercase">{t.title}</span>
            <PriorityBadge priority={t.priority} />
            <span class="ml-auto text-xs text-text-muted">{statusLabels[t.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run: `astro dev --background`
Run: `curl -s http://localhost:4321/granjas/<any-existing-granja-slug> | grep -o 'font-pixel[^<]*'`
(Get a real slug first: `curl -s http://localhost:4321/granjas | grep -o '/granjas/[a-z0-9-]*' | head -1`)
Expected: non-empty — related tareas now show a priority badge. Manually confirm ordering looks priority-ascending by comparing against `/tareas` for the same items.
Run: `astro dev stop`

- [ ] **Step 3: Commit**

```bash
git add src/components/RelatedTareas.astro
git commit -m "feat: sort and badge related-tareas by priority"
```

---

### Task 6: `updatedAt` timestamp on tareas/granjas/proyectos/jugadores

**Files:**
- Modify: `src/lib/tareas.ts`
- Modify: `src/lib/granjas.ts`
- Modify: `src/lib/proyectos.ts`
- Modify: `src/lib/jugadores.ts`

**Interfaces:**
- Produces: `updatedAt?: string` (ISO timestamp) on `Tarea`, `Granja`, `Proyecto`, `Jugador`. Set automatically inside each `create*`/`update*` function — no API route changes, no new form fields. Task 11 (homepage widget) and Task 12 (sort-by-recency, if used) read this field.

- [ ] **Step 1: `src/lib/tareas.ts`**

Add `updatedAt?: string;` to the `Tarea` interface (after `subtareas?: Subtarea[];`):

```ts
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
  updatedAt?: string;
}
```

Change `createTarea` and `updateTarea` to stamp it:

```ts
export async function createTarea(input: TareaInput): Promise<Tarea> {
  const tareas = await getTareas();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (tareas.some((t) => t.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const tarea: Tarea = { ...input, id, updatedAt: new Date().toISOString() };
  tareas.push(tarea);
  await saveTareas(tareas);
  return tarea;
}

export async function updateTarea(id: string, patch: Partial<TareaInput>): Promise<Tarea | null> {
  const tareas = await getTareas();
  const index = tareas.findIndex((t) => t.id === id);
  if (index === -1) return null;
  tareas[index] = { ...tareas[index], ...patch, updatedAt: new Date().toISOString() };
  await saveTareas(tareas);
  return tareas[index];
}
```

- [ ] **Step 2: `src/lib/granjas.ts`**

Add `updatedAt?: string;` to `Granja`:

```ts
export interface Granja {
  id: string;
  title: string;
  coordinates: string[];
  updatedAt?: string;
}
```

Update `createGranja`/`updateGranja`:

```ts
export async function createGranja(input: GranjaInput): Promise<Granja> {
  const granjas = await getGranjas();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (granjas.some((g) => g.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const granja: Granja = { ...input, id, updatedAt: new Date().toISOString() };
  granjas.push(granja);
  await saveGranjas(granjas);
  return granja;
}

export async function updateGranja(id: string, patch: Partial<GranjaInput>): Promise<Granja | null> {
  const granjas = await getGranjas();
  const index = granjas.findIndex((g) => g.id === id);
  if (index === -1) return null;
  granjas[index] = { ...granjas[index], ...patch, updatedAt: new Date().toISOString() };
  await saveGranjas(granjas);
  return granjas[index];
}
```

- [ ] **Step 3: `src/lib/proyectos.ts`**

Same shape as Step 2. Add `updatedAt?: string;` to `Proyecto`, then:

```ts
export async function createProyecto(input: ProyectoInput): Promise<Proyecto> {
  const proyectos = await getProyectos();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (proyectos.some((p) => p.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const proyecto: Proyecto = { ...input, id, updatedAt: new Date().toISOString() };
  proyectos.push(proyecto);
  await saveProyectos(proyectos);
  return proyecto;
}

export async function updateProyecto(id: string, patch: Partial<ProyectoInput>): Promise<Proyecto | null> {
  const proyectos = await getProyectos();
  const index = proyectos.findIndex((p) => p.id === id);
  if (index === -1) return null;
  proyectos[index] = { ...proyectos[index], ...patch, updatedAt: new Date().toISOString() };
  await saveProyectos(proyectos);
  return proyectos[index];
}
```

- [ ] **Step 4: `src/lib/jugadores.ts`**

Add `updatedAt?: string;` to `Jugador`:

```ts
export interface Jugador {
  username: string;
  actividad: Actividad;
  updatedAt?: string;
}
```

Update `createJugador`/`updateJugador` (note `createJugador` currently pushes `input` directly — it now needs to build a stamped record instead):

```ts
export async function createJugador(input: JugadorInput): Promise<Jugador | null> {
  const jugadores = await getJugadores();
  if (jugadores.some((j) => j.username === input.username)) return null;
  const jugador: Jugador = { ...input, updatedAt: new Date().toISOString() };
  jugadores.push(jugador);
  await saveJugadores(jugadores);
  return jugador;
}

export async function updateJugador(
  username: string,
  patch: Partial<Pick<Jugador, 'actividad'>>
): Promise<Jugador | null> {
  const jugadores = await getJugadores();
  const index = jugadores.findIndex((j) => j.username === username);
  if (index === -1) return null;
  jugadores[index] = { ...jugadores[index], ...patch, updatedAt: new Date().toISOString() };
  await saveJugadores(jugadores);
  return jugadores[index];
}
```

No dedicated unit test (a one-line timestamp stamp, no branching — ponytail-trivial). Verify against the real Netlify Blobs store instead, since that's how this codebase already verifies its data layer (per project history: manual/E2E verification, no data-layer test suite):

- [ ] **Step 5: Verify against a real create/update**

Run: `astro dev --background`
Log in as admin, then create a test granja via the API:
Run: `curl -s -b "<admin-cookie>" -X POST http://localhost:4321/api/admin/granjas -H "Content-Type: application/json" -d '{"title":"Test Timestamp","coordinates":["0,0,0"]}'`
Expected: JSON response includes `"updatedAt":"<ISO timestamp>"`.
Then update it: `curl -s -b "<admin-cookie>" -X PATCH http://localhost:4321/api/admin/granjas/test-timestamp -H "Content-Type: application/json" -d '{"title":"Test Timestamp 2"}'`
Expected: response's `updatedAt` is a newer timestamp than the create response.
Clean up: `curl -s -b "<admin-cookie>" -X DELETE http://localhost:4321/api/admin/granjas/test-timestamp`
Run: `astro dev stop`

- [ ] **Step 6: Commit**

```bash
git add src/lib/tareas.ts src/lib/granjas.ts src/lib/proyectos.ts src/lib/jugadores.ts
git commit -m "feat: stamp updatedAt on tarea/granja/proyecto/jugador create and update"
```

---

### Task 7: `DetailHeader` — pixel eyebrow, bigger title, section color

**Files:**
- Modify: `src/components/DetailHeader.astro`

**Interfaces:**
- Consumes: `SECTION_COLORS`, `SectionKey` (Task 1).
- Produces: new optional prop `section?: SectionKey` (default `'accent'`) on `DetailHeader`. Existing callers (which don't pass it yet) keep building and rendering with the generic accent color until Tasks 8–9 update them — this keeps the task independently shippable.

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `src/components/DetailHeader.astro`:

```astro
---
import { Image } from 'astro:assets';
import { SECTION_COLORS, type SectionKey } from '../lib/section-colors';

interface Props {
  backHref: string;
  backLabel: string;
  title: string;
  heroImage?: ImageMetadata;
  id?: string;
  section?: SectionKey;
}
const { backHref, backLabel, title, heroImage, id, section = 'accent' } = Astro.props;
const colors = SECTION_COLORS[section];
---

<nav aria-label="Breadcrumb" class="text-sm text-text-muted">
  <a href={backHref} class:list={[colors.hoverText]}>{backLabel}</a>
  <span aria-hidden="true"> / </span>
  <span class="text-text">{title}</span>
</nav>

<p class:list={['label-pixel mt-3', colors.text]}>{backLabel}</p>

{heroImage ? (
  <div class:list={['relative mt-2 overflow-hidden rounded-lg border', colors.border]}>
    <Image
      src={heroImage}
      alt={title}
      format="webp"
      quality={82}
      loading="eager"
      fetchpriority="high"
      widths={[480, 640, 960, 1280]}
      sizes="100vw"
      style={id ? `view-transition-name: hero-${id}` : undefined}
      class="h-64 w-full object-cover sm:h-80"
    />
    <div class="absolute inset-0 flex items-end bg-gradient-to-t from-bg/90 via-bg/10 to-transparent p-5">
      <h1 class="text-3xl font-bold tracking-tight text-text sm:text-4xl">{title}</h1>
    </div>
  </div>
) : (
  <h1 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
)}
```

- [ ] **Step 2: Verify existing callers still render (backward-compat check)**

Run: `astro dev --background`
Run: `curl -s http://localhost:4321/granjas/<any-existing-slug> | grep -o 'label-pixel[^<]*'`
Expected: non-empty — the new pixel eyebrow renders even though `granjas/[slug].astro` hasn't been updated to pass `section` yet (falls back to `'accent'`). Confirm the page still returns 200: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/granjas/<slug>`.
Run: `astro dev stop`

- [ ] **Step 3: Commit**

```bash
git add src/components/DetailHeader.astro
git commit -m "feat: add pixel eyebrow label, bigger title, and section color to DetailHeader"
```

---

### Task 8: Granja & Proyecto detail pages — two-column body + section color

**Files:**
- Modify: `src/pages/granjas/[slug].astro`
- Modify: `src/pages/proyectos/[slug].astro`

**Interfaces:**
- Consumes: `DetailHeader` with `section` prop (Task 7), `RelatedTareas` (unchanged interface, Task 5 behavior).

- [ ] **Step 1: Rewrite `src/pages/granjas/[slug].astro`**

Replace the `<BaseLayout>` body (frontmatter is unchanged):

```astro
<BaseLayout title={granja.title}>
  <DetailHeader
    backHref="/granjas"
    backLabel="Granjas"
    title={granja.title}
    heroImage={imageEntry?.data.images[0]}
    id={granja.id}
    section="granjas"
  />

  <div class="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
    <div>
      {imageEntry && <Gallery images={imageEntry.data.images} alt={granja.title} parallax parallaxMax={16} />}
    </div>

    <aside class="relative overflow-hidden rounded-lg border border-granjas/40 bg-surface p-4">
      <div class="bg-voxel-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden="true"></div>
      <div class="relative">
        <CoordList coordinates={granja.coordinates} />
        <RelatedTareas tareas={tareas} />
      </div>
    </aside>
  </div>
</BaseLayout>
```

- [ ] **Step 2: Rewrite `src/pages/proyectos/[slug].astro`**

Same shape, `proyectos`/`border-proyectos/40`:

```astro
<BaseLayout title={proyecto.title}>
  <DetailHeader
    backHref="/proyectos"
    backLabel="Proyectos"
    title={proyecto.title}
    heroImage={imageEntry?.data.images[0]}
    id={proyecto.id}
    section="proyectos"
  />

  <div class="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
    <div>
      {imageEntry && <Gallery images={imageEntry.data.images} alt={proyecto.title} parallax parallaxMax={16} />}
    </div>

    <aside class="relative overflow-hidden rounded-lg border border-proyectos/40 bg-surface p-4">
      <div class="bg-voxel-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden="true"></div>
      <div class="relative">
        <CoordList coordinates={proyecto.coordinates} />
        <RelatedTareas tareas={tareas} />
      </div>
    </aside>
  </div>
</BaseLayout>
```

- [ ] **Step 3: Verify at both widths**

Run: `astro dev --background`
Run: `curl -s http://localhost:4321/granjas/<slug> | grep -o 'lg:grid-cols-\[2fr_1fr\]'` — expected: one match (layout markup present).
Open the same URL in a browser (or resize devtools) at a mobile width (<1024px) and confirm it's a single stacked column, and at desktop width (≥1024px) confirm the two-column split with the sidebar visibly tinted (`border-granjas/40`).
Repeat both checks for `/proyectos/<slug>`.
Run: `astro dev stop`

- [ ] **Step 4: Commit**

```bash
git add src/pages/granjas/\[slug\].astro src/pages/proyectos/\[slug\].astro
git commit -m "feat: two-column detail layout with section color for granjas/proyectos"
```

---

### Task 9: Jugador detail page — two-column body + section color

**Files:**
- Modify: `src/pages/jugadores/[slug].astro`

**Interfaces:**
- Consumes: `DetailHeader` with `section` prop (Task 7), `RelatedTareas` (Task 5).

- [ ] **Step 1: Rewrite the page body**

Replace the `<BaseLayout>` body (frontmatter unchanged):

```astro
<BaseLayout title={username}>
  <DetailHeader backHref="/jugadores" backLabel="Jugadores" title={username} section="jugadores" />

  <div class="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
    <div class="flex items-center gap-4">
      <img
        src={skinBodyUrl(username, 240)}
        alt={username}
        width={240}
        height={300}
        data-tilt
        data-tilt-max="6"
        class="w-60 rounded-lg border border-jugadores/40 object-cover"
      />
    </div>

    <aside class="relative overflow-hidden rounded-lg border border-jugadores/40 bg-surface p-4">
      <div class="bg-voxel-grid pointer-events-none absolute inset-0 opacity-20" aria-hidden="true"></div>
      <div class="relative">
        <p class="text-sm text-text-muted">{ACTIVIDAD_LABELS[actividad]}</p>
        <RelatedTareas tareas={tareas} />
      </div>
    </aside>
  </div>
</BaseLayout>
```

- [ ] **Step 2: Verify**

Run: `astro dev --background`
Run: `curl -s http://localhost:4321/jugadores/<existing-username> | grep -o 'border-jugadores/40'` — expected: multiple matches.
Confirm 200 status and visually check both widths as in Task 8.
Run: `astro dev stop`

- [ ] **Step 3: Commit**

```bash
git add src/pages/jugadores/\[slug\].astro
git commit -m "feat: two-column detail layout with section color for jugador pages"
```

---

### Task 10: Sidebar — grouped sections + color dots

**Files:**
- Modify: `src/components/Sidebar.astro`

**Interfaces:**
- Consumes: `SECTION_COLORS` (Task 1), specifically each entry's `bg` class for the color dot.

- [ ] **Step 1: Rewrite the component**

Replace the full contents of `src/components/Sidebar.astro`:

```astro
---
import { SECTION_COLORS } from '../lib/section-colors';

const path = Astro.url.pathname;
const isActive = (href: string) => path === href || (href !== '/' && path.startsWith(href));

const icon = {
  home: '<path d="M3 9.5 8 5l5 4.5V14a1 1 0 0 1-1 1h-2.5v-3.5h-3V15H4a1 1 0 0 1-1-1V9.5Z"/>',
  proyectos: '<rect x="3" y="3" width="4" height="4" rx="0.5"/><rect x="9" y="3" width="4" height="4" rx="0.5"/><rect x="3" y="9" width="4" height="4" rx="0.5"/><rect x="9" y="9" width="4" height="4" rx="0.5"/>',
  granjas: '<path d="M2 13h12M4 13V7l4-3 4 3v6"/><path d="M7 13v-3h2v3"/>',
  mapa: '<path d="M2 4.5 6 3l4 1.5 4-1.5v9L10 13.5 6 12l-4 1.5v-9Z"/><path d="M6 3v9M10 4.5v9"/>',
  tareas: '<rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/>',
  jugadores: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/>',
  galeria: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><circle cx="6" cy="6.5" r="1.2"/><path d="M3 12l3.5-3.5L9 11l2-2 2 3"/>',
  admin: '<circle cx="8" cy="8" r="2"/><path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4.3 4.3l1.4 1.4M10.3 10.3l1.4 1.4M4.3 11.7l1.4-1.4M10.3 5.7l1.4-1.4"/>',
} as const;

const groups: { label: string; links: { href: string; label: string; icon: string; dot: string; external?: boolean }[] }[] = [
  {
    label: 'Contenido',
    links: [
      { href: '/proyectos', label: 'Proyectos', icon: icon.proyectos, dot: SECTION_COLORS.proyectos.bg },
      { href: '/granjas', label: 'Granjas', icon: icon.granjas, dot: SECTION_COLORS.granjas.bg },
      { href: '/jugadores', label: 'Jugadores', icon: icon.jugadores, dot: SECTION_COLORS.jugadores.bg },
    ],
  },
  {
    label: 'Actividad',
    links: [
      { href: '/tareas', label: 'Tareas', icon: icon.tareas, dot: SECTION_COLORS.tareas.bg },
      { href: '/galeria', label: 'Galería', icon: icon.galeria, dot: SECTION_COLORS.galeria.bg },
    ],
  },
  {
    label: 'Servidor',
    links: [{ href: 'http://190.244.136.239:25566', label: 'Mapa', icon: icon.mapa, dot: SECTION_COLORS.accent.bg, external: true }],
  },
];
---

<nav aria-label="Navegación principal" class="flex flex-col gap-4 p-4 text-sm">
  <a
    href="/"
    class:list={[
      'flex items-center gap-2.5 rounded border-l-2 px-2 py-1.5 font-medium transition-colors duration-150 hover:bg-border/40',
      path === '/' ? 'border-accent bg-border/40 text-accent' : 'border-transparent text-text',
    ]}
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" set:html={icon.home} />
    Inicio
  </a>

  {
    groups.map((group) => (
      <div>
        <p class="label-pixel px-2 text-text-muted">{group.label}</p>
        <div class="mt-1 flex flex-col gap-1">
          {group.links.map((link) => (
            <a
              href={link.href}
              target={link.external ? '_blank' : undefined}
              rel={link.external ? 'noopener noreferrer' : undefined}
              class:list={[
                'flex items-center gap-2.5 rounded border-l-2 px-2 py-1.5 font-medium transition-colors duration-150 hover:bg-border/40',
                isActive(link.href) ? 'border-accent bg-border/40 text-accent' : 'border-transparent text-text',
              ]}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" set:html={link.icon} />
              {link.label}
              <span class:list={['ml-auto h-1.5 w-1.5 rounded-full', link.dot]} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    ))
  }

  <div class="border-t border-border pt-3">
    <p class="label-pixel px-2 text-text-muted">Admin</p>
    <a
      href="/admin"
      class:list={[
        'mt-1 flex items-center gap-2.5 rounded border-l-2 px-2 py-1.5 font-medium transition-colors duration-150 hover:bg-border/40',
        isActive('/admin') ? 'border-accent bg-border/40 text-accent' : 'border-transparent text-text',
      ]}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" set:html={icon.admin} />
      Admin
    </a>
  </div>
</nav>
```

- [ ] **Step 2: Verify**

Run: `astro dev --background`
Run: `curl -s http://localhost:4321/ | grep -o 'label-pixel[^<]*'` — expected: 4 matches (`Contenido`, `Actividad`, `Servidor`, `Admin`).
Run: `curl -s http://localhost:4321/ | grep -c 'rounded-full'` — expected: at least 6 (one dot per link, plus any pre-existing rounded-full elements — sanity check it's non-zero).
Visually confirm in a browser: same total link set as before (Inicio, Proyectos, Granjas, Jugadores, Tareas, Galería, Mapa, Admin), now grouped with colored dots, and the active-page highlight still works when navigating.
Run: `astro dev stop`

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.astro
git commit -m "feat: group sidebar into labeled sections with per-link color dots"
```

---

### Task 11: Homepage bento dashboard + recently-active widget

**Files:**
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `SECTION_COLORS`, `SectionKey` (Task 1); `updatedAt` field on `Granja`/`Proyecto`/`Jugador` (Task 6).

- [ ] **Step 1: Rewrite the frontmatter**

Replace `src/pages/index.astro`'s frontmatter:

```astro
---
export const prerender = false;

import BaseLayout from '../layouts/BaseLayout.astro';
import Gallery from '../components/Gallery.astro';
import { getJugadores } from '../lib/jugadores';
import { getGranjas } from '../lib/granjas';
import { getProyectos } from '../lib/proyectos';
import { SECTION_COLORS, type SectionKey } from '../lib/section-colors';

const [jugadores, proyectos, granjas] = await Promise.all([getJugadores(), getProyectos(), getGranjas()]);

const galeriaCount = Object.keys(
  import.meta.glob('../content/galeria/img/*.{png,jpg,jpeg,svg,webp}')
).length;

const bannerModules = import.meta.glob<{ default: ImageMetadata }>('../assets/banner/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
});
const bannerImages = Object.values(bannerModules).map((mod) => mod.default);

const sections: { href: string; label: string; desc: string; key: SectionKey; external?: boolean }[] = [
  { href: '/proyectos', label: 'Proyectos', desc: 'Construcciones y estructuras del servidor.', key: 'proyectos' },
  { href: '/granjas', label: 'Granjas', desc: 'Granjas automáticas: hierro, mobs, cultivos.', key: 'granjas' },
  { href: 'http://190.244.136.239:25566', label: 'Mapa', desc: 'Imagen general del mundo.', key: 'accent', external: true },
  { href: '/tareas', label: 'Tareas', desc: 'Lista de pendientes del servidor.', key: 'tareas' },
  { href: '/jugadores', label: 'Jugadores', desc: 'Quién es quién en la cooperativa.', key: 'jugadores' },
  { href: '/galeria', label: 'Galería', desc: 'Capturas del mundo.', key: 'galeria' },
];

const recentCandidates: { type: 'granjas' | 'proyectos' | 'jugadores'; href: string; title: string; updatedAt?: string }[] = [
  ...granjas.map((g) => ({ type: 'granjas' as const, href: `/granjas/${g.id}`, title: g.title, updatedAt: g.updatedAt })),
  ...proyectos.map((p) => ({ type: 'proyectos' as const, href: `/proyectos/${p.id}`, title: p.title, updatedAt: p.updatedAt })),
  ...jugadores.map((j) => ({ type: 'jugadores' as const, href: `/jugadores/${j.username}`, title: j.username, updatedAt: j.updatedAt })),
];
const recentlyActive = recentCandidates
  .filter((c): c is typeof c & { updatedAt: string } => Boolean(c.updatedAt))
  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  .slice(0, 5);
---
```

- [ ] **Step 2: Rewrite the body**

Replace everything inside `<BaseLayout>`:

```astro
<BaseLayout title="Inicio">
  <div class="relative">
    <div
      class="pointer-events-none absolute -inset-x-8 -top-16 h-64 rounded-full blur-3xl"
      style="background: radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent);"
      aria-hidden="true"
    ></div>
    <div class="bg-voxel-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true"></div>
    <Gallery images={bannerImages} alt="" parallax parallaxMax={28} priority />
  </div>

  <p class="label-pixel mt-8 text-text-muted">Wiki interna</p>
  <h1 class="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">Minecraft Cooperativo</h1>
  <p class="mt-3 text-text-muted">Documentación interna de del mundo.</p>

  <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
    {
      [
        { value: jugadores.length, label: 'jugadores' },
        { value: proyectos.length, label: 'proyectos' },
        { value: granjas.length, label: 'granjas' },
        { value: galeriaCount, label: 'fotos' },
      ].map((stat) => (
        <div data-tilt data-tilt-max="6" class="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center">
          <p class="font-pixel text-xs text-accent-2">{stat.value}</p>
          <p class="mt-1 text-xs text-text-muted">{stat.label}</p>
        </div>
      ))
    }
    {
      sections.map((s) => (
        <a
          href={s.href}
          target={s.external ? '_blank' : undefined}
          rel={s.external ? 'noopener noreferrer' : undefined}
          data-tilt
          class:list={[
            'group relative col-span-1 flex flex-col gap-1 overflow-hidden rounded-lg border bg-surface p-3 transition-all hover:shadow-md hover:shadow-black/40',
            SECTION_COLORS[s.key].border,
            SECTION_COLORS[s.key].borderHover,
          ]}
        >
          <div class="bg-voxel-grid pointer-events-none absolute inset-0 opacity-10" aria-hidden="true"></div>
          <span class:list={['relative font-medium', SECTION_COLORS[s.key].text]}>{s.label}</span>
          <span class="relative text-sm text-text-muted">{s.desc}</span>
        </a>
      ))
    }
  </div>

  {
    recentlyActive.length > 0 && (
      <section class="mt-10">
        <p class="label-pixel text-text-muted">Actividad reciente</p>
        <h2 class="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Recién actualizado</h2>
        <ul class="mt-3 flex flex-col gap-2">
          {recentlyActive.map((item) => (
            <li>
              <a
                href={item.href}
                data-tilt
                data-tilt-max="4"
                class:list={[
                  'flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors',
                  SECTION_COLORS[item.type].borderHover,
                ]}
              >
                <span class:list={['font-medium', SECTION_COLORS[item.type].text]}>{item.title}</span>
                <span class="text-xs text-text-muted">{new Date(item.updatedAt).toLocaleDateString('es-AR')}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    )
  }
</BaseLayout>
```

(The old `<h2>Secciones</h2><ul>...</ul>` block is gone — section cards are now part of the bento grid above, alongside the stat tiles.)

- [ ] **Step 3: Verify**

Run: `astro dev --background`
Run: `curl -s http://localhost:4321/ | grep -o 'text-4xl[^"]*'` — expected: match, confirming the bigger h1.
Run: `curl -s http://localhost:4321/ | grep -o 'border-granjas/40'` — expected: at least one match (the Granjas bento card).
Since `recentlyActive` will be empty until Task 6's `updatedAt` starts getting set on real edits, also verify the "no recent activity" path doesn't crash: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/` should be `200` even with zero recently-updated records (the `{recentlyActive.length > 0 && (...)}` guard means the section just doesn't render — confirm no error in `astro dev logs`).
Then create/edit a granja via the admin API (as in Task 6 Step 5) and reload `/` — expected: the "Recién actualizado" section now appears with that granja.
Run: `astro dev stop`

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: restructure homepage into a section-colored bento dashboard with recently-active widget"
```

---

### Task 12: `ItemCard` richer treatment + granjas/proyectos index sort

**Files:**
- Modify: `src/components/ItemCard.astro`
- Modify: `src/pages/granjas/index.astro`
- Modify: `src/pages/proyectos/index.astro`

**Interfaces:**
- Consumes: `SECTION_COLORS`, `SectionKey` (Task 1), `PriorityBadge` (Task 2), `getTareas` (`src/lib/tareas.ts`, unchanged).
- Produces: new required `section: SectionKey` prop and new optional `taskCount?: number` / `topPriority?: number` props on `ItemCard`. Both callers (granjas/proyectos index pages) are updated in this same task, so there's no dangling caller left on the old 4-prop signature.

- [ ] **Step 1: Rewrite `ItemCard.astro`**

Replace the full contents of `src/components/ItemCard.astro`:

```astro
---
import { Image } from 'astro:assets';
import PriorityBadge from './PriorityBadge.astro';
import { SECTION_COLORS, type SectionKey } from '../lib/section-colors';

interface Props {
  href: string;
  id?: string;
  image?: ImageMetadata;
  alt: string;
  title: string;
  section: SectionKey;
  taskCount?: number;
  topPriority?: number;
}
const { href, id, image, alt, title, section, taskCount, topPriority } = Astro.props;
const colors = SECTION_COLORS[section];
---

<a
  href={href}
  data-tilt
  class:list={[
    'group block overflow-hidden rounded-lg border bg-surface transition-all hover:shadow-md hover:shadow-black/40',
    colors.border,
    colors.borderHover,
  ]}
>
  {image ? (
    <Image
      src={image}
      alt={alt}
      format="webp"
      quality={78}
      widths={[320, 480, 640]}
      sizes="(min-width: 640px) 33vw, 50vw"
      style={id ? `view-transition-name: hero-${id}` : undefined}
      class="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
    />
  ) : (
    <div class="aspect-[4/3] w-full bg-surface-2" aria-hidden="true" />
  )}
  <div class="flex items-center justify-between gap-2 p-2">
    <p class="truncate text-sm font-medium">{title}</p>
    <div class="flex shrink-0 items-center gap-1.5">
      {topPriority !== undefined && <PriorityBadge priority={topPriority} />}
      {taskCount !== undefined && taskCount > 0 && <span class="font-mono text-xs text-text-muted">{taskCount}</span>}
    </div>
  </div>
</a>
```

- [ ] **Step 2: Rewrite `src/pages/granjas/index.astro`**

```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import ItemCard from '../../components/ItemCard.astro';
import { getEntry } from 'astro:content';
import { getGranjas } from '../../lib/granjas';
import { getTareas } from '../../lib/tareas';

const allTareas = await getTareas();
const rawGranjas = (await getGranjas()).sort((a, b) => a.title.localeCompare(b.title));
const granjas = await Promise.all(
  rawGranjas.map(async (g) => {
    const entry = await getEntry('granjas', g.id);
    const related = allTareas.filter((t) => t.granjas?.includes(g.id) && t.priority > 0);
    const topPriority = related.length > 0 ? Math.min(...related.map((t) => t.priority)) : undefined;
    return { granja: g, image: entry?.data.images[0], taskCount: related.length, topPriority };
  })
);
---

<BaseLayout title="Granjas">
  <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Granjas</h1>
  <p class="mt-2 text-text-muted">Granjas automáticas del servidor.</p>

  <div class="mt-4">
    <select id="sort-granjas" class="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text">
      <option value="alpha">Ordenar: alfabético</option>
      <option value="tareas">Más tareas pendientes</option>
      <option value="priority">Mayor prioridad</option>
    </select>
  </div>

  <ul id="granjas-list" data-stagger class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
    {
      granjas.map(({ granja, image, taskCount, topPriority }) => (
        <li data-title={granja.title} data-task-count={taskCount} data-top-priority={topPriority ?? 99}>
          <ItemCard
            href={`/granjas/${granja.id}`}
            id={granja.id}
            image={image}
            alt={granja.title}
            title={granja.title}
            section="granjas"
            taskCount={taskCount}
            topPriority={topPriority}
          />
        </li>
      ))
    }
  </ul>
</BaseLayout>

<script data-astro-rerun>
  const select = document.getElementById('sort-granjas');
  const list = document.getElementById('granjas-list');
  const comparators = {
    alpha: (a, b) => a.dataset.title.localeCompare(b.dataset.title),
    tareas: (a, b) => Number(b.dataset.taskCount) - Number(a.dataset.taskCount),
    priority: (a, b) => Number(a.dataset.topPriority) - Number(b.dataset.topPriority),
  };
  select?.addEventListener('change', () => {
    const items = [...list.children];
    items.sort(comparators[select.value]);
    items.forEach((li) => list.appendChild(li));
  });
</script>
```

- [ ] **Step 3: Rewrite `src/pages/proyectos/index.astro`**

Identical shape, `proyectos`/`granjas`→`proyectos` swapped throughout:

```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import ItemCard from '../../components/ItemCard.astro';
import { getEntry } from 'astro:content';
import { getProyectos } from '../../lib/proyectos';
import { getTareas } from '../../lib/tareas';

const allTareas = await getTareas();
const rawProyectos = (await getProyectos()).sort((a, b) => a.title.localeCompare(b.title));
const proyectos = await Promise.all(
  rawProyectos.map(async (p) => {
    const entry = await getEntry('proyectos', p.id);
    const related = allTareas.filter((t) => t.proyectos?.includes(p.id) && t.priority > 0);
    const topPriority = related.length > 0 ? Math.min(...related.map((t) => t.priority)) : undefined;
    return { proyecto: p, image: entry?.data.images[0], taskCount: related.length, topPriority };
  })
);
---

<BaseLayout title="Proyectos">
  <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Proyectos</h1>
  <p class="mt-2 text-text-muted">Construcciones y estructuras del servidor.</p>

  <div class="mt-4">
    <select id="sort-proyectos" class="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text">
      <option value="alpha">Ordenar: alfabético</option>
      <option value="tareas">Más tareas pendientes</option>
      <option value="priority">Mayor prioridad</option>
    </select>
  </div>

  <ul id="proyectos-list" data-stagger class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
    {
      proyectos.map(({ proyecto, image, taskCount, topPriority }) => (
        <li data-title={proyecto.title} data-task-count={taskCount} data-top-priority={topPriority ?? 99}>
          <ItemCard
            href={`/proyectos/${proyecto.id}`}
            id={proyecto.id}
            image={image}
            alt={proyecto.title}
            title={proyecto.title}
            section="proyectos"
            taskCount={taskCount}
            topPriority={topPriority}
          />
        </li>
      ))
    }
  </ul>
</BaseLayout>

<script data-astro-rerun>
  const select = document.getElementById('sort-proyectos');
  const list = document.getElementById('proyectos-list');
  const comparators = {
    alpha: (a, b) => a.dataset.title.localeCompare(b.dataset.title),
    tareas: (a, b) => Number(b.dataset.taskCount) - Number(a.dataset.taskCount),
    priority: (a, b) => Number(a.dataset.topPriority) - Number(b.dataset.topPriority),
  };
  select?.addEventListener('change', () => {
    const items = [...list.children];
    items.sort(comparators[select.value]);
    items.forEach((li) => list.appendChild(li));
  });
</script>
```

- [ ] **Step 4: Verify**

Run: `astro dev --background`
Run: `curl -s http://localhost:4321/granjas | grep -o 'id="sort-granjas"'` — expected: one match.
Manually check in a browser: `/granjas` and `/proyectos` render cards with a task-count number (and a priority badge for items with pending tareas), changing the sort `<select>` visibly reorders the grid. Confirm `/proyectos/<slug>` and `/granjas/<slug>` (touched in Task 8) still work — this task didn't change them, but it did change `ItemCard`'s required props, and only the two index pages use it, so no other caller to check.
Run: `astro dev stop`

- [ ] **Step 5: Commit**

```bash
git add src/components/ItemCard.astro src/pages/granjas/index.astro src/pages/proyectos/index.astro
git commit -m "feat: richer ItemCard (task count, priority, section color) with client-side sort"
```

---

### Task 13: Jugadores list — richer cards + sort

**Files:**
- Modify: `src/pages/jugadores.astro`

**Interfaces:**
- Consumes: `getTareas` (unchanged).

- [ ] **Step 1: Rewrite the page**

```astro
---
export const prerender = false;

import BaseLayout from '../layouts/BaseLayout.astro';
import { ACTIVIDAD_LABELS, skinBodyUrl, type Actividad } from '../data/jugadores';
import { getJugadores } from '../lib/jugadores';
import { getTareas } from '../lib/tareas';

const jugadores = await getJugadores();
const allTareas = await getTareas();
const taskCountByUser = (username: string) =>
  allTareas.filter(
    (t) => t.assignee?.includes(username) || t.subtareas?.some((s) => s.assignee?.includes(username))
  ).length;

const groups: Actividad[] = ['activo', 'ocasional', 'inactivo'];
const byActividad = (a: Actividad) =>
  jugadores
    .filter((j) => j.actividad === a)
    .sort((x, y) => x.username.localeCompare(y.username))
    .map((j) => ({ ...j, taskCount: taskCountByUser(j.username) }));
---

<BaseLayout title="Jugadores">
  <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">Jugadores</h1>
  <p class="mt-2 text-text-muted">Quién es quién en la cooperativa.</p>

  <div class="mt-4">
    <select id="sort-jugadores" class="rounded border border-border bg-surface px-2 py-1.5 text-sm text-text">
      <option value="alpha">Ordenar: alfabético</option>
      <option value="tareas">Más tareas asignadas</option>
    </select>
  </div>

  {
    groups.map((actividad) => {
      const items = byActividad(actividad);
      return (
        items.length > 0 && (
          <section class="mt-8">
            <h2 class="text-lg font-bold tracking-tight">
              {ACTIVIDAD_LABELS[actividad]} <span class="font-mono text-sm font-normal text-text-muted">({items.length})</span>
            </h2>
            <ul data-jugadores-group data-stagger class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {items.map(({ username, taskCount }) => (
                <li data-username={username} data-task-count={taskCount}>
                  <a
                    href={`/jugadores/${username}`}
                    data-tilt
                    data-tilt-max="6"
                    class="group flex flex-col items-center gap-2 rounded-lg border border-jugadores/40 p-2 transition-all hover:border-jugadores/80 hover:shadow-md hover:shadow-black/40"
                  >
                    <img
                      src={skinBodyUrl(username, 160)}
                      alt={username}
                      width={160}
                      height={200}
                      loading="lazy"
                      class="w-32 rounded-lg border border-border object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                    <p class="font-medium">{username}</p>
                    {taskCount > 0 && <span class="font-mono text-xs text-text-muted">{taskCount} tareas</span>}
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

<script data-astro-rerun>
  const select = document.getElementById('sort-jugadores');
  const comparators = {
    alpha: (a, b) => a.dataset.username.localeCompare(b.dataset.username),
    tareas: (a, b) => Number(b.dataset.taskCount) - Number(a.dataset.taskCount),
  };
  select?.addEventListener('change', () => {
    document.querySelectorAll('[data-jugadores-group]').forEach((list) => {
      const items = [...list.children];
      items.sort(comparators[select.value]);
      items.forEach((li) => list.appendChild(li));
    });
  });
</script>
```

- [ ] **Step 2: Verify**

Run: `astro dev --background`
Run: `curl -s http://localhost:4321/jugadores | grep -o 'id="sort-jugadores"'` — expected: one match.
Visually confirm in a browser: groups (Activo/Ocasional/Inactivo) are unchanged, cards show a task count when >0, and switching the sort `<select>` reorders players within each group independently.
Run: `astro dev stop`

- [ ] **Step 3: Commit**

```bash
git add src/pages/jugadores.astro
git commit -m "feat: richer jugador cards (task count, section color) with client-side sort"
```

---

### Task 14: Admin index — bento dashboard

**Files:**
- Modify: `src/pages/admin/index.astro`

**Interfaces:**
- Consumes: `SECTION_COLORS`, `SectionKey` (Task 1).

- [ ] **Step 1: Rewrite the page**

```astro
---
export const prerender = false;

import BaseLayout from '../../layouts/BaseLayout.astro';
import { isAdmin } from '../../lib/admin-auth';
import { getTareas } from '../../lib/tareas';
import { getGranjas } from '../../lib/granjas';
import { getProyectos } from '../../lib/proyectos';
import { getJugadores } from '../../lib/jugadores';
import { SECTION_COLORS, type SectionKey } from '../../lib/section-colors';

if (!isAdmin(Astro.cookies)) return Astro.redirect('/admin/login');

const [tareas, granjas, proyectos, jugadores] = await Promise.all([
  getTareas(),
  getGranjas(),
  getProyectos(),
  getJugadores(),
]);

const sections: { href: string; label: string; count: number; key: SectionKey }[] = [
  { href: '/admin/tareas', label: 'Tareas', count: tareas.length, key: 'tareas' },
  { href: '/admin/granjas', label: 'Granjas', count: granjas.length, key: 'granjas' },
  { href: '/admin/proyectos', label: 'Proyectos', count: proyectos.length, key: 'proyectos' },
  { href: '/admin/jugadores', label: 'Jugadores', count: jugadores.length, key: 'jugadores' },
];
---

<BaseLayout title="Admin">
  <div class="flex items-center justify-between">
    <div>
      <p class="label-pixel text-admin">Panel</p>
      <h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Administración</h1>
    </div>
    <form method="POST" action="/api/admin/logout">
      <button type="submit" class="text-sm text-admin hover:underline">Cerrar sesión</button>
    </form>
  </div>

  <ul class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
    {
      sections.map((s) => (
        <li>
          <a
            href={s.href}
            data-tilt
            class:list={[
              'block rounded-lg border bg-surface p-4 transition-colors',
              SECTION_COLORS[s.key].border,
              SECTION_COLORS[s.key].borderHover,
            ]}
          >
            <p class:list={['text-2xl font-bold', SECTION_COLORS[s.key].text]}>{s.count}</p>
            <p class="text-sm text-text-muted">{s.label}</p>
          </a>
        </li>
      ))
    }
  </ul>
</BaseLayout>
```

- [ ] **Step 2: Verify**

Run: `astro dev --background`
Log in as admin, then: `curl -s -b "<admin-cookie>" http://localhost:4321/admin | grep -o 'label-pixel[^<]*'` — expected: one match (`Panel`).
Run: `curl -s -b "<admin-cookie>" http://localhost:4321/admin | grep -o 'border-tareas/40\|border-granjas/40\|border-proyectos/40\|border-jugadores/40'` — expected: all four present.
Run: `astro dev stop`

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/index.astro
git commit -m "feat: restructure admin dashboard into a section-colored bento layout"
```

---

### Task 15: Admin CRUD pages — section-color accents

**Files:**
- Modify: `src/pages/admin/tareas.astro`
- Modify: `src/pages/admin/granjas.astro`
- Modify: `src/pages/admin/proyectos.astro`
- Modify: `src/pages/admin/jugadores.astro`

**Interfaces:**
- Consumes: nothing new — literal Tailwind classes only (each file's section is fixed at author-time, no lookup needed per the Global Constraints note).

- [ ] **Step 1: `src/pages/admin/tareas.astro`**

Change the back-link and heading:

```astro
<a href="/admin" class="text-sm text-text-muted hover:text-tareas">← Admin</a>
<p class="label-pixel mt-2 text-tareas">Tareas</p>
<h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
  Tareas <span class="font-mono text-sm font-normal text-text-muted">({tareas.length})</span>
</h1>
```

(Remove the old `<h1 class="mt-2 text-2xl font-semibold">Tareas ...</h1>` line it replaces.) Also change every `<summary class="cursor-pointer text-xs text-accent">Editar</summary>` to `<summary class="cursor-pointer text-xs text-tareas">Editar</summary>` (one occurrence).

- [ ] **Step 2: `src/pages/admin/granjas.astro`**

Same pattern:

```astro
<a href="/admin" class="text-sm text-text-muted hover:text-granjas">← Admin</a>
<p class="label-pixel mt-2 text-granjas">Granjas</p>
<h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
  Granjas <span class="font-mono text-sm font-normal text-text-muted">({granjas.length})</span>
</h1>
```

And `<summary class="cursor-pointer text-xs text-granjas">Editar</summary>`.

- [ ] **Step 3: `src/pages/admin/proyectos.astro`**

```astro
<a href="/admin" class="text-sm text-text-muted hover:text-proyectos">← Admin</a>
<p class="label-pixel mt-2 text-proyectos">Proyectos</p>
<h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
  Proyectos <span class="font-mono text-sm font-normal text-text-muted">({proyectos.length})</span>
</h1>
```

And `<summary class="cursor-pointer text-xs text-proyectos">Editar</summary>`.

- [ ] **Step 4: `src/pages/admin/jugadores.astro`**

```astro
<a href="/admin" class="text-sm text-text-muted hover:text-jugadores">← Admin</a>
<p class="label-pixel mt-2 text-jugadores">Jugadores</p>
<h1 class="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
  Jugadores <span class="font-mono text-sm font-normal text-text-muted">({jugadores.length})</span>
</h1>
```

And `<summary class="cursor-pointer text-xs text-jugadores">Editar</summary>`.

- [ ] **Step 5: Verify**

Run: `astro dev --background`
Log in as admin, then for each of the four pages: `curl -s -b "<admin-cookie>" http://localhost:4321/admin/<page> | grep -o 'label-pixel[^<]*'` — expected: one match each (`Tareas`, `Granjas`, `Proyectos`, `Jugadores`).
Confirm none of the CRUD forms/JS broke: create a throwaway record on each of the four pages via the UI (or curl, as in Task 6 Step 5), confirm it appears in the list, then delete it.
Run: `astro dev stop`

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/tareas.astro src/pages/admin/granjas.astro src/pages/admin/proyectos.astro src/pages/admin/jugadores.astro
git commit -m "feat: apply section-color accents to admin CRUD pages"
```

---

## Self-Review Notes

- **Spec coverage:** §1 color tokens → Task 1. §2 typography/pixel labels → Tasks 1, 7, 11, 13, 14, 15 (bumped per-page as each page is touched, per the plan's stated rationale for not doing a separate global pass). §3 `PriorityBadge` → Tasks 2–5. §4 `updatedAt` → Task 6. §5 homepage bento → Task 11. §6 list pages → Tasks 12–13. §7 detail pages → Tasks 8–9. §8 sidebar → Task 10. §9 admin parity → Tasks 14–15. §10 motion — no new task needed; `data-tilt`/`data-parallax` are reused as-is on new markup throughout Tasks 8, 9, 11, 12, 13, 14, matching the existing mechanism.
- **Type consistency checked:** `SectionKey` (Task 1) is used identically in `DetailHeader` (Task 7), `ItemCard` (Task 12), `Sidebar` (Task 10), `index.astro`/`admin/index.astro` (Tasks 11/14) — same seven-member union throughout. `PriorityBadge`'s `priority: number` prop matches `Tarea.priority: number` everywhere it's called (Tasks 3, 4, 5, 12).
- **Ordering dependency called out explicitly:** Task 7 defaults `section` to `'accent'` specifically so it doesn't break Tasks 8/9's not-yet-updated callers if run/reviewed as separate steps — documented in Task 7's Interfaces block.
