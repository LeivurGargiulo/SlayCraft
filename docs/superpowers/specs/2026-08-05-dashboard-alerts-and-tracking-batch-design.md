# Dashboard alerts + tracking batch — design

Six features from `docs/FEATURE_IDEAS.md` (1, 3, 5, 6, 7, 8). Features 2 and 4 were dropped
during brainstorming: 2's coordinate-editing flow already exists (`GranjaDetail.tsx`'s
"Editar configuración" modal — the gap is unset placeholder data, not missing UI, and the
user chose to drop it rather than build a stale-position indicator); 4's production chart
is already fully implemented (`HistoryChart.tsx`, wired into `GranjaDetail.tsx`).

## Shared architecture

New sampling/alerting/search logic lives mod-side (Java), following the existing
`FarmSampler` pattern (`mod/src/main/java/net/mcfarmmanager/mod/history/FarmSampler.java`) —
a ticker hung off `ServerTickEvents.END_SERVER_TICK`, writing to SQLite tables with the
same retention/pruning approach as farm history. Each new capability gets a mod HTTP
endpoint (`MCFarmManagerHttpServer`), a dashboard server proxy route (`routes/*.ts`, the
existing `proxy()` helper), and a client React Query hook with `refetchInterval` matching
existing polling intervals.

## 1. In-panel alerts (no webhook)

**Mod.** New `AlertChecker`, runs alongside `FarmSampler` on each sample tick. Rules:
- Storage >90% capacity on any storage row of a farm.
- Production rate ~0 for 3 consecutive samples on a non-`manual` farm.

Writes to new `alerts` table: `id, farm_id, type, message, created_at, dismissed_at`.
Dedup: skip re-firing the same `farm_id` + `type` while an undismissed alert already exists.

**Mod HTTP.** `GET /alerts` (active/undismissed only), `POST /alerts/{id}/dismiss`.

**Server.** `GET /api/alerts`, `POST /api/alerts/:id/dismiss`, proxying through.

**Client.** Bell icon in the header nav, badge showing active count, dropdown listing
`farm name — message` with a dismiss button per row. Polled every 30s (React Query
`refetchInterval`).

## 2. Task ↔ Farm linking

`tasks.farm_id` already exists (`schema.sql:29`, nullable TEXT, no FK constraint — matches
existing style, not adding one). Only UI work:
- Farm picker (`<select>` of current farms) in the task create/edit form.
- Chip showing the linked farm's name on task cards/list rows in Tareas.
- "Tareas relacionadas" card in `GranjaDetail.tsx`, listing `GET /api/tasks?farm_id=<id>`.

## 3. Player playtime log

**Mod.** On player join, insert a row into new `player_sessions` table
(`id, player_name, joined_at, left_at NULL`) if no open session exists for that player.
On leave, set `left_at` on the open session. On server startup, any session left open from
an unclean shutdown gets closed with `left_at` = the last recorded tick timestamp before
shutdown.

**Mod HTTP.** `GET /players/{name}/sessions?range=<duration>`.

**Server.** `GET /api/players/:name/sessions`.

**Client.** Small recharts chart (same pattern as `HistoryChart.tsx`) shown in a
Jugadores row expansion or detail view — session length over the selected range.

## 4. Server performance history

**Mod.** Extend the existing sampling loop (or a sibling ticker on the same interval) to
also record `{timestamp, tps, meanTickTimeMs}` into new `performance_history` table, same
retention/pruning as farm history.

**Mod HTTP.** `GET /performance/history?range=<duration>`.

**Server.** `GET /api/performance/history`.

**Client.** Chart on Overview, same `HistoryChart.tsx` pattern, alongside the existing
live TPS display.

## 5. Shulker/storage inventory search

**Mod HTTP.** `GET /search?item=<substring>` — scans all farms' already-loaded
`StorageInfo` (items already unpacked one level via `ItemStackInfo.selfAndContents()`,
`FarmSampler.java` already does per-item aggregation for history, so this reuses existing
item-flattening logic rather than adding new container-reading code). Returns
`[{farmId, farmName, storageId, storageLabel, itemId, count}]` for every match.

**Server.** `GET /api/search?item=`.

**Client.** Search box — a section on the Granjas page (not a new route, keeps it
discoverable without adding nav). Typing an item id/name substring lists matches with
links to each farm's detail page.

## 6. Granja "off" reason + auto re-check reminder

**Schema.** Add `off_reason TEXT` to `farm_metadata` (migration in `db.ts`, same
`ALTER TABLE ... ADD COLUMN` pattern as the existing `off` column migration).

**Server.** In `PATCH /farms/:id/metadata`, when `off` transitions `0 → 1` in the same
request, auto-insert a task using the existing task-insert logic
(`routes/tasks.ts`'s `POST /api/tasks` handler body, called directly, not via HTTP):
title `"Revisar granja apagada: {farm name}"`, `due_date` = now + 7 days, `farm_id` set to
the farm's id, `status = 'todo'`, `priority = 'med'`. No task is created if `off` was
already `1` (no-op transition) or is being cleared.

**Client.** `off_reason` text input shown next to the existing "Granja apagada" checkbox
in `GranjaDetail.tsx` edit mode, saved as part of the existing metadata PATCH.

## Testing

Each mod-side sampler/checker and server route gets the same test coverage style as
existing equivalents (`FarmSampler`/history store tests, existing route test files under
`dashboard/server`). No new test framework or pattern introduced.

## Out of scope

- Feature 2 (position picker) and Feature 4 (production chart) — already covered, see above.
- Click-to-pick coordinates on the squaremap iframe (considered for feature 2, dropped
  with the rest of that feature).
- Auto-deriving Jugadores `actividad` from the new session-length data — stays hand-set,
  unrelated to this batch.
- Alert channels beyond in-panel (email, Discord, push) — explicitly rejected in favor of
  in-panel only.
