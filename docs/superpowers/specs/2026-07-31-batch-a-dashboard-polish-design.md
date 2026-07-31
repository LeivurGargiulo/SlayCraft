# Batch A: dashboard-only polish

Part of the 11-item feature request tracked in `dashboard/docs/FEATURE_FEASIBILITY.md`. This batch covers items 7, 6, 4/4b (non-shulker), and 1D — the four items requiring zero MCFarmManager mod changes and no schema/migration decisions. Batches B (data model additions), C (production rate), and D (mod changes) are separate, later specs.

## Goal

Ship visible dashboard improvements fast, using only data the API already returns, with no backend risk (no mod rebuild/redeploy, no DB migration).

## 1. Dynamic Map embed

A live map server (BlueMap or similar) is already running and reachable at `http://localhost:25566` — confirmed listening, no ops work needed.

- New route `/mapa`, new nav entry in `client/src/components/Layout.tsx` alongside the existing nav items.
- New page `client/src/pages/Mapa.tsx`: a full-height `<iframe src="http://localhost:25566">`, no header chrome competing for space.
- No backend involvement, no new hook, no new API route.

## 2. Auto-refresh polling

`client/src/api/hooks.ts` already uses `@tanstack/react-query` with `refetchInterval` set on `useFarms` (30s), `useFarm` (15s), `useLivePlayers` (15s), `usePerformance` (10s). The following hooks currently have no interval (fetch-once + react-query default focus-refetch only) and will get one added, matching interval scale to how often the underlying data actually changes:

- `useTasks` — 15s (task status/assignee changes are the most actively-edited data on the dashboard)
- `usePlayers` — 30s (roster changes are infrequent)
- `useProjects` — 30s
- `useGallery` — 30s
- `useFarmHistory` — 30s (history samples land every 5 min server-side by default; 30s is just for "did someone else just look at a different range" freshness, not to catch new samples faster than they're produced)
- `useMe` — no interval; this is an auth-check hook, not live data, leave as fetch-once/on-mount.

No new hooks, no new types, no new server routes — this is a diff entirely inside `hooks.ts`.

## 3. Entity type display

`GranjaDetail.tsx` currently renders zero entity information despite `useFarm()` already returning `f.entities: Array<{ id, type, customName, position, health }>` (unused today).

New card "Entidades", inserted between the existing "Trabajador" and "Almacenamiento" cards:

- Client-side: group `f.entities` by `type`, count occurrences, render as rows like `12x iron_golem` (strip the `minecraft:` namespace prefix for readability — `type.replace(/^minecraft:/, '')`).
- Empty state: "Sin entidades detectadas." matching the existing empty-state style used elsewhere on this page (e.g. "Sin trabajador asignado.").
- Pure derived state (`useMemo` or inline reduce), no new hook, no new API call — data is already in the `useFarm` response.

## 4. Storage totals + type breakdown + per-chest detail

Current "Almacenamiento" card (`GranjaDetail.tsx` lines ~82-94) renders a flat list: one row per configured chest, `count / capacity*64`. This gets reworked, not replaced:

**Top section (always visible):**
- Grand total: sum of every item stack's `count` across every chest in `f.storage` (arithmetic already partially present, just needs to run across all chests instead of per-chest only).
- Item-type breakdown: reduce all chests' `items[]` into a `Map<itemId, count>`, render as rows (`64x iron_ingot`, `12x gold_ingot`), same visual style as the new entity card for consistency. Strip `minecraft:` prefix same as entities.

**Below, collapsed by default (`<details>`/accordion, native HTML — no new dependency):**
- The existing per-chest list, unchanged: label, `count / capacity*64` per chest.

All computation is client-side over data the `useFarm` hook already returns (`StorageInfo[]` with itemized `items[]` per chest) — no new API calls, no new server-side aggregation, no mod changes. This intentionally does not cover shulker-box-nested contents (tracked separately as part of Batch D — requires new mod-side Java code to read `ItemStack` component data, out of scope here).

## Non-goals (explicitly deferred to later batches)

- Shulker box nested contents (Batch D, needs mod rebuild)
- Server-side aggregated storage endpoint (rejected in brainstorming — client-side chosen to avoid mod changes in this batch)
- WebSocket/SSE push updates (polling via react-query is sufficient; no sub-second latency requirement exists anywhere in this batch)
- Any change to farm config, task schema, or player data model (Batches B/C/D)

## Files touched

- `client/src/App.tsx` — +1 route (`/mapa`)
- `client/src/components/Layout.tsx` — +1 nav item
- `client/src/pages/Mapa.tsx` — new file
- `client/src/pages/GranjaDetail.tsx` — new entity card, reworked storage card
- `client/src/api/hooks.ts` — `refetchInterval` added to 5 hooks

No server-side files, no `schema.sql` changes, no MCFarmManager mod files.

## Testing

Manual verification only (no existing test suite covers `client/`):
1. Load `/mapa`, confirm the BlueMap/map UI renders inside the iframe and is interactive.
2. Load a farm detail page for a farm with known entities and chest contents; confirm grouped entity counts and storage total/breakdown match manual counting in-game.
3. Confirm the per-chest accordion still shows the same data as before this change (regression check).
4. Watch browser network tab on Tareas/Jugadores/Proyectos/Galeria/farm-history views, confirm periodic refetch at the configured intervals, confirm no infinite-loop or duplicate-request bugs.
