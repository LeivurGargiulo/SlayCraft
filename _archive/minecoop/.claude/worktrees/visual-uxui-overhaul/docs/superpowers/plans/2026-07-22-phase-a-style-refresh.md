# Phase A: Style Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dedup proyectos/granjas markup into shared components and apply a consistent visual polish pass (cards, sidebar, pills, task priority) across the MineCoop Wiki, per `docs/superpowers/specs/2026-07-22-phase-a-style-refresh-design.md`.

**Architecture:** Pure Astro component + Tailwind class changes. No new dependencies, no data/schema changes, no new pages. Two new shared components (`ItemCard`, `RelatedTareas`) replace duplicated markup; the rest is targeted class-string edits to existing files.

**Tech Stack:** Astro 7, Tailwind 4 (`@theme` tokens in `src/styles/global.css`).

## Global Constraints

- Subtle refinement only — keep the existing dark palette/family, no thematic (pixel-art) pivot.
- No new npm dependencies.
- No IA/navigation restructuring, no animation work, no 3D render work — those are Phases B/C/D, out of scope here.
- No new content or schema changes.
- Dev server runs via `astro dev --background` per project CLAUDE.md; verify with `astro dev status` / curl against `http://localhost:4321`, not a test framework (this project has none, and the spec's own Testing section calls for manual visual verification, not fabricated unit tests).

## Design Deviations (found during planning)

Two items from the design spec turned out to need no code change once audited — noted here instead of a task so the spec's intent is traceable:

- **Typography normalization:** the spec's two target scales ("group header" = `text-lg font-semibold`, "section label" = `text-sm font-medium text-text-muted`) already match every existing header in the codebase once `RelatedTareas` (Task 2) is extracted. No page uses a third scale. No separate typography task is needed.
- **Global contrast bump:** computed WCAG contrast ratios for `--color-text-muted` (`#8b949e`) are 6.16:1 against `--color-bg` and 5.63:1 against `--color-surface` — both already clear the AA threshold (4.5:1) for normal text. The speculative "bump border/text-muted contrast" line in the design doc doesn't correspond to an actual defect, so it's dropped rather than changing colors with no measured problem.

---

### Task 1: `ItemCard` component — dedup proyectos/granjas grid cards

**Files:**
- Create: `src/components/ItemCard.astro`
- Modify: `src/pages/proyectos/index.astro`
- Modify: `src/pages/granjas/index.astro`

**Interfaces:**
- Produces: `ItemCard.astro` with `Props { href: string; image: ImageMetadata; alt: string; title: string }`, rendering an `<a>` card (used directly inside a `<li>` by callers).

- [ ] **Step 1: Create `src/components/ItemCard.astro`**

```astro
---
import { Image } from 'astro:assets';

interface Props {
  href: string;
  image: ImageMetadata;
  alt: string;
  title: string;
}
const { href, image, alt, title } = Astro.props;
---

<a
  href={href}
  class="group block overflow-hidden rounded-lg border border-border bg-surface transition-all hover:border-accent hover:shadow-md hover:shadow-black/40"
>
  <Image
    src={image}
    alt={alt}
    class="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
  />
  <p class="p-2 text-sm font-medium">{title}</p>
</a>
```

- [ ] **Step 2: Replace the card markup in `src/pages/proyectos/index.astro`**

Full file becomes:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ItemCard from '../../components/ItemCard.astro';
import { getCollection } from 'astro:content';

const proyectos = (await getCollection('proyectos')).sort((a, b) => a.data.title.localeCompare(b.data.title));
---

<BaseLayout title="Proyectos">
  <h1 class="text-2xl font-semibold">Proyectos</h1>
  <p class="mt-2 text-text-muted">Construcciones y estructuras del servidor.</p>

  <ul class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
    {
      proyectos.map((p) => (
        <li>
          <ItemCard href={`/proyectos/${p.id}`} image={p.data.images[0]} alt={p.data.title} title={p.data.title} />
        </li>
      ))
    }
  </ul>
</BaseLayout>
```

- [ ] **Step 3: Replace the card markup in `src/pages/granjas/index.astro`**

Full file becomes:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import ItemCard from '../../components/ItemCard.astro';
import { getCollection } from 'astro:content';

const granjas = (await getCollection('granjas')).sort((a, b) => a.data.title.localeCompare(b.data.title));
---

<BaseLayout title="Granjas">
  <h1 class="text-2xl font-semibold">Granjas</h1>
  <p class="mt-2 text-text-muted">Granjas automáticas del servidor.</p>

  <ul class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
    {
      granjas.map((g) => (
        <li>
          <ItemCard href={`/granjas/${g.id}`} image={g.data.images[0]} alt={g.data.title} title={g.data.title} />
        </li>
      ))
    }
  </ul>
</BaseLayout>
```

- [ ] **Step 4: Verify**

Confirm the dev server is up (start it if not, per project convention):

```bash
astro dev status || astro dev --background
```

```bash
curl -s http://localhost:4321/proyectos | grep -c 'hover:border-accent hover:shadow-md'
curl -s http://localhost:4321/granjas | grep -c 'hover:border-accent hover:shadow-md'
```

Expected: both commands print a number `>= 1` (the `ItemCard` markup is present on both pages), and neither page returns a 500/empty body.

- [ ] **Step 5: Commit**

```bash
git add src/components/ItemCard.astro src/pages/proyectos/index.astro src/pages/granjas/index.astro
git commit -m "Extract ItemCard component, dedup proyectos/granjas grids"
```

---

### Task 2: `RelatedTareas` component — dedup proyectos/granjas detail task lists

**Files:**
- Create: `src/components/RelatedTareas.astro`
- Modify: `src/pages/proyectos/[slug].astro`
- Modify: `src/pages/granjas/[slug].astro`

**Interfaces:**
- Consumes: `CollectionEntry<'tareas'>[]` (same shape produced by `getCollection('tareas')` filtered by caller).
- Produces: `RelatedTareas.astro` with `Props { tareas: CollectionEntry<'tareas'>[] }`, renders nothing when `tareas.length === 0`.

- [ ] **Step 1: Create `src/components/RelatedTareas.astro`**

```astro
---
import type { CollectionEntry } from 'astro:content';

interface Props {
  tareas: CollectionEntry<'tareas'>[];
}
const { tareas } = Astro.props;

const statusLabels: Record<string, string> = { pendiente: 'Pendiente', 'en-progreso': 'En progreso' };
---

{
  tareas.length > 0 && (
    <div class="mt-6">
      <h2 class="text-sm font-medium text-text-muted">Tareas relacionadas</h2>
      <ul class="mt-2 flex flex-col divide-y divide-border border-t border-b border-border">
        {tareas.map((t) => (
          <li class="flex items-center gap-3 py-2 text-sm">
            <span class="font-mono text-text-muted" aria-hidden="true">
              ☐
            </span>
            <span class="uppercase">{t.data.title}</span>
            <span class="ml-auto text-xs text-text-muted">{statusLabels[t.data.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Update `src/pages/proyectos/[slug].astro`**

Full file becomes:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import CoordList from '../../components/CoordList.astro';
import Gallery from '../../components/Gallery.astro';
import RelatedTareas from '../../components/RelatedTareas.astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const proyectos = await getCollection('proyectos');
  return proyectos.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { data } = entry;

const tareas = (await getCollection('tareas')).filter((t) => t.data.proyectos?.some((ref) => ref.id === entry.id));
---

<BaseLayout title={data.title}>
  <a href="/proyectos" class="text-sm text-text-muted hover:text-accent">← Proyectos</a>

  <h1 class="mt-2 text-2xl font-semibold">{data.title}</h1>

  <div class="mt-6">
    <Gallery images={data.images} alt={data.title} />
  </div>

  <div class="mt-8">
    <CoordList coordinates={data.coordinates} />
  </div>

  <RelatedTareas tareas={tareas} />
</BaseLayout>
```

- [ ] **Step 3: Update `src/pages/granjas/[slug].astro`**

Full file becomes:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import CoordList from '../../components/CoordList.astro';
import Gallery from '../../components/Gallery.astro';
import RelatedTareas from '../../components/RelatedTareas.astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const granjas = await getCollection('granjas');
  return granjas.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { data } = entry;

const tareas = (await getCollection('tareas')).filter((t) => t.data.granjas?.some((ref) => ref.id === entry.id));
---

<BaseLayout title={data.title}>
  <a href="/granjas" class="text-sm text-text-muted hover:text-accent">← Granjas</a>

  <h1 class="mt-2 text-2xl font-semibold">{data.title}</h1>

  <div class="mt-6">
    <Gallery images={data.images} alt={data.title} />
  </div>

  <div class="mt-8">
    <CoordList coordinates={data.coordinates} />
  </div>

  <RelatedTareas tareas={tareas} />
</BaseLayout>
```

- [ ] **Step 4: Verify**

Pick one existing proyecto slug and one granja slug to check (any entry under `src/content/proyectos` / `src/content/granjas` works):

```bash
curl -s http://localhost:4321/proyectos/spawn | grep -c 'Coordenadas\|Copiar\|Tareas relacionadas\|coord'
curl -s http://localhost:4321/granjas/granja-hierro | grep -c 'Copiar'
```

Expected: both pages return 200 with body content (non-empty `grep -c` output, i.e. `>= 0` is fine as long as curl doesn't error — the key check is the page renders). Also directly confirm no server error:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/proyectos/spawn
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/granjas/granja-hierro
```

Expected: both print `200`.

- [ ] **Step 5: Commit**

```bash
git add src/components/RelatedTareas.astro src/pages/proyectos/\[slug\].astro src/pages/granjas/\[slug\].astro
git commit -m "Extract RelatedTareas component, dedup proyecto/granja detail pages"
```

---

### Task 3: Sidebar active-state accent bar

**Files:**
- Modify: `src/components/Sidebar.astro`

- [ ] **Step 1: Update the active/inactive classes**

Replace the full contents of `src/components/Sidebar.astro` with:

```astro
---
const path = Astro.url.pathname;
const isActive = (href: string) => path === href || (href !== '/' && path.startsWith(href));

const links = [
  { href: '/proyectos', label: 'Proyectos' },
  { href: '/granjas', label: 'Granjas' },
  { href: '/mapa', label: 'Mapa' },
  { href: '/tareas', label: 'Tareas' },
  { href: '/jugadores', label: 'Jugadores' },
  { href: '/galeria', label: 'Galería' },
];
---

<nav aria-label="Navegación principal" class="flex flex-col gap-1 p-4 text-sm">
  <a
    href="/"
    class:list={[
      'rounded border-l-2 px-2 py-1.5 font-medium hover:bg-border/40',
      path === '/' ? 'border-accent bg-border/40 text-accent' : 'border-transparent text-text',
    ]}
  >
    Inicio
  </a>

  {
    links.map((link) => (
      <a
        href={link.href}
        class:list={[
          'rounded border-l-2 px-2 py-1.5 font-medium hover:bg-border/40',
          isActive(link.href) ? 'border-accent bg-border/40 text-accent' : 'border-transparent text-text',
        ]}
      >
        {link.label}
      </a>
    ))
  }
</nav>
```

- [ ] **Step 2: Verify**

```bash
curl -s http://localhost:4321/proyectos | grep -c 'border-accent bg-border/40 text-accent'
```

Expected: `1` (exactly the "Proyectos" link is active on the `/proyectos` page).

```bash
curl -s http://localhost:4321/ | grep -c 'border-accent bg-border/40 text-accent'
```

Expected: `1` (exactly the "Inicio" link is active on `/`).

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.astro
git commit -m "Add left accent bar to active sidebar link"
```

---

### Task 4: Card polish — jugadores grid + galería thumbnails

**Files:**
- Modify: `src/pages/jugadores.astro`
- Modify: `src/pages/galeria.astro`

- [ ] **Step 1: Update the jugadores grid item**

In `src/pages/jugadores.astro`, replace the `<li>` block inside the `jugadores.map(...)` call:

Old:
```astro
        <li class="flex flex-col items-center gap-2">
          <Image
            src={j.data.skinImage}
            alt={j.data.username}
            width={160}
            height={200}
            class="w-32 rounded border border-border object-cover"
          />
          <p class="font-medium">{j.data.username}</p>
        </li>
```

New:
```astro
        <li class="group flex flex-col items-center gap-2">
          <Image
            src={j.data.skinImage}
            alt={j.data.username}
            width={160}
            height={200}
            class="w-32 rounded-lg border border-border object-cover transition-all group-hover:border-accent group-hover:shadow-md group-hover:shadow-black/40"
          />
          <p class="font-medium">{j.data.username}</p>
        </li>
```

- [ ] **Step 2: Update the galería thumbnail button**

In `src/pages/galeria.astro`, replace the thumbnail button:

Old:
```astro
        <button type="button" data-lightbox-trigger class="group overflow-hidden rounded border border-border bg-surface">
          <Image src={img} alt="" width={1200} class="aspect-[4/3] w-full object-cover transition-opacity group-hover:opacity-80" />
        </button>
```

New:
```astro
        <button
          type="button"
          data-lightbox-trigger
          class="group overflow-hidden rounded-lg border border-border bg-surface transition-all hover:border-accent hover:shadow-md hover:shadow-black/40"
        >
          <Image
            src={img}
            alt=""
            width={1200}
            class="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        </button>
```

- [ ] **Step 3: Verify**

```bash
curl -s http://localhost:4321/jugadores | grep -c 'group-hover:border-accent group-hover:shadow-md'
curl -s http://localhost:4321/galeria | grep -c 'hover:border-accent hover:shadow-md'
```

Expected: both print a number `>= 1`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/jugadores.astro src/pages/galeria.astro
git commit -m "Polish jugadores grid and galeria thumbnail hover states"
```

---

### Task 5: Pills/tags polish — tareas tags + CoordList copy button

**Files:**
- Modify: `src/pages/tareas.astro`
- Modify: `src/components/CoordList.astro`

- [ ] **Step 1: Update tag pill classes in `src/pages/tareas.astro`**

Replace both occurrences (proyectos tags and granjas tags) of:

Old:
```
                                class="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-text-muted hover:border-accent hover:text-accent"
```

New (applies to both the `proyectos.map` and `granjas.map` tag links):
```
                                class="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-xs text-text transition-colors hover:border-accent hover:text-accent"
```

- [ ] **Step 2: Update the "Copiar" button in `src/components/CoordList.astro`**

Old:
```astro
        <button
          type="button"
          data-copy={value}
          class="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-text-muted hover:border-accent hover:text-accent"
        >
          Copiar
        </button>
```

New:
```astro
        <button
          type="button"
          data-copy={value}
          class="shrink-0 rounded border border-border px-2.5 py-1 text-xs text-text transition-colors hover:border-accent hover:text-accent"
        >
          Copiar
        </button>
```

- [ ] **Step 3: Verify**

```bash
curl -s http://localhost:4321/tareas | grep -c 'rounded-full border border-border bg-surface px-2.5 py-1'
curl -s http://localhost:4321/proyectos/spawn | grep -c 'data-copy'
```

Expected: first command `>= 1` if any tareas currently have proyecto/granja tags (check `src/content/tareas/*.md` if it prints `0` — that's fine only if no task actually references a proyecto/granja; confirm by checking `grep -l 'proyectos:\|granjas:' src/content/tareas/*.md`). Second command `>= 1` (CoordList renders on the proyecto detail page).

- [ ] **Step 4: Commit**

```bash
git add src/pages/tareas.astro src/components/CoordList.astro
git commit -m "Tighten padding and raise resting contrast on pill/tag buttons"
```

---

### Task 6: Tareas priority color indicator

**Files:**
- Modify: `src/styles/global.css`
- Modify: `src/pages/tareas.astro`

**Interfaces:**
- Produces: three new Tailwind color tokens — `border-priority-alta`, `border-priority-media`, `border-priority-baja` (and their `bg-`/`text-` counterparts, generated automatically by Tailwind 4 from the `--color-priority-*` `@theme` variables).

- [ ] **Step 1: Add priority tokens to `src/styles/global.css`**

In the `@theme` block, add three lines after `--color-accent-muted`:

Old:
```css
  --color-accent: #58a6ff;
  --color-accent-muted: #3d8b37;

  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
```

New:
```css
  --color-accent: #58a6ff;
  --color-accent-muted: #3d8b37;
  --color-priority-alta: #f85149;
  --color-priority-media: #d29922;
  --color-priority-baja: #6e7681;

  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
```

- [ ] **Step 2: Apply a priority border to each task `<li>` in `src/pages/tareas.astro`**

Add a `priorityBorder` lookup in the frontmatter, right after `priorityLabels`:

Old:
```ts
const priorityLabels: Record<number, string> = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
```

New:
```ts
const priorityLabels: Record<number, string> = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
const priorityBorder: Record<number, string> = {
  1: 'border-priority-alta',
  2: 'border-priority-media',
  3: 'border-priority-baja',
};
```

Then update the task `<li>` element:

Old:
```astro
                <li class="flex items-start gap-3 py-3">
```

New:
```astro
                <li class:list={['flex items-start gap-3 border-l-2 py-3 pl-3', priorityBorder[t.entry.data.priority]]}>
```

- [ ] **Step 3: Verify**

```bash
curl -s http://localhost:4321/tareas | grep -oE 'border-priority-(alta|media|baja)' | sort -u
```

Expected: at least one of `border-priority-alta` / `border-priority-media` / `border-priority-baja` printed, matching whatever priorities exist in `src/content/tareas/*.md` today.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css src/pages/tareas.astro
git commit -m "Add color-coded priority indicator to tareas list"
```

---

### Task 7: Full-site manual verification pass

**Files:** none (verification only, per the spec's Testing section — this is a CSS/markup-only phase with no test framework in the project).

- [ ] **Step 1: Confirm every page still returns 200**

```bash
for path in / /proyectos /proyectos/spawn /granjas /granjas/granja-hierro /mapa /tareas /jugadores /galeria; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:4321$path")
  echo "$path -> $code"
done
```

Expected: every line ends in `200`. (Adjust the `/proyectos/spawn` and `/granjas/granja-hierro` slugs if those files no longer exist — check with `ls src/content/proyectos src/content/granjas`.)

- [ ] **Step 2: Visual spot-check in a browser**

Open `http://localhost:4321/` and click through Inicio → Proyectos → a proyecto detail → Granjas → a granja detail → Tareas → Jugadores → Galería. Confirm:
- Sidebar shows a left accent bar on whichever section is active.
- Proyecto/granja grid cards show a border-color + shadow hover (no more flat opacity fade).
- Jugadores portraits and galería thumbnails show the same hover treatment.
- Tareas list items show a colored left border matching their priority (red=alta, amber=media, gray=baja).
- Tag pills and the "Copiar" button read clearly at rest, not just on hover.
- Existing interactions still work: gallery carousel prev/next/dots, galería lightbox open/close, coordinate copy-to-clipboard.

- [ ] **Step 3: Resize to a narrow viewport (< 768px) and repeat the click-through**

Confirm the mobile nav toggle still opens/closes the sidebar and nothing regressed at small widths.

No commit for this task — it's verification only. If any check fails, fix it as part of the relevant earlier task (amend that task's files, re-run its Step 4/verify, then commit the fix separately with a message like `Fix: <what broke>`).
