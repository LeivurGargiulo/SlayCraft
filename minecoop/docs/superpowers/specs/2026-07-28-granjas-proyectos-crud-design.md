# Granjas & Proyectos CRUD — Design

## Context

Earlier this session, `tareas` was migrated from a static markdown content collection to a
Netlify-Blobs-backed store with full player login + CRUD (spec:
`docs/superpowers/specs/2026-07-27-player-auth-tareas-crud-design.md`, plan:
`docs/superpowers/plans/2026-07-27-player-auth-tareas-crud.md`). `granjas` (33 entries) and
`proyectos` (13 entries) are the two remaining static content collections on the site — each entry
has `title`, `coordinates: string[]`, and `images: image[]` (Astro's build-time-optimized image
type). This spec applies the same CRUD treatment to both: players should be able to create, edit,
and delete granjas/proyectos from the site, the way they already can with tareas.

Confirmed with the user during brainstorming: image galleries stay exactly as they work today (a
git-managed content-collection field, unchanged) — only `title` and `coordinates` become
player-editable. A granja/proyecto created through the new web UI will have no images until someone
manually adds a markdown file with images to the repo and redeploys; this is an accepted trade-off,
not a gap to fix.

## Goals

- A logged-in player can create a new granja or proyecto (title + coordinates).
- A logged-in player can edit any existing granja/proyecto's title and coordinates.
- A logged-in player can delete any granja/proyecto.
- Anonymous visitors keep today's read-only listing and detail pages, unaffected in appearance.
- Image galleries keep working exactly as today for entries that have a matching markdown file with
  images — completely unaffected by this work.

## Non-goals

- No image upload/management through the web UI — confirmed with the user. Images stay a
  content-collection field (`images: image[]`), edited only by adding files to the repo.
- No ownership checks — any logged-in player can edit or delete any granja/proyecto, matching the
  tareas precedent (small trusted friend group, no per-user scoping anywhere in this app).
- No search/filter UI on the listing pages — tareas has filters because it has enough
  cross-cutting facets (jugador/priority/proyecto) to warrant them; granjas/proyectos don't, and
  none is requested here.
- No changes to `Gallery.astro`, `CoordList.astro`, or the image-handling parts of the content
  collection schema.

## Architecture

- Two new Netlify Blobs stores, `granjas` and `proyectos`, structurally identical to `tareas`'s
  store: a single JSON array per store, `{id, title, coordinates}[]`. `src/lib/granjas.ts` and
  `src/lib/proyectos.ts` mirror `src/lib/tareas.ts`'s shape exactly — same
  `get*`/`create*`/`update*`/`delete*`/`parse*Input`/`parse*Patch`/`slugify` function set, same
  manual (non-zod) validation style, same plain-Node-testable design (pure functions take no
  Astro-specific types).
- The `granjas` and `proyectos` content collections shrink to a single field:
  ```ts
  schema: ({ image }) => z.object({ images: z.array(image()).min(1) })
  ```
  `title` and `coordinates` are removed from the frontmatter schema — every existing markdown file
  needs `title`/`coordinates` stripped from its frontmatter as part of the migration (images stay
  untouched).
- `granjas/index.astro` and `proyectos/index.astro` become `prerender = false` — new for this work.
  Both `[slug].astro` pages are already `prerender = false` (set during the earlier tareas work,
  since they already read the `tareas` blob for the related-tareas list), so no change needed there
  beyond what they already do. The same lesson already learned applies to the two index pages:
  Netlify Blobs has no build-time context available during Astro's own prerendering step, on
  Netlify's hosted build or locally, so any page reading a blob must be on-demand.
- Detail pages (`[slug].astro`) look up the blob record by `Astro.params.slug`, returning a 404
  `Response` if missing (same pattern as tareas' now-dynamic detail pages), then separately look up
  the matching content-collection entry (via `getEntry`) for images — if no matching entry exists
  (a web-created granja/proyecto with no images yet), the gallery section is simply omitted.
- Listing pages read all titles from the blob and, for each, an optional matching content-collection
  entry for its first image; `ItemCard.astro`'s `image` prop becomes optional, rendering a plain
  placeholder block (no `<Image>`) when absent.

## Data model

### `granjas` blob / `proyectos` blob (identical shape, two separate stores)
```json
[
  { "id": "granja-abeto", "title": "Granja de Abeto", "coordinates": ["Granja: 0, 0, 0"] }
]
```
`coordinates` entries keep the existing free-text `"Label: value"` convention already parsed by
`CoordList.astro` — unchanged.

### Content collection (post-migration)
```yaml
---
images:
  - "./img/construccion.webp"
---
```

## CRUD & auth

- `src/pages/api/granjas/index.ts` (`POST`), `src/pages/api/granjas/[id].ts` (`PATCH`/`DELETE`) —
  byte-for-byte the same shape as `src/pages/api/tareas/*`, importing from `src/lib/granjas.ts`
  instead. Same for `proyectos`.
- Every mutating endpoint checks `getSessionUser` (already-existing helper, unchanged) and returns
  401 before touching data — no new auth code.
- `GranjaForm.astro` / `ProyectoForm.astro` — a title input plus a plain textarea for coordinates
  (one per line, split/joined client-side). Simpler than `TareaForm.astro`'s subtareas editor: each
  coordinate is a single flat string, not a multi-field record, so no `<template>`-clone add/remove
  row UI is needed. Wired into the listing pages with the same "+ Nueva X" / "Editar" / "Eliminar"
  controls tareas already has, gated on `sessionUser`.
- Reuses the same post-mutation UX already built for tareas: a short delay before `location.reload()`
  to absorb Netlify Blobs' eventual consistency (already proven necessary and working).

## Migration

A one-time local step (mirroring tareas' migration): read the 33 granjas + 13 proyectos markdown
files' `title`/`coordinates` frontmatter, write them into the two new blobs, then strip
`title`/`coordinates` from every markdown file's frontmatter (images untouched). Given the earlier
lesson learned this session — a local migration script's writes only reach a local sandbox blob
store, not the real deployed site — the actual production data must be populated via
`netlify blobs:set` (direct site-store write) or an equivalent mechanism that reaches the real store,
not just local `astro dev`. This will be spelled out precisely as an implementation-plan task, not
left implicit.

## Testing / verification

- One `node:assert` self-check per new lib module (`scripts/check-granjas.mjs`,
  `scripts/check-proyectos.mjs`), same pattern as `scripts/check-tareas.mjs` — covering `slugify`
  and the input/patch parsers.
- Manual verification: create, edit, and delete a granja and a proyecto through the browser; confirm
  a granja/proyecto with an existing image gallery still renders it correctly; confirm a freshly
  created one renders with no gallery section (not a broken one).
