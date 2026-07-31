# Batch B: dashboard data model additions

Part of the 11-item feature request tracked in `dashboard/docs/FEATURE_FEASIBILITY.md`. Covers items 1A (3D player render), 1B (farm/project images + coordinates), and 1C (task filtering, priority badge, farm/project link, subtasks). Follows Batch A (`docs/superpowers/specs/2026-07-31-batch-a-dashboard-polish-design.md`, dashboard-only polish, no schema changes). This batch adds schema (new tables, one new column) but still requires zero MCFarmManager mod changes.

## Design decisions locked in during brainstorming

- **Task priority stays 3-tier** (`low`/`med`/`high`) — no migration risk, just needs a proper color badge instead of plain text. Minecoop's 5-tier scale is not adopted.
- **Task-to-farm/project linking stays single** (existing `farm_id TEXT` / `project_id INTEGER` FKs on `tasks`) — no multi-link join tables. Minecoop's array-based linking is not adopted.
- **Project coordinates: free-text column**, not structured x/y/z — matches minecoop's own free-text approach, simplest migration, no rigid single-location constraint.
- **Farm images: mirror `project_images` exactly** — new `farm_images` table keyed by `farm_id TEXT` (farms have no local table; same convention already used by `farm_metadata`).
- **3D player render: new `/jugadores/:id` detail page**, not inline in the list. Avoids mounting N simultaneous WebGL canvases in `/jugadores`; the list stays lightweight and links out to the detail view.

## 1. 3D player render

No `/jugadores/:id` route exists today — `Jugadores.tsx` is a flat list with no detail view.

- New dependency: `skinview3d` (client-side only, WebGL skin viewer).
- New route `/jugadores/:id`, new page `client/src/pages/JugadorDetail.tsx`: mounts a `SkinViewer` in a `<canvas>`, loads skin texture from `https://minotar.net/skin/{minecraft_name}` (raw skin PNG by username — no Mojang UUID lookup required, same trust boundary minecoop already relies on for its flat body renders).
- `Jugadores.tsx`: each player row's name becomes a `<Link to={`/jugadores/${p.id}`}>`, otherwise unchanged.
- Lifecycle: `SkinViewer` created in a `useEffect`, disposed in its cleanup function on unmount — prevents a leaked WebGL context when navigating away.
- No backend changes. No new hooks needed (the detail page reads from the already-loaded `usePlayers()` list by id, same pattern `ProyectoDetail.tsx` uses).

## 2. Farm images

New table (mirrors `project_images`, `farm_id` is `TEXT` not `INTEGER` since farms are not a local table — see `farm_metadata` for the existing precedent):

```sql
CREATE TABLE IF NOT EXISTS farm_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id TEXT NOT NULL,
  path TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

- `registerFarmRoutes` (`server/src/routes/farms.ts`) gains an `uploadsDir: string` parameter (currently doesn't take one — `registerProjectRoutes`/`registerGalleryRoutes` already do).
- New routes, copied from `projects.ts`'s image handlers verbatim (same `ALLOWED_EXT` whitelist, same UUID-named file storage, same "drain the multipart stream before rejecting" pattern already fixed there for the connection-hang bug): `POST /api/farms/:id/images`, `DELETE /api/farm-images/:id`.
- `GET /api/farms` and `GET /api/farms/:id` responses gain an `images: FarmImage[]` field (same shape as `ProjectImage`), populated the same way `getMetadata()` already is.
- New client hooks `useUploadFarmImage`, `useDeleteFarmImage` (mirrors `useUploadProjectImage`/existing project-image delete pattern).
- New "Imágenes" card in `GranjaDetail.tsx`, copied from `ProyectoDetail.tsx`'s image grid + file input.

## 3. Project coordinates

One nullable column, guarded so it's safe to re-run against an existing database:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS coordinates TEXT;
```

(SQLite has supported `ADD COLUMN IF NOT EXISTS` since 3.35; `better-sqlite3` bundles a version well past that.) `schema.sql` already runs unconditionally on every server boot (`db.ts`) — this line joins the existing `CREATE TABLE IF NOT EXISTS` statements as the first non-`CREATE` (idempotent) statement in that file.

- `projectInput` zod schema (`server/src/routes/projects.ts`) gains `coordinates: z.string().nullable().optional()`.
- `ProyectoDetail.tsx` edit form gains a text input next to description; display shows the coordinates line under the title when set, hidden entirely when null.

## 4. Task priority color badge

`Tareas.tsx` currently renders priority as plain text (`Prioridad: {label}`). New `PriorityBadge` component (`client/src/components/PriorityBadge.tsx`), styled after the existing `StatusBadge` component's pattern (colored pill, not free text): green for `low`, amber for `med`, red for `high`.

## 5. Task filters (assignee, priority, farm/project)

`Tareas.tsx` currently filters only by status (button row, client-side `.filter()`). Add three `<select>` dropdowns alongside it, all client-side against already-loaded data (no new API calls — same pattern the status filter already uses):

- Assignee: options from `usePlayers()`, filters tasks where `t.assignees` contains the selected player id.
- Priority: options are the 3 fixed values.
- Farm/project: **two** separate dropdowns (not one combined selector, matching "related proyecto **and/or** granja" from the original request) — one populated from `useFarms()` filtering on `t.farm_id`, one from `useProjects()` filtering on `t.project_id`.

## 6. Farm/project link in task form + display

Real gap, not just a display gap: the task create/edit modal currently has **no** farm or project field at all — `farm_id`/`project_id` can only be set today by calling the API directly.

- Modal form gains two `<select>`s: farm (options from `useFarms()`, includes a "Sin asignar" null option) and project (options from `useProjects()`, same null option).
- Task list card gains clickable pill badges when `farm_id`/`project_id` are set: `<Link to={`/granjas/${t.farm_id}`}>{farmName}</Link>` / `<Link to={`/proyectos/${t.project_id}`}>{projectName}</Link>`, name looked up client-side from the already-fetched `useFarms()`/`useProjects()` lists by id — no new API calls, no denormalized name storage on `tasks`.

## Non-goals (explicitly deferred / rejected)

- 5-tier priority scale, multi-farm/multi-project task linking, per-subtask assignee — all considered during brainstorming and rejected in favor of the simpler existing shape (see "Design decisions locked in" above).
- Subtask checkmarks — already fully implemented (`Tareas.tsx` already renders real `<input type="checkbox">` with strike-through on done), no work item here.
- Inline 3D render in the player list — rejected for WebGL-context perf reasons, see decision above.
- Any MCFarmManager mod change, any change to farm identity/config (farms remain sourced live from the mod; `farm_images`/`farm_metadata` are dashboard-local overlays keyed by the mod's farm id, same as today).

## Files touched

- `server/src/schema.sql` — new `farm_images` table, `ALTER TABLE projects ADD COLUMN`
- `server/src/routes/farms.ts` — `uploadsDir` param, image upload/delete routes, `images` field on farm responses
- `server/src/routes/projects.ts` — `coordinates` in zod schema and CRUD
- `server/src/app.ts` — pass `uploadsDir` to `registerFarmRoutes`
- `client/src/api/types.ts` — `FarmImage` type, `images` field on `FarmDetail`/`FarmSummary`, `coordinates` on `Project`
- `client/src/api/hooks.ts` — `useUploadFarmImage`, `useDeleteFarmImage`
- `client/src/pages/GranjaDetail.tsx` — new images card
- `client/src/pages/ProyectoDetail.tsx` — coordinates field
- `client/src/pages/Jugadores.tsx` — name becomes a link
- `client/src/pages/JugadorDetail.tsx` — new file, 3D skin viewer
- `client/src/pages/Tareas.tsx` — priority badge, filters, farm/project picker + link badges
- `client/src/components/PriorityBadge.tsx` — new file
- `client/src/App.tsx` — new `/jugadores/:id` route
- `client/package.json` — new `skinview3d` dependency

## Testing

Manual verification only (no client test framework, consistent with Batch A):
1. Upload/delete a farm image, confirm it persists across a page reload and appears in `GranjaDetail.tsx`.
2. Set project coordinates, confirm they save and display; confirm a project created before this change (null coordinates) doesn't break.
3. Open a player detail page, confirm the 3D model renders and is rotatable; navigate away and back, confirm no console errors from a leaked WebGL context.
4. Create a task with a farm and project selected, confirm both pill badges render and link correctly; use the assignee/priority/farm/project filters together, confirm the visible task list matches the intersection of all active filters.
