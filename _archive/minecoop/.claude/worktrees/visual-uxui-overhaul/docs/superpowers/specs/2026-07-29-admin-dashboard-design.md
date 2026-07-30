# Admin Dashboard — Design

## Context

The site currently has two half-finished access models:

- **Live in prod:** per-player login (username + passcode, HMAC-signed cookie) with full in-page
  create/edit/delete on tareas, gated only by "is logged in" — no roles, any player can edit
  anything (spec: `docs/superpowers/specs/2026-07-27-player-auth-tareas-crud-design.md`).
- **Spec'd, not yet built:** the same player-CRUD treatment extended to granjas/proyectos
  (spec: `docs/superpowers/specs/2026-07-28-granjas-proyectos-crud-design.md`).

This spec replaces both access models with a single admin dashboard: players become read-only
visitors everywhere, and all mutation (tareas, granjas, proyectos, jugadores) happens through an
admin-gated `/admin` section behind one shared admin password. This spec **supersedes the
CRUD/auth/UI sections** of both documents above. Their data-model and migration content (the
granjas/proyectos blob shape, the frontmatter migration script) remains valid and is reused here.

Confirmed during brainstorming: Supabase + a separate React app was considered and rejected as
overkill for this scale (four collections, each a few dozen rows, one shared admin credential, no
relational queries) — the existing Netlify Blobs + Astro on-demand-routes stack already does
everything needed. This is a straight cutover, not a phased rollout: small trusted user base, no
need to run both systems in parallel.

## Goals

- A single shared admin login gates a `/admin` dashboard covering tareas, granjas, proyectos, and
  jugadores: list, create, edit, delete for each.
- Public pages (tareas, granjas, proyectos, jugadores listings and detail pages) become pure
  read-only views — no login, no edit affordances, no session-aware client code.
- Jugadores moves from the static `src/data/jugadores.ts` array to a Netlify Blobs store, matching
  the other three collections, so it becomes admin-editable.
- Granjas/proyectos gain blob-backed storage as already spec'd, but edited only via `/admin`.

## Non-goals

- No per-admin accounts or roles — one shared password, same trust model as the player passcodes it
  replaces.
- No dual-running of the old player-login system alongside the new admin dashboard — straight
  cutover in one change.
- No image upload/management through the dashboard — unchanged from the granjas-proyectos-crud
  spec: images stay a content-collection field, edited by adding files to the repo.
- No search/filter UI inside `/admin` beyond a plain list per collection — admin usage is
  infrequent and low-volume; public-facing filters (tareas' jugador/priority/proyecto filters) are
  a read concern and stay on the public pages, untouched.

## Architecture & auth

- One new HMAC-signed cookie session for the shared admin password, reusing `src/lib/auth.ts`'s
  existing sign/verify helpers unchanged. The password is scrypt-hashed the same way player
  passcodes are today, compared against a single `ADMIN_PASSWORD` env var (via a new
  `src/lib/admin-auth.ts`) rather than a per-username blob lookup.
- `src/pages/admin/*`, all `prerender = false`: `/admin/login`, `/admin` (overview/links),
  `/admin/tareas`, `/admin/granjas`, `/admin/proyectos`, `/admin/jugadores`.
- `src/pages/api/admin/{tareas,granjas,proyectos,jugadores}/index.ts` (`POST`) and `[id].ts`
  (`PATCH`/`DELETE`) — same REST shape already used for `src/pages/api/tareas/*`, gated on the
  admin session cookie (401 before touching data, no new auth logic beyond the cookie check).
- **Removed:** `src/pages/login.astro`, `src/pages/api/login.ts`, `src/pages/api/logout.ts` (player
  versions), `src/lib/players.ts`, the admin passcode-setting script (`scripts/set-passcode.mjs`),
  `TareaForm.astro` and all inline create/edit/delete controls and session checks in
  `tareas.astro`. The granjas/proyectos-crud plan's not-yet-built `GranjaForm.astro`/
  `ProyectoForm.astro` are built as admin-only components instead, living under `/admin`, not on
  the public pages.

## Data layer

- `tareas`, `granjas`, `proyectos` blobs: unchanged shape from what's live (tareas) and already
  spec'd (granjas/proyectos: `{id, title, coordinates}[]`, with `src/lib/granjas.ts` /
  `src/lib/proyectos.ts` mirroring `src/lib/tareas.ts`'s `get*`/`create*`/`update*`/`delete*`/
  `parse*Input`/`parse*Patch`/`slugify` shape). Only the consumer changes: admin dashboard instead
  of in-page player forms.
- New `jugadores` blob store (`src/lib/jugadores.ts`, same function shape): `{username, actividad}[]`.
  `ACTIVIDAD_LABELS` and `skinBodyUrl` stay as plain exported constants/functions in
  `src/data/jugadores.ts` (or move alongside the lib file) — no reason to put those in the blob.
  `src/pages/jugadores.astro` and `src/pages/jugadores/[slug].astro` become on-demand
  (`prerender = false`), reading the blob instead of the static array.
- Content collections (`granjas`, `proyectos` markdown): unchanged from the existing plan — schema
  shrinks to `{ images: z.array(image()).min(1) }`, `title`/`coordinates` removed from frontmatter
  and moved into the blobs.

## Admin dashboard UI

- Plain Astro pages under `/admin`, styled with the existing Tailwind tokens — no React, no new
  client framework. Astro server rendering plus small inline `<script>` blocks (the same pattern
  `tareas.astro`'s editor already used) is enough for create/edit/delete forms; there's no
  interaction complexity here that needs client-side state management.
- `/admin` — links and record counts for the four sections.
- Each section page is a list of all records with per-row "Editar"/"Eliminar" and a "+ Nueva X"
  form: `TareaForm`, `GranjaForm`, `ProyectoForm`, `JugadorForm`, all relocated to `/admin` (built
  fresh for granjas/proyectos/jugadores; tareas' existing form logic moves here from the public
  page).
- Public pages (`tareas.astro`, `granjas/*`, `proyectos/*`, `jugadores/*`) keep only what
  anonymous visitors see today: listings, tareas' existing filters, detail views, image galleries.
  All form markup, session checks, and mutation `<script>` code is removed.

## Migration & rollout

- Straight cutover: ship the admin dashboard and all four blob-backed sections, and remove the
  player login/edit code, in the same change. No feature flag, no parallel run — small trusted
  group, no external users depending on the old flow surviving a transition window.
- The existing `players` blob (per-username passcode hashes) is left in place, unused, rather than
  writing a one-off deletion step — it's inert once nothing reads it.
- Granjas/proyectos migration is unchanged from the existing plan: read `title`/`coordinates` out
  of the 33 granjas + 13 proyectos markdown files' frontmatter, write them into the two new blobs,
  strip those fields from the frontmatter (images untouched). As already noted in that spec, a
  local migration script's writes only reach a local sandbox blob store — populating the real
  production data requires `netlify blobs:set` or an equivalent that reaches the deployed site's
  store, not just `astro dev`.
- Jugadores migration: a one-time script writes the current 15 entries from
  `src/data/jugadores.ts` into the new `jugadores` blob (same production-reach caveat as above),
  then the static array's `username`/`actividad` pairs are removed from that file (helpers stay).

## Testing / verification

- One `node:assert` self-check per lib module: `scripts/check-tareas.mjs` already exists; add
  `scripts/check-granjas.mjs`, `scripts/check-proyectos.mjs`, `scripts/check-jugadores.mjs`,
  covering `slugify` and input/patch parsing for each.
- Manual verification: admin login and logout; create/edit/delete for all four record types through
  `/admin`; confirm public pages render correctly with no session or edit code present and no way
  to reach a mutation without the admin cookie; confirm a granja/proyecto with an existing image
  gallery still renders it, and a freshly admin-created one renders with no gallery section (not a
  broken one).
