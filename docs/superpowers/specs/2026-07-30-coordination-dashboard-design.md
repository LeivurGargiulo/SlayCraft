# SlayCraft Coordination Dashboard — Design

**Status:** Approved
**Date:** 2026-07-30

## Purpose

Phase 4 of the SlayCraft consolidation: a from-scratch coordination dashboard for
players/admins running the modded server. It's the primary user-facing product of this
repo — task tracking, farm status, player roster, project showcase, and a gallery — not
an admin CRUD scaffold. It replaces MCFarmManager's own superseded dashboard (Tasks
10–11 of its build plan, explicitly dropped per `MFO/docs/adr/0002-manager-runtime-mcfarmmanager-fabric-mod.md`)
by proxying MCFarmManager's read-only HTTP API instead of duplicating it.

## Users & auth

Used by the project owner plus a few trusted players — no distinct roles. Single shared
admin password, no accounts/registration. `POST /api/login` checks a bcrypt hash (set via
`ADMIN_PASSWORD_HASH` env var) and issues an httpOnly session cookie
(`@fastify/cookie` + `@fastify/session`, in-memory/filesystem store, no Redis). All
`/api/*` routes except `/api/login` require the cookie.

**UI language: all user-facing text (labels, buttons, statuses, empty states) is in
Spanish.** View names in nav are already Spanish (Tareas, Granjas, Jugadores, Proyectos,
Galería) — this extends to every screen, not just nav labels.

## Deployment topology

Dashboard runs on the same host as `servers/fabric` and MCFarmManager. The dashboard's
own port is what may be exposed to the LAN/internet; MCFarmManager's port
(`MCFARMMANAGER_URL`, default `http://127.0.0.1:8642`) is reached over localhost only and
is never called from the browser — every farm-data request goes dashboard-backend →
MCFarmManager, then dashboard-backend → browser.

## Information architecture

Left sidebar nav, always visible: **Overview · Tareas · Granjas · Jugadores · Proyectos ·
Galería**. Top bar: current session indicator, logout.

**Overview (default landing view)** surfaces what needs attention today, not a dump of
everything:
- Tasks that are `blocked`, high-priority, or overdue (`due_date` in the past and not
  `done`) — capped list, links to Tareas for the rest
- Farms flagged by simple thresholds (fake player offline, storage >90% full) shown
  first; healthy farms collapse into a single count
- Currently online (real) players, from MCFarmManager `/players`
- One live number: server TPS (colored if degraded), from `/performance`

Each other view is a full, dedicated screen (not a bare table):
- **Tareas** — full CRUD: title, description, status (`todo`/`in_progress`/`blocked`/`done`),
  priority (`low`/`med`/`high`), due date, subtasks (checklist), assignees (players),
  optional links to a farm and/or project. Filterable by status/assignee/farm/project.
- **Granjas** — grid of farm cards from live MCFarmManager data (`/farms`), each with
  editable dashboard-only metadata (notes, tags). Detail page: entities, storage,
  history chart (from `/farms/:id/history`). MCFarmManager itself stays read-only —
  edits only ever touch the dashboard's own `farm_metadata` table.
- **Jugadores** — dashboard's own player registry (name, note), cross-referenced with
  live online status from `/players`.
- **Proyectos** — cards with cover image, description, status; detail page with an image
  gallery per project. CRUD, including image upload.
- **Galería** — grid of standalone images with captions. CRUD, including upload.

v1 ships with empty states for Proyectos/Galería — real content added later through the
UI, not seeded now.

## Visual identity

Dark, game-HUD inspired.
- Background: near-black slate (`#0b0e11` page, `#12161c` panels), 1px borders on cards
  instead of shadows — flat HUD-panel look, not skeuomorphic.
- Typography: **Inter** for body/UI text, **JetBrains Mono** for stat numbers and status
  badges (the HUD feel).
- Accent colors: Minecraft-gold (`#e8b339`) for primary actions/highlights,
  diamond-cyan (`#4fd1c5`) for "live/online" indicators.
- Status colors: emerald = done/online, amber = in_progress/warning, red = blocked/offline,
  slate = todo.

## Data model (dashboard's own SQLite, WAL mode, no ORM)

```
users            (id, password_hash)
players          (id, minecraft_name, note, created_at)
tasks            (id, title, description, status, priority,
                   due_date, farm_id, project_id, created_at, updated_at)
subtasks         (id, task_id, title, done, sort_order)
task_assignees   (task_id, player_id)
projects         (id, name, description, status, created_at)
project_images   (id, project_id, path, caption, sort_order)
gallery_images   (id, path, caption, created_at)
farm_metadata    (farm_id, notes, tags)
```

`farm_id` is MCFarmManager's own string id — no FK, since farms are an external system,
not stored locally. Farm data itself (name, entities, storage, etc.) is never persisted;
every request re-fetches live and joins in `farm_metadata`. Uploaded images go to a local
`data/uploads/` directory, served statically; `path` is the relative filename.

## API surface

Backend: Fastify + zod-validated routes + better-sqlite3, no ORM. MCFarmManager is
reached with the built-in `fetch`, no HTTP client dependency.

- `POST /api/login`, `POST /api/logout`
- `GET /api/farms`, `GET /api/farms/:id`, `GET /api/farms/:id/history` — proxy + merge `farm_metadata`
- `GET /api/players/live`, `GET /api/world`, `GET /api/performance`, `GET /api/status` — straight proxy
- `GET/POST/PATCH/DELETE /api/tasks`, `/api/tasks/:id/subtasks`
- `GET/POST/PATCH/DELETE /api/players` — dashboard's own registry (distinct from `/api/players/live`)
- `GET/POST/PATCH/DELETE /api/projects` + image upload
- `GET/POST/PATCH/DELETE /api/gallery` + image upload

## Frontend stack

Vite + React + @tanstack/react-query (server state, polling for live farm/player/perf
data) + Tailwind (styling the visual identity above). No additional state library —
react-query covers server state, local component state covers the rest.

## Out of scope for v1

Roles/permissions beyond the single shared login, Docker/compose (deferred to Phase 5,
Docker unavailable in this sandbox), Discord/notifications, real Proyectos/Galería
content (seeded later via the UI).
