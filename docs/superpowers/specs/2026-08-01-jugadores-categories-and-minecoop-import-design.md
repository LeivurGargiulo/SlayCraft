# Jugadores categories + minecoop data import — design

## 1. Jugadores: Activo/Ocasional/Inactivo categories

**Schema.** Add `actividad TEXT NOT NULL DEFAULT 'ocasional' CHECK (actividad IN ('activo','ocasional','inactivo'))` to `players`. Manual field, set by hand in the dashboard — no auto-derivation from last-seen (matches minecoop's model, `_archive/minecoop/src/lib/jugadores.ts`).

**API.** `PlayerInput`/`PATCH /api/players/:id` gain `actividad`. `POST /api/players` accepts it too (default `ocasional`).

**UI (`Jugadores.tsx`).** Replace the flat player list with:
- An "Online" section at the top — current players from `useLivePlayers()`, matched against registered players by name. Always visible when non-empty.
- Three sections below: Activo / Ocasional / Inactivo, each showing its registered players (online or not) sorted by name, with an inline `<Select>` per row to change `actividad` (same pattern as the existing note-edit `onBlur`).
- Empty sections are hidden (matches minecoop's `items.length > 0 &&` behavior).

No new components needed — reuse `Card`, `StatusBadge`, `PlayerSkin`, `Select` (already in `src/components`).

## 2. Import minecoop data

Real data lives in minecoop's Netlify Blobs store (`granjas`, `proyectos`, `tareas`, `jugadores` — the `.md` files in `_archive/minecoop/src/content` are image-only placeholders). Pulled via `netlify blobs:get <store> <store>` this session; exports are in the scratchpad as `minecoop-export/*.json`. This is a one-time data migration (a script run once against the dashboard's SQLite DB), not a feature to build.

### 2a. Jugadores (15 players)
Insert into `players` with `actividad` from the export, `note = null`. `minecraft_name` = `username` verbatim.

### 2b. Proyectos (13) + Granjas (32) → both become dashboard Projects... except Granjas become live Farms

- **Proyectos (13 real minecoop projects):** insert into `projects` as-is — `name = title`, `status = 'active'`, `description = null`, `coordinates` = the `coordinates[]` array joined with `"; "`. No schema extension (minecoop's shape has no author/biome/tags/date to preserve).
- **Granjas (32 named farms, all coordinates are unset placeholders `"0, 0, 0"`):** dashboard's Granjas page only lists farms MCFarmManager reports live — a `farm_metadata`-only row never renders. So each granja is registered as a **real Farm** via `POST /api/farms` (which calls through to MCFarmManager), using placeholder/fabricated config to be corrected later by hand in the Granja detail UI:
  - `id` = the minecoop slug (e.g. `granja-hierro`)
  - `name` = the minecoop title
  - `dimension`: `minecraft:the_nether` if any coordinate label contains `(Nether)`, `minecraft:the_end` if `(End)`, else `minecraft:overworld`
  - `anchor`: placeholder `{ x: 0, y: 64, z: 0 }`
  - `entityScanRadius`: placeholder `16`
  - `fakePlayerName`: `null`
  - `storage`: one entry per coordinate label containing "Almacen", `{ id: slug + '-storage', label: 'Almacen', position: {x:0,y:64,z:0} }`
  - `afkSpot`: `{ position: {x:0,y:64,z:0}, radius: 5 }` if any label contains "Punto AFK", else `null`
  - Then `PUT /api/farms/:id` metadata (`notes`, `coordinates`) preserving the original label→coordinate text verbatim in `notes`, so nothing is lost even though the numbers are fabricated.

This requires MCFarmManager to be reachable (the mod running in the live server) when the import script runs, since farm creation proxies through it.

### 2c. Tareas (30) → tasks + subtasks + task_assignees

- `title` → `title`; `notes` → `description`.
- `status`: `pendiente` → `todo`, `en-progreso` → `in_progress`.
- `priority` (0–5 int) → `priority`: 0–1 `low`, 2–3 `med`, 4–5 `high`.
- `assignee: string[]` → resolve each username to its (already-imported) `players.id`, insert into `task_assignees` (many-to-many, no data loss — dashboard supports multiple assignees per task natively).
- `subtareas[]` → `subtasks` rows (`title`, `done`, `sort_order` = array index).
- Link resolution (`granjas[]` / `proyectos[]` → single `project_id` / single `farm_id`): **use either, not both** — if `proyectos[0]` exists, set `project_id` to that project's id and ignore any `granjas[]` links; else if `granjas[0]` exists, set `farm_id` to that granja's slug (which now exists as a real Farm per 2b). If a tarea has neither, both stay `null`. No secondary links are appended to `description` — this is a lossy but explicit simplification.

### Migration order
players → projects (13 proyectos) → farms (32 granjas, needs MCFarmManager live) → tasks/subtasks/task_assignees (needs players + projects + farms already inserted, for id resolution).

## Out of scope
- Auto-deriving `actividad` from last-seen/join logs (no such tracking exists).
- Restoring real farm coordinates — placeholders only, corrected by hand later.
- Preserving both a granja and proyecto link on the same task.
