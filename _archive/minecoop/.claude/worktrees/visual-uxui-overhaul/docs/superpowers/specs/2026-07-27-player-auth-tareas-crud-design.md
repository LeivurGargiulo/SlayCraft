# Player Auth & Task CRUD — Design

## Context

Today the site is fully static (Astro, no adapter, `output` unset → static build). `tareas` is a
content collection of 35 markdown files (`src/content/tareas/*.md`, schema in
`src/content.config.ts`); `jugadores` is a static array in `src/data/jugadores.ts` (username +
`actividad`), with no accounts, sessions, or write path anywhere in the site.

The ask: let each of the ~15 coop players log in as themselves and create, modify, and delete
tareas from the site. That requires two things the site has never had — identity (who is this
visitor) and a writable data store (the current markdown files are read at build time only) — so
this is a real architecture change, not a component-level tweak. Scope is deliberately kept to the
minimum that satisfies the ask: login + task CRUD. No profile editing, no admin UI, no ownership
restrictions.

## Goals

- A player can log in with a username + passcode and stay logged in via a cookie.
- Once logged in, a player can create a new tarea, edit any tarea's fields (title, status,
  assignee, priority, notes, subtareas, granjas/proyectos links), and delete any tarea.
- Anonymous visitors keep today's read-only view of `tareas.astro`.
- `galeria`, `granjas`, `proyectos` and their pages are completely unaffected — still static.

## Non-goals

- No self-registration. Passcodes are set ahead of time by the site owner via a one-time local
  script, not through any on-site UI.
- No ownership checks — any logged-in player can edit or delete any tarea, including ones assigned
  to someone else.
- No profile editing (avatar, bio, actividad self-edit, etc.) — `jugadores/[slug].astro` is
  unchanged.
- No password reset flow, no email, no third-party OAuth (Discord/Microsoft) — explicitly ruled out
  in favor of a plain shared-secret passcode per player, appropriate for a small trusted friend
  group.
- No migration of `granjas`/`proyectos` off content collections — they stay static markdown.

## Architecture

- Add the `@astrojs/netlify` adapter via `npx astro add netlify`. `output` stays at its default,
  `'static'` (Astro merged `hybrid` into `static` as of v5 — every page is prerendered by default
  already, so nothing changes for pages that don't touch the blob). `tareas.astro`, `login.astro`,
  all `api/*` endpoints, and — see "Superseded" note below — `granjas/[slug].astro`,
  `proyectos/[slug].astro`, and `jugadores/[slug].astro` (any page reading `getTareas()`) all opt out
  of prerendering with `export const prerender = false`, making those routes on-demand (Netlify
  Functions). `galeria` and the `granjas`/`proyectos` index listing pages stay fully static.
- Data storage: **Netlify Blobs**, two blobs, `players` and `tareas`. Chosen over Netlify DB
  (Postgres) because at this scale (35 tasks, 15 players) a JSON blob is simplest to reason about
  and needs no schema/migrations/connection string.
- Auth: a **stateless signed cookie**. No session store, nothing to expire or garbage-collect.
  Passcodes are hashed with Node's built-in `crypto.scrypt` (no new dependency for hashing).

## Data model

### `players` blob
JSON object keyed by username:
```json
{
  "TitoBaiso": { "passcodeHash": "<scrypt hash+salt>", "actividad": "ocasional" }
}
```
`actividad` moves here from `jugadores.ts`, which becomes either a thin display-only list or is
retired in favor of reading the blob — a call to make during implementation, not load-bearing for
this spec.

### `tareas` blob
JSON array, one object per task, same shape as today's frontmatter schema:
```json
[
  {
    "id": "construir-granja-de-ghast",
    "title": "Construir granja de Ghast",
    "status": "pendiente",
    "assignee": ["TitoBaiso"],
    "priority": 4,
    "notes": "",
    "granjas": ["granja-ghast"],
    "proyectos": [],
    "subtareas": [
      { "title": "Definir Zona", "done": false, "assignee": ["TitoBaiso"] }
    ]
  }
]
```
`granjas`/`proyectos` stay as slug-string arrays, resolved against the still-static content
collections at render time exactly as today.

### Migration

A one-time local script reads all 35 existing markdown files under `src/content/tareas/` and writes
them as a single JSON array into the `tareas` blob. Once verified, the markdown files are deleted —
the blob becomes the single source of truth. This script is a one-shot dev tool, not part of the
running site.

## Auth flow

- `src/pages/login.astro` (dynamic): form with username (select from roster) + passcode.
- `src/pages/api/login.ts` (dynamic): looks up the player in the `players` blob, verifies the
  passcode via `crypto.scrypt` + timing-safe compare, and on success sets an HttpOnly, `Secure`,
  `SameSite=Lax` cookie: `session=<username>.<hmac-signature>` (HMAC over the username with a
  secret from an env var).
- `src/lib/auth.ts`: exports `getSessionUser(request)` — reads the cookie, recomputes the HMAC,
  returns the username if valid or `null` otherwise. Every protected page/endpoint calls this one
  helper rather than re-implementing verification.
- `src/pages/api/logout.ts`: clears the cookie.
- Passcodes themselves are set once via a local script that writes `passcodeHash` values directly
  into the `players` blob — no on-site admin UI.

## Task CRUD

- `src/pages/api/tareas/index.ts` — `POST` creates a new tarea. Requires `getSessionUser` non-null.
- `src/pages/api/tareas/[id].ts` — `PATCH` modifies a tarea, `DELETE` removes it. Both only require
  `getSessionUser` non-null — no ownership check, per the non-goals above.
- Each endpoint reads the full `tareas` blob, mutates the in-memory array, writes it back whole.
  Trivial at 35 records; no partial-update or per-record-key scheme needed.
- `src/pages/tareas.astro` gets `prerender = false`, reads the `tareas` blob directly (no HTTP round
  trip needed since it's already server-side), and gains inline create/edit/delete controls wired to
  the endpoints above — shown only when `getSessionUser` returns a user; anonymous visitors see
  today's existing read-only view plus a "log in" link.
- Existing rendering components (`ItemCard`, `RelatedTareas`, priority badges) consume the same data
  shape as before, just sourced from the blob instead of the content collection — no changes
  expected to these components' internals, only their prop type updated from
  `CollectionEntry<'tareas'>` to the new `Tarea` type exported by `src/lib/tareas.ts`.

## Superseded: related-tareas go stale between deploys

**This section described the original plan and turned out to be wrong; kept for the record.**
The original design kept `granjas/[slug].astro`, `proyectos/[slug].astro`, and
`jugadores/[slug].astro` statically prerendered, reading the `tareas` blob at build time, accepting
that their "related tareas" list would only refresh on the next deploy. In practice, Netlify Blobs
has no build-time context available during Astro's own prerendering step — not just locally (which
was known and accepted) but also on Netlify's own hosted build servers (discovered only once an
actual deploy was attempted: the hosted build failed with the same `MissingBlobsEnvironmentError` as
the local one). Netlify's documented zero-config blob access during builds turned out to apply to
their separate build-plugin hook system (`onPostBuild` etc.), not to arbitrary code inside the
framework's own build command.

**Actual, working design:** all three pages are now `prerender = false`, same as `tareas.astro` —
on-demand rendering (Netlify Functions), reading the blob at request time. This is proven to work
(this is exactly how `tareas.astro` and the API routes already worked) and, as a bonus, their
related-tareas lists are now live rather than stale-until-next-deploy. At this site's scale (~15
players, ~35 tasks, low traffic) the cost/performance difference between static HTML and an on-demand
function response is not a meaningful concern.

## Testing / verification

- One `demo()`/manual check for `src/lib/auth.ts`: sign a cookie for a known username, verify it
  round-trips through `getSessionUser`, verify a tampered cookie is rejected.
- Manual browser verification on the Netlify dev/preview environment: log in, create a tarea, edit
  it, delete it, log out, confirm the anonymous view is read-only again.
