# Phase B: Navigation & Cross-Linking — Design

## Context

This is phase 2 of the 4-phase site overhaul (A: style refresh → **B: navigation/IA** → C: animations →
D: 3D player renders). Phase A shipped on branch `phase-a-style-refresh` (not yet merged to `main`).
This spec covers Phase B only.

The stated problem, confirmed by inspecting the content: cross-linking between sections is weak.
Specifically:
- `src/pages/jugadores.astro` is a dead-end grid — no detail pages exist per player, and the grid
  items aren't even links.
- `tareas` entries already carry real usernames in `assignee` (task-level, string or array) and in
  each subtarea's `assignee` — rendered today as plain `@username` text on `tareas.astro`, never
  linked to anything.
- The sidebar itself (flat list: Inicio, Proyectos, Granjas, Mapa, Tareas, Jugadores, Galería) is not
  a problem and is out of scope for this phase — confirmed with the user.

## Goals

- Give every jugador a detail page showing their portrait and the tareas assigned to them (including
  tareas where they're only assigned to a subtask, not the task itself).
- Make the jugadores grid clickable, linking each portrait to its detail page.
- Turn every `@username` mention on `tareas.astro` (task-level and subtarea-level) into a link to
  that player's detail page.

## Non-goals

- No sidebar restructuring — stays a flat list.
- No changes to the `tareas`/`jugadores` content schema — `assignee` stays a plain string/array of
  usernames, not a typed `reference('jugadores')`. A schema change would require rewriting all 30
  existing tarea files' assignee values to match jugador file slugs (which don't match usernames,
  e.g. `TitoBaiso` vs file `tito.md`); a runtime lookup avoids that migration entirely.
- No animation or 3D render work (Phases C/D).
- No new content.

## Components

### `src/lib/jugadores.ts` (new)
Pure helper, no Astro markup. Exports one function:

```ts
buildUsernameMap(jugadores: CollectionEntry<'jugadores'>[]): Record<string, string>
```

Takes the result of `getCollection('jugadores')` and returns a map from `username` (as stored in
`jugadores` frontmatter, e.g. `"TitoBaiso"`) to that entry's `id` (file slug, e.g. `"tito"`), used to
build `/jugadores/{id}` links. Case-sensitive exact match — `assignee` values are expected to match
`username` exactly, same assumption the content already relies on today for display.

### `src/pages/jugadores/[slug].astro` (new)
Detail page, following the same `getStaticPaths` pattern as `proyectos/[slug].astro` /
`granjas/[slug].astro`:
- Back-link (`← Jugadores`) + portrait (larger than the grid thumbnail, e.g. same treatment as
  today's grid image but bigger) + `username` as `h1`.
- Task list: filter `getCollection('tareas')` to entries where `t.data.assignee` includes this
  player's `username`, OR any entry in `t.data.subtareas` has `assignee` including this player's
  `username`. Render with the existing `RelatedTareas` component (title + status only — no new
  list-rendering code).

### `src/pages/jugadores.astro` (modified)
Grid items switch from a bare `<Image>` in an `<li>` to the existing `ItemCard` component
(`href={/jugadores/${j.id}}`, `image={j.data.skinImage}`, `alt`/`title={j.data.username}`) — same
component already used for proyectos/granjas grids, no new styling.

### `src/pages/tareas.astro` (modified)
- Frontmatter: call `getCollection('jugadores')` once, pass through `buildUsernameMap`.
- Task-level assignee rendering (`{t.data.assignee.map(a => \`@${a}\`).join(' ')}`) becomes one
  `<a>` per username: linked to `/jugadores/{map[a]}` if present in the map, otherwise rendered as
  plain `@a` text (no dead links for a typo'd or since-removed username).
- Subtarea-level assignee rendering gets the identical treatment.

## Data flow

`jugadores` collection is now read in three places instead of one: `jugadores.astro` (grid, already
existing), `jugadores/[slug].astro` (new, for the detail page + task filtering), and `tareas.astro`
(new, only to build the username→id map for linking — no behavior change to what's already fetched
there for `proyectos`/`granjas` references). No collection schema changes, so no migration risk.

## Testing

No test framework in this project (confirmed in Phase A). Verification is manual/curl-based:
- Every jugador's detail page returns 200 and renders their portrait + only their tasks (spot-check
  a player with zero tasks, one with only a top-level assignment, and one who only appears via a
  subtarea).
- `/jugadores` grid items are real links (`<a href="/jugadores/...">`), not just images.
- `/tareas` renders `@username` as a working link for every currently-valid username, and as plain
  text (not a broken link) for any assignee string with no matching jugador entry, if one exists in
  the content today.
