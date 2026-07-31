# Feature feasibility report

Complexity assessment only — no implementation yet. Ratings: **S** (hours), **M** (~1 day), **L** (multi-day), **XL** (multi-day + design decisions/new subsystem).

## 1. Panel parity with minecoop (Players/Granjas/Proyectos/Tareas)

Minecoop is a static Astro admin over Netlify Blobs — different stack, but its data shapes are the useful reference, not its code.

**1A. 3D player renders — M, but "3D" doesn't exist in minecoop either.**
Minecoop uses Minotar's flat body PNG (`https://minotar.net/body/{name}/{size}.png`), not a 3D model — no skinview3d or similar anywhere in that codebase. True 3D (rotatable skin viewer) means adding a client-side lib (`skinview3d`, ~40KB, WebGL) — self-contained, no server change. Flat-image parity is a one-line `<img src>` swap in `Jugadores.tsx`, S. True 3D render is M (new dependency, canvas mount/unmount lifecycle, per-card perf if many players render at once — cap to detail view, not list view).

**1B. name/info/coords/image for Granjas & Proyectos — M–L.**
Minecoop's own CRUD model only has `title` + `coordinates` (free-text lines); images are a *separate* markdown-file system joined by id, not a real field. So minecoop isn't actually "ahead" here — the dashboard's `projects` table already has `description` (`info`), which minecoop lacks. Gaps: no `image` storage for farms (dashboard's `project_images`/`gallery_images` tables have no farm equivalent — `farm_metadata` is notes/tags only) and no structured coordinates field on projects. Work: add `farm_images` table (same shape as `project_images`), add `coordinates`/reuse `anchor` (farms already get this live from MCFarmManager) for projects. Backend CRUD + upload wiring already exists as a pattern to copy (`gallery.ts`, `projects.ts` image routes) — this is mostly repetition of an existing pattern, not new design.

**1C. Tasks: filtering, assignee, priority color badge, farm/project link, subtask checkmarks — M.**
Filtering: client-side, straightforward with data already in React state (minecoop does it with DOM `data-*` + `.hidden` toggles; a React state filter is cleaner and less code). Assignee: dashboard already has `task_assignees` join table and renders assignees — just needs UI polish if missing. Priority: dashboard schema uses a 3-value enum (`low/med/high`); minecoop uses 0-5 with 5 distinct colors. **Decision needed**: keep 3-tier or expand schema to match minecoop's 5-tier scale (a `CHECK` constraint + migration, S once decided). Color badges are pure CSS/Tailwind, S. Farm/project link: dashboard's `tasks` table stores **single** `farm_id`/`project_id` (FK), minecoop allows **arrays** (many-to-many). If multi-link is actually wanted, needs join tables (`task_farms`, `task_projects`) — M, schema + migration + query changes. If single-link is fine, this is already done. Subtask checkmarks: dashboard already has a `subtasks` table with `done` boolean — just needs an `<input type=checkbox>` in the UI if not already rendered, S.

**1D. Dynamic Map link/embed at localhost:25566 — S.**
Minecoop has *no* map integration to copy from (grep found zero references to BlueMap/Dynmap/Squaremap). This is new, but trivial: either a nav link (`<a href="http://<host>:25566">`) or an `<iframe src="...">` on a page. No backend work. The actual complexity lives outside this codebase — whichever map mod (BlueMap etc.) needs to be installed and configured on the Fabric server to serve on 25566; that's ops, not dashboard code.

## 2. Show real player OR bot at AFK/work spot (not just the fixed fake-player)

**L — requires new mod-side correlation logic, not just a query tweak.**
Today "worker present" == "the one hardcoded fake-player name for this farm is logged in as `EntityPlayerMPFake`" (`RealFarmDataProvider.fakePlayer()`). Real online players are tracked separately (`RealServerDataProvider.players()`) and never cross-referenced against farm locations. To show "whoever is physically at the AFK spot," the mod needs: (a) a defined AFK-spot position + radius per farm (farms.json already has `anchor` + could reuse `entityScanRadius`, or needs a new dedicated field if the AFK spot ≠ anchor), and (b) new logic that scans **all** online players+fake-players each request/tick and checks distance-to-afk-spot, returning whichever entity (human or bot) is within radius — not a specific configured name. This is a genuine new feature in the mod (Java, `RealFarmDataProvider`), plus a new/changed API field (`FarmDetail`/`FarmSummary`), plus dashboard UI to show "occupant" instead of "fakePlayerOnline". Mod rebuild + redeploy required (this is the one item that isn't purely dashboard-side).

## 3. Farm config CRUD from dashboard (add/edit/delete farms)

**XL — currently impossible without new mod endpoints.**
`farms.json` is read once at server start into an immutable `List<FarmConfig>` (`MCFarmManagerMod.onInitialize`); there is no file watcher, no reload command, and the HTTP server (`MCFarmManagerHttpServer`) only registers GET handlers — zero POST/PUT/PATCH/DELETE routes exist anywhere in the mod today. This needs, on the mod side: new write endpoints, request-body parsing (not currently done anywhere in the mod), validation reuse (`FarmConfigLoader.validate()` logic already exists and can be reused), atomic rewrite of `farms.json`, and either a live-reload path (replace the in-memory `volatile List<FarmConfig>`, safe since it's already `volatile`) or requiring a restart after edits (much cheaper but worse UX). Delete-with-confirmation is standard dashboard UI (S) once the backend exists. This is the largest single item — new mod HTTP surface + config mutation + (ideally) hot-reload, plus dashboard CRUD forms and confirmation modals mirroring the existing `projects`/`tasks` delete-confirm pattern already in the codebase.

## 4. Storage: total across all containers + per-chest dropdown + shulker contents + stacks not units

**Split by piece — M for the parts that reuse existing data, XL for shulker-nested contents.**
- Per-chest breakdown: **already exists** today (`FarmDetail.storage: List<StorageInfo>`, each itemized). Dashboard just needs a dropdown UI over data it already receives — S, pure frontend.
- Total across all containers: **partially exists** — `FarmSummary.storageItemCount` already sums stack counts (not slot counts) across containers server-side. If "total" means grand total number, done. If it means "total broken down by item type across the whole farm," that aggregation doesn't exist live today (only in the history-sampler pipeline, which groups by itemId) — S–M to add a `Map<itemId, count>` aggregation step in `MCFarmManagerHttpServer.summarize()` or client-side by summing the existing per-chest `StorageInfo.items` (client-side is S, zero mod changes).
- Stacks vs units: **already correct** — `ItemStackInfo.count` is already the real stack count via `getItem(slot)`, not slot-occupied count. No work needed.
- Shulker box *contents* when a shulker sits as an item inside a chest: **does not exist, real gap.** The mod never reads a shulker `ItemStack`'s nested-items data component. Needs new Java code in `RealFarmDataProvider.storage()` to detect shulker-box item stacks and read their contained-items NBT/component, recursively expand into the item list. Doable (`ItemStack` component API on 1.21.x exposes this), but it's new logic + new nested data shape in the API response + dashboard UI to render nested contents — L on the mod side.

## 4b. Item type shown, not just count

**S — mostly already there.** `ItemStackInfo(itemId, count)` already carries item type per stack in the per-chest breakdown; a farm-wide "type: total count" summary is the same aggregation described in 4 (S–M, reuses existing fields, no new mod capability needed unless shulker-nested items are also required, which pulls in 4's L item).

## 5. Production rate (per min/hour/day) + status indicator (normal/low/none)

**M — the hard part (time-series data) already exists.**
`FarmSampler` already runs on a configurable interval (default 5 min) and stores per-itemId storage counts per farm in SQLite (`farm_samples` table), with a working history query API already proxied through to the dashboard (`GET /farms/:id/history`). What's missing is purely the **derivation** step: rate = (count at t2 − count at t1) / (t2 − t1), computed from consecutive samples already available via the existing history endpoint. This can be done **entirely client-side** in the dashboard (fetch history, diff consecutive samples, compute rate) with zero mod changes — M, mostly UI + a small math/aggregation utility. A status indicator (normal/low/none) needs a threshold — either a hardcoded expected-rate default or a configurable per-farm expected-rate field (ties into item 3's config-editing work if farms become dashboard-editable). Without expected-rate config, "low vs normal" has no baseline to compare against — this is the one design decision this item needs before implementation.

## 6. Auto-refresh without manual reload

**S — already half-done.** React Query is already in use with `refetchInterval` polling on `useFarms` (30s), `useFarm` (15s), `useLivePlayers` (15s), `usePerformance` (10s). Tasks/players list/projects/gallery/history currently have no interval — just adding `refetchInterval` to those hooks (`hooks.ts`) is a few-line change, S. True push-based live updates (WebSocket/SSE) would be a bigger lift (new transport, new mod-side push capability) but isn't necessary for "don't need to manually refresh" — polling already satisfies that; only recommend WS/SSE if sub-second latency matters, which nothing here requires.

## 7. Entity type info

**Already fully implemented, S to expose if not already visible.** `EntityInfo.type` already captures the real Minecraft entity registry key (e.g. `minecraft:zombie`) via `EntityType.getKey()`, alongside custom name, position, health, and passes through unmodified to the dashboard's TS types. If the dashboard UI isn't currently displaying `entity.type` per-entity in the farm detail view, that's a pure frontend display fix, S. No mod work needed — this item is data-complete already.

---

## Summary ranking (cheapest → most involved)

| # | Item | Size | Needs mod changes? |
|---|---|---|---|
| 7 | Entity type display | S | No |
| 6 | Auto-refresh polling | S | No |
| 4/4b | Storage total + per-chest + type breakdown (excl. shulker contents) | S–M | No (or S if aggregated client-side) |
| 1D | Dynamic Map link/embed | S | No (ops: map mod install is separate) |
| 5 | Production rate + status | M | No |
| 1C | Task filtering/priority/subtasks polish | M | No |
| 1A | 3D player render | M | No |
| 1B | Farm/project images + coords | M–L | No |
| 4 (shulker) | Shulker nested contents | L | Yes |
| 2 | Real occupant at AFK spot | L | Yes |
| 3 | Farm config CRUD from dashboard | XL | Yes |

Three items (2, 3, and the shulker part of 4) require rebuilding and redeploying the Fabric mod, not just dashboard changes — those should be scoped/sequenced together since they touch the same Java codebase and require a server restart cycle to test.
