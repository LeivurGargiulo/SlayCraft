# Phase B: Navigation & Cross-Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every jugador a detail page showing their assigned tareas, make the jugadores grid clickable, and turn every `@username` mention on `tareas.astro` into a link — per `docs/superpowers/specs/2026-07-25-phase-b-navigation-design.md`.

**Architecture:** One new pure helper (`src/lib/jugadores.ts`) maps `username` → jugador file slug (`id`), since `assignee` on tareas is a plain username string, not a typed reference. One new detail page (`src/pages/jugadores/[slug].astro`) reuses the existing `RelatedTareas` component. Two existing pages get targeted edits. No schema changes, no new dependencies.

**Tech Stack:** Astro 7, Tailwind 4, existing `astro:content` collections.

## Global Constraints

- No changes to the `tareas`/`jugadores` content schema — `assignee` stays a plain string/array of usernames.
- No sidebar restructuring — stays a flat list.
- No animation or 3D render work (Phases C/D) — out of scope.
- No new content, no new npm dependencies.
- Do not reuse `ItemCard` for the jugadores grid — it hard-codes `aspect-[4/3] object-cover`, which crops the portrait-shaped (1199×1499, ~4:5) player renders. Keep the existing `width={160} height={200}` sizing; just make the existing markup a link.
- This project has no test framework; verification is curl-based structural checks against a running dev server (`astro dev --background` via `npx astro dev --background`, default port 4321), per project CLAUDE.md and prior phases.

---

### Task 1: Jugador detail page + username→slug lookup helper

**Files:**
- Create: `src/lib/jugadores.ts`
- Create: `src/pages/jugadores/[slug].astro`

**Interfaces:**
- Produces: `buildUsernameMap(jugadores: CollectionEntry<'jugadores'>[]): Record<string, string>` — maps each entry's `data.username` to its `id` (file slug). Exported from `src/lib/jugadores.ts`, imported by Task 3.
- Consumes: `RelatedTareas` component (`Props { tareas: CollectionEntry<'tareas'>[] }`), already built in Phase A at `src/components/RelatedTareas.astro` — do not modify it.

- [ ] **Step 1: Create `src/lib/jugadores.ts`**

```ts
import type { CollectionEntry } from 'astro:content';

export function buildUsernameMap(jugadores: CollectionEntry<'jugadores'>[]): Record<string, string> {
  return Object.fromEntries(jugadores.map((j) => [j.data.username, j.id]));
}
```

- [ ] **Step 2: Create `src/pages/jugadores/[slug].astro`**

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import RelatedTareas from '../../components/RelatedTareas.astro';
import { getCollection } from 'astro:content';
import { Image } from 'astro:assets';

export async function getStaticPaths() {
  const jugadores = await getCollection('jugadores');
  return jugadores.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { data } = entry;

const tareas = (await getCollection('tareas')).filter(
  (t) =>
    t.data.assignee?.includes(data.username) ||
    t.data.subtareas?.some((s) => s.assignee?.includes(data.username))
);
---

<BaseLayout title={data.username}>
  <a href="/jugadores" class="text-sm text-text-muted hover:text-accent">← Jugadores</a>

  <div class="mt-2 flex items-center gap-4">
    <Image
      src={data.skinImage}
      alt={data.username}
      width={240}
      height={300}
      class="w-60 rounded-lg border border-border object-cover"
    />
    <h1 class="text-2xl font-semibold">{data.username}</h1>
  </div>

  <RelatedTareas tareas={tareas} />
</BaseLayout>
```

- [ ] **Step 3: Verify**

```bash
astro dev status || astro dev --background
```

Check a player with tasks (`TitoBaiso`, file slug `tito`, appears as assignee on multiple tareas):

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/jugadores/tito
curl -s http://localhost:4321/jugadores/tito | grep -c 'Tareas relacionadas'
```

Expected: `200`, then `1` (the RelatedTareas section renders because this player has tasks).

Check a player with zero tasks (`BadPlayerRQM`, file slug `bad` — confirmed via `grep -h assignee src/content/tareas/*.md` to have no assignments):

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/jugadores/bad
curl -s http://localhost:4321/jugadores/bad | grep -c 'Tareas relacionadas'
```

Expected: `200`, then `0` (RelatedTareas renders nothing for an empty array — this is existing, already-reviewed behavior in `RelatedTareas.astro`, not something this task changes).

- [ ] **Step 4: Commit**

```bash
git add src/lib/jugadores.ts src/pages/jugadores/\[slug\].astro
git commit -m "Add jugador detail page with assigned-tareas list"
```

---

### Task 2: Make the jugadores grid clickable

**Files:**
- Modify: `src/pages/jugadores.astro`

**Interfaces:**
- Consumes: nothing new — links to routes produced by Task 1's `getStaticPaths` (`/jugadores/{id}`).

- [ ] **Step 1: Wrap each grid item in a link**

Replace the `jugadores.map(...)` block:

Old:
```astro
      jugadores.map((j) => (
        <li class="group flex flex-col items-center gap-2">
          <Image
            src={j.data.skinImage}
            alt={j.data.username}
            width={160}
            height={200}
            class="w-32 rounded-lg border border-border object-cover transition-all duration-200 group-hover:scale-[1.03] group-hover:border-accent group-hover:shadow-md group-hover:shadow-black/40"
          />
          <p class="font-medium">{j.data.username}</p>
        </li>
      ))
```

New:
```astro
      jugadores.map((j) => (
        <li>
          <a href={`/jugadores/${j.id}`} class="group flex flex-col items-center gap-2">
            <Image
              src={j.data.skinImage}
              alt={j.data.username}
              width={160}
              height={200}
              class="w-32 rounded-lg border border-border object-cover transition-all duration-200 group-hover:scale-[1.03] group-hover:border-accent group-hover:shadow-md group-hover:shadow-black/40"
            />
            <p class="font-medium">{j.data.username}</p>
          </a>
        </li>
      ))
```

(Only the `group` class moves from `<li>` to `<a>` — everything else is unchanged, so the existing hover treatment from Phase A keeps working exactly as before.)

- [ ] **Step 2: Verify**

```bash
curl -s http://localhost:4321/jugadores | grep -c 'href="/jugadores/bad"'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/jugadores
```

Expected: `1`, then `200`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/jugadores.astro
git commit -m "Make jugadores grid items link to their detail page"
```

---

### Task 3: Link @username mentions on tareas.astro

**Files:**
- Modify: `src/pages/tareas.astro`

**Interfaces:**
- Consumes: `buildUsernameMap` from `src/lib/jugadores.ts` (Task 1) — `(jugadores: CollectionEntry<'jugadores'>[]) => Record<string, string>`.

- [ ] **Step 1: Import the helper and build the lookup map**

In `src/pages/tareas.astro`, update the frontmatter imports and add the map:

Old:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { getCollection, getEntry } from 'astro:content';

const rawTareas = await getCollection('tareas');
```

New:
```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { getCollection, getEntry } from 'astro:content';
import { buildUsernameMap } from '../lib/jugadores';

const rawTareas = await getCollection('tareas');
const usernameMap = buildUsernameMap(await getCollection('jugadores'));
```

- [ ] **Step 2: Link task-level assignee mentions**

Old:
```astro
                    <p class="mt-0.5 text-sm text-text-muted">
                      {t.data.assignee && <span class="font-mono">{t.data.assignee.map((a) => `@${a}`).join(' ')}</span>}
                      <span> · prioridad: {priorityLabels[t.data.priority]}</span>
                    </p>
```

New:
```astro
                    <p class="mt-0.5 text-sm text-text-muted">
                      {t.data.assignee && (
                        <span class="font-mono">
                          {t.data.assignee.map((a, i) => (
                            <>
                              {i > 0 && ' '}
                              {usernameMap[a] ? (
                                <a href={`/jugadores/${usernameMap[a]}`} class="hover:text-accent hover:underline">
                                  @{a}
                                </a>
                              ) : (
                                <>@{a}</>
                              )}
                            </>
                          ))}
                        </span>
                      )}
                      <span> · prioridad: {priorityLabels[t.data.priority]}</span>
                    </p>
```

- [ ] **Step 3: Link subtarea-level assignee mentions**

Old:
```astro
                            {s.assignee && (
                              <span class="font-mono text-xs text-text-muted">
                                {s.assignee.map((a) => `@${a}`).join(' ')}
                              </span>
                            )}
```

New:
```astro
                            {s.assignee && (
                              <span class="font-mono text-xs text-text-muted">
                                {s.assignee.map((a, i) => (
                                  <>
                                    {i > 0 && ' '}
                                    {usernameMap[a] ? (
                                      <a href={`/jugadores/${usernameMap[a]}`} class="hover:text-accent hover:underline">
                                        @{a}
                                      </a>
                                    ) : (
                                      <>@{a}</>
                                    )}
                                  </>
                                ))}
                              </span>
                            )}
```

- [ ] **Step 4: Verify**

```bash
curl -s http://localhost:4321/tareas | grep -c 'href="/jugadores/tito"'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/tareas
```

Expected: a number `>= 1` (TitoBaiso is assignee on multiple tareas in `src/content/tareas/*.md`), then `200`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/tareas.astro
git commit -m "Link @username mentions on tareas to jugador detail pages"
```

---

### Task 4: Full verification pass

**Files:** none (verification only — this project has no test framework, per Global Constraints).

- [ ] **Step 1: Confirm every route returns 200**

```bash
for path in /jugadores /jugadores/tito /jugadores/bad /tareas; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:4321$path")
  echo "$path -> $code"
done
```

Expected: every line ends in `200`.

- [ ] **Step 2: Spot-check every jugador detail page builds**

```bash
for f in src/content/jugadores/*.md; do
  slug=$(basename "$f" .md)
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:4321/jugadores/$slug")
  echo "$slug -> $code"
done
```

Expected: every line ends in `200` (14 jugadores as of this plan — confirm the count matches `ls src/content/jugadores/*.md | wc -l` if it differs).

- [ ] **Step 3: Visual spot-check in a browser**

Open `http://localhost:4321/jugadores`, confirm portraits are clickable and link to a detail page showing that player's portrait (larger) and their tasks (if any). Open `http://localhost:4321/tareas`, confirm `@username` mentions render as underlined links on hover and navigate to the right jugador page. Confirm a player with zero tasks shows just their portrait with no broken "Tareas relacionadas" section.

No commit for this task — verification only. If any check fails, fix it as part of the relevant earlier task, re-run that task's Step verify, then commit the fix separately.
