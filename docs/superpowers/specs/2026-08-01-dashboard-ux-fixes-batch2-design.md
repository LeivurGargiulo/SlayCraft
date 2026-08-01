# Dashboard UX Fixes — Batch 2

Date: 2026-08-01
Status: Approved for planning

## Context

11 client-reported UX issues across `/tareas`, `/granjas`, `/jugadores`, and `/` (Overview). Audited against current `dashboard/client` and `dashboard/server` state (see file:line refs per item below). This spec covers scope and behavior; the implementation plan (separate doc) covers task breakdown and sequencing.

## 1. Custom confirm modals (replace native `confirm()`)

**Current state:** 4 delete flows use bare `confirm()`:
- `dashboard/client/src/pages/Galeria.tsx:59`
- `dashboard/client/src/pages/Tareas.tsx:199`
- `dashboard/client/src/pages/Jugadores.tsx:69`
- `dashboard/client/src/pages/ProyectoDetail.tsx:45`

A custom `ConfirmModal` (`dashboard/client/src/components/ConfirmModal.tsx`) already exists and is used once, in `GranjaDetail.tsx:205-214`.

**Change:** Replace all 4 native `confirm()` calls with `ConfirmModal`, matching the `GranjaDetail.tsx` usage pattern (open state + confirm callback). Same confirmation copy as today, just non-native UI.

## 2. /tareas view/edit mode

**Current state:** `Tareas.tsx` renders one flat list; CRUD controls (create button, per-row status select, edit, delete, subtask add) are always visible.

**Change:** Add a `mode: 'view' | 'edit'` toggle in the page header, local component state, **defaults to `'view'` on every page load/visit** (not persisted). In view mode: hide "+ Nueva tarea", per-row "Editar"/"Eliminar" buttons, the inline status `<Select>`, and the inline subtask add form/checkbox toggle. Task list, filters, and subtask display (read-only) remain visible in both modes.

## 3. Remove "bloqueada" status

**Current state:**
- Schema: `dashboard/server/src/schema.sql:26` — CHECK includes `'blocked'`
- Server: `dashboard/server/src/routes/tasks.ts:5` — `STATUSES` array
- Client type: `dashboard/client/src/api/types.ts:1` — `TaskStatus` union
- UI: `Tareas.tsx:15,17` (`STATUSES`, `STATUS_LABEL`), `StatusBadge.tsx:4,13`

**Change:** Remove `'blocked'` from all 5 locations above. One-time SQL migration: `UPDATE tasks SET status='todo' WHERE status='blocked'` run before the CHECK constraint is tightened (SQLite requires table rebuild for CHECK changes — follow existing migration pattern in this repo if one exists, else recreate-and-copy). Note: the `status-blocked` Tailwind color token is reused elsewhere for generic error/delete styling (ConfirmModal, error text, etc.) — that token stays, only the task-status usage is removed.

## 4. Auto-archive done tasks after 3 continuous days

**Current state:** No `completed_at` timestamp, no archive flag, no cron/cleanup logic anywhere in client or server (confirmed via full grep, zero hits).

**Change:**
- Schema: add `completed_at TEXT` (nullable) and `archived INTEGER NOT NULL DEFAULT 0` to `tasks`.
- Server: on any status-changing update (`PATCH /api/tasks/:id` in `tasks.ts`), when new status is `'done'` and old status wasn't, set `completed_at = now()`. When status changes away from `'done'`, clear `completed_at = NULL` (resets the 3-day clock — "continuous" means uninterrupted done status).
- Lazy sweep, no cron: on `GET /api/tasks`, before returning, run `UPDATE tasks SET archived=1 WHERE status='done' AND archived=0 AND completed_at <= now-3days`. Default list response excludes `archived=1` rows (matches "auto remove" — hidden, not deleted). No archive-browsing UI in this batch (data is preserved, just hidden from default views — can add a view later if needed).
- Overview "needs attention" (#10) and `Tareas.tsx` filtering both respect the exclusion automatically since they consume the same `GET /api/tasks` response.

## 5. Subtask CRUD + multi-assignee

**Current state:**
- Subtasks exist: schema `dashboard/server/src/schema.sql:35-40`, type `types.ts:14-20`, routes in `tasks.ts` (create `108-115`, update `117-131`, delete `133-137`).
- UI only supports add + toggle-done (`Tareas.tsx:207-234`) — no rename, no delete button rendered, despite the delete route existing.
- No assignee field on subtasks at all (table has none, type has none). Tasks use a `task_assignees` join table (`schema.sql:43-47`) with `MultiSelect` UI (`Tareas.tsx:290-298`).

**Change:**
- Schema: add `subtask_assignees` table mirroring `task_assignees` (subtask_id + player_id).
- Server: extend subtask update/create routes to accept assignee list, mirroring how `tasks.ts` handles `setAssignees()` for tasks.
- UI (edit mode only, per #2): each subtask row gets a rename control (inline edit or small pencil→text-input), a delete button (wired to the existing `DELETE /api/subtasks/:id` route), and a `MultiSelect` for assignees (reuse the same component as the task-level one).

## 6. Task editor modal resize

**Current state:** No dedicated modal component — generic `Modal.tsx` (`max-h-[90vh] max-w-lg overflow-y-auto`) wraps inline form markup in `Tareas.tsx:240-308`, single-column `space-y-3`/`space-y-4` stacking, causes vertical scroll.

**Change:** Widen to `max-w-3xl`. Restructure form fields into a responsive 2-column grid (`grid grid-cols-1 sm:grid-cols-2 gap-4`) for the paired fields already grouped today (priority+date, farm+project), title/description remain full-width. Goal: fit without scrolling on a typical desktop viewport; mobile collapses to 1 column and keeps `overflow-y-auto` as fallback.

## 7. Farm icon for quick identification

**Current state:** No dedicated icon/avatar field. `Granjas.tsx:59-63` already shows `f.images[0]` as the card cover image when present, else "Sin imagen" text.

**Change:** No new schema. Extend the existing `images[0]`-as-thumbnail pattern to every place a farm needs quick visual ID: card grid (already has it), sidebar/nav farm lists if any, `GranjaDetail.tsx` header. Small round/square thumbnail crop. Fallback for farms with zero images: a generic placeholder icon (not text) instead of "Sin imagen".

## 8. Stuck golden hover glow

**Current state:** `Card.tsx:6-9` uses framer-motion `whileHover={{ borderColor: '#e8b339' }}`. Pointer-only trigger — no touch-end reset, no `focus-visible` handling, source of the "stuck" reports on touch devices. `Card` is the base wrapper used across nearly every list item app-wide.

**Change:** Replace `whileHover` border-color animation with a plain CSS `hover:border-gold focus-visible:border-gold` class (matches existing pattern in `Select.tsx:36`, `MultiSelect.tsx:41`, `FileUploadButton.tsx:12`). Keep the `whileHover={{ y: -2 }}` lift animation (that part isn't reported as buggy) — only the border-color piece moves to CSS. CSS `:hover` naturally has no stuck-state risk on touch and adds keyboard focus support for free.

## 9. Sticky sidebar on /granjas (and everywhere)

**Current state:** `Sidebar.tsx:20` is a normal flex child (`sm:h-screen sm:w-52`), not `sticky`/`fixed`. `Layout.tsx:12,14` wraps sidebar + `<main>` in a flex row with no independent scroll region — when page content overflows viewport height, the whole document scrolls and the sidebar scrolls away, exposing its bottom border.

**Change:** `Sidebar.tsx` desktop variant (`sm:` breakpoint) becomes `sm:sticky sm:top-0 sm:h-screen`. This is a layout-level fix in `Layout.tsx`/`Sidebar.tsx`, so it applies to all pages, not just `/granjas` (item 9 names `/granjas` because that's the longest page today, but the bug is structural).

## 10. Overview "needs attention" filter + assignee display

**Current state:** `Overview.tsx:16-18` filters only `priority === 'high'`, no status check — `done` and (today) `blocked` tasks show equally. `Overview.tsx:71-78` renders title + `StatusBadge` only, no assignee.

**Change:** Filter becomes `priority === 'high' && status !== 'done'` (the `archived` exclusion from #4 is already applied server-side, no extra client filter needed). Row rendering adds assignee name(s) — data already present on the task object via `task_assignees`, just needs to be displayed (reuse whatever player-name rendering pattern `Tareas.tsx` already uses for assignees).

## 11. Players grid layout with categories

**Current state:** `Jugadores.tsx` already implements the category split (`activo`/`ocasional`/`inactivo` via `Actividad` type, `types.ts:4`, `schema.sql:9`) and a separate "En línea" online section (`Jugadores.tsx:26-28,106-113`), computed client-side from live server data. Currently rendered as a **list**, not a grid — this is why the client hasn't perceived any visible change from the earlier category work. Reference: old minecoop site (`_archive/minecoop/src/pages/jugadores.astro`) used a per-category grid (`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4`) of avatar+username cards.

**Change:** Restyle each section (online + 3 actividad groups) from list to grid using that same `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` pattern. Card = existing `PlayerSkin` component (`components/PlayerSkin.tsx`, already renders a 3D skin view per player, currently used inline in the list row at `Jugadores.tsx:45`) + player name below it, matching the old site's card shape. No new avatar asset/service needed — `PlayerSkin` already exists and is wired to `minecraft_name`. Section headers, ordering (`ACTIVIDAD_ORDER`), and the online/offline split logic (`Jugadores.tsx:26-28`) stay as-is — only the list→grid container and per-item markup change.

## Out of scope / deferred

- Archive-browsing UI for auto-archived done tasks (#4) — data is preserved and can be surfaced later if needed.
- Dedicated farm icon upload separate from gallery photos (#7) — explicitly rejected in favor of reusing `images[0]`.
- Persisting /tareas view/edit mode choice across visits (#2) — explicitly defaults to view every time.
