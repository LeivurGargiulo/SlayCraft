# /tareas: subtask dropdown stacking, subtask save failure, priority sort

## Context

Three bugs on `/tareas` (dashboard/client + dashboard/server).

Root causes already diagnosed against live prod DB (`docker exec slaycraft-server-1`)
and by reading the code — no further investigation needed, just fix.

## Global Constraints

- Spanish UI strings stay Spanish, match existing tone.
- Don't touch unrelated `/tareas` behavior (view/edit mode toggle, subtask CRUD,
  confirm modals) — those were just shipped and are working.
- Server: keep `better-sqlite3` prepared-statement / transaction patterns already
  used in `dashboard/server/src/db.ts` and `dashboard/server/src/routes/tasks.ts`.
- Every task must run its test suite before committing (`npm test` in
  `dashboard/server`, `npx tsc --noEmit` in `dashboard/client`).

## Task 1: Fix corrupted `subtask_assignees` foreign key (subtask save failure)

**Bug:** Editing a subtask's assignees on `/tareas` always shows "No se pudo
guardar la subtarea."

**Root cause (confirmed live against the production DB):** `dashboard/server/src/db.ts`
lines 17-40 run a one-time migration that does:

```
db.exec('ALTER TABLE subtasks RENAME TO subtasks_old');
...
db.exec(schema);   // recreates `subtasks` fresh from schema.sql
...
db.exec('DROP TABLE subtasks_old');
```

`subtask_assignees` was never touched by this migration, but SQLite's
`ALTER TABLE ... RENAME TO` rewrites *other* tables' `FOREIGN KEY` clauses that
reference the renamed table. So `subtask_assignees.subtask_id`'s FK clause got
silently rewritten from `REFERENCES "subtasks"(id)` to `REFERENCES "subtasks_old"(id)`
during the rename, and then `subtasks_old` was dropped — leaving
`subtask_assignees` permanently referencing a nonexistent table.

Verified on the live prod DB (`docker exec slaycraft-server-1`):

```
sqlite_master.sql for subtask_assignees:
CREATE TABLE subtask_assignees (
  subtask_id INTEGER NOT NULL REFERENCES "subtasks_old"(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (subtask_id, player_id)
)
```

With `PRAGMA foreign_keys = ON` (set in `db.ts` line 11), any write touching a
table with a schema-invalid FK reference throws
`SqliteError: no such table: main.subtasks_old` — reproduced directly against
the live prod DB file by replaying the exact UPDATE `dashboard/server/src/routes/tasks.ts`'s
`PATCH /api/subtasks/:id` handler runs.

This is a **data problem in the already-deployed production DB**, not a code
bug reachable from a fresh schema — that's why all 47 existing server tests
pass (they build a fresh DB from `schema.sql`, which has the correct FK).

**Fix — add a startup migration in `dashboard/server/src/db.ts`** (same file,
after the existing migration block around line 40) that self-heals any DB
still carrying the broken reference:

1. Read `subtask_assignees`'s current `CREATE TABLE` SQL from `sqlite_master`
   (same pattern as the existing `tasksTableSql` check at line 14-16).
2. If it contains `'"subtasks_old"'` (or `subtasks_old` generally), run a
   transaction that: renames `subtask_assignees` to `subtask_assignees_old`,
   creates a fresh `subtask_assignees` from `schema.sql`'s definition (correct
   FK, since `db.exec(schema)` at line 13 already re-runs `CREATE TABLE IF NOT
   EXISTS` for every table — but `subtask_assignees` already exists so `IF NOT
   EXISTS` is a no-op; you need `DROP`+recreate or `CREATE TABLE` from a
   literal string, mirroring how the tasks/subtasks migration at lines 17-40
   handles it), copies all rows from `subtask_assignees_old` into it, then
   drops `subtask_assignees_old`.
3. Guard the whole thing behind the string check so it's a no-op on every DB
   that doesn't have the corruption (including every fresh test DB).

Write a test in `dashboard/server/test/` (new test file or add to
`test/tasks.test.ts`) that:
- Creates a DB, manually corrupts `subtask_assignees`'s FK to reference
  `subtasks_old` (drop + recreate the table with that literal broken
  `CREATE TABLE` SQL, matching what's shown above), inserts a row into it,
  then calls `openDb` again (or whatever bootstraps the migration) on that
  same file and confirms: the table now references `subtasks`, the
  previously-inserted row survived the migration, and a `PATCH
  /api/subtasks/:id` with `assignee_ids` on that DB now succeeds (200,
  no `SqliteError`).

Do **not** touch `dashboard/server/src/routes/tasks.ts` for this task — the
route handler logic is already correct; only the DB's on-disk schema is
broken.

## Task 2: Fix subtask assignee dropdown rendering under the task card below it

**Bug:** On `/tareas`, editing a subtask's assignees (the `MultiSelect` in
`dashboard/client/src/components/MultiSelect.tsx`, used from
`dashboard/client/src/pages/Tareas.tsx` around line 261) opens a dropdown that
gets visually covered by the next task's `Card` (`dashboard/client/src/components/Card.tsx`)
when hovered.

**Root cause:** `Card` is a `motion.div` with `whileHover={{ y: -2 }}`
(`Card.tsx` line 6-7). Framer Motion applies an inline `transform` style to
every `motion.div` that declares a transform-based animation prop, even at
rest — this makes **every** `Card` its own CSS stacking context permanently,
each with an implicit `z-index: auto` (treated as `0`). `MultiSelect`'s
dropdown (`MultiSelect.tsx` line 53, `className="absolute z-20 ..."`) lives
inside the *first* task's Card stacking context, so its `z-20` only wins
comparisons against siblings *inside that same Card* — it can't escape to
out-rank a sibling `Card` later in the DOM (the task below), which paints on
top of it per normal stacking order.

**Fix — render the `MultiSelect` dropdown menu through a React portal** to
`document.body`, positioned via the trigger button's `getBoundingClientRect()`,
so it's no longer inside any `Card`'s stacking context. Concretely, in
`dashboard/client/src/components/MultiSelect.tsx`:

- Add a `buttonRef` (`useRef<HTMLButtonElement>`) on the trigger `<button>`.
- When `open` becomes true, compute the button's bounding rect (via
  `useLayoutEffect` keyed on `open`) and store `{ top, left, width }` in
  state (position it `top: rect.bottom + 4, left: rect.left, width:
  Math.max(rect.width, contentMinWidth)` — match current `mt-1 w-full
  min-w-max` visual behavior as closely as practical).
- Render the `motion.div` dropdown (same contents/classes as today, swap
  `absolute` for `fixed` and drop `mt-1 w-full` since position now comes from
  inline style) via `createPortal(..., document.body)` instead of as a normal
  child.
- Keep the existing `useDropdown` outside-click-close behavior working — the
  portal content is outside `ref`'s DOM subtree, so `ref.current.contains(e.target)`
  in `dashboard/client/src/components/useDropdown.ts` will not include portal
  clicks and will close the dropdown on any click inside it. Fix this in
  `useDropdown.ts` (or locally in `MultiSelect.tsx`) — e.g. give the portaled
  dropdown its own ref and check `!ref.current.contains(e.target) &&
  !dropdownRef.current?.contains(e.target)` before closing. This must not
  regress `Select.tsx`, which also uses `useDropdown` without a portal — do
  not change `useDropdown`'s existing behavior for callers that pass no
  second ref.
- Recompute position on window scroll/resize while open (simple listener,
  cleanup on close/unmount) so the dropdown tracks the trigger.

Only change `MultiSelect.tsx` (and `useDropdown.ts` if you extend its
signature backward-compatibly). Do not change `Select.tsx` or `Card.tsx` —
out of scope for this bug report.

Verify manually is not required for this task (no browser tooling available
to the implementer); rely on `npx tsc --noEmit` passing and a careful read of
the positioning math. Note any residual visual-verification risk in your
report.

## Task 3: Sort tasks by priority on `/tareas`

**Bug:** Tasks on `/tareas` should display in priority order; currently they
sort only by due date.

**Current behavior:**
- Server: `dashboard/server/src/routes/tasks.ts` line 82,
  `GET /api/tasks` — `ORDER BY (due_date IS NULL), due_date ASC`.
- Client: `dashboard/client/src/pages/Tareas.tsx` lines 93-100, `visible` is
  built by `.filter()` only, no sort — it relies entirely on server order.

**Fix — server-side sort** (`dashboard/server/src/routes/tasks.ts` line 82):
change the `ORDER BY` so priority is the primary key and due date breaks ties
within the same priority. Priority values are `'low' | 'med' | 'high'`
(`PRIORITIES` const, line 6) — sort `high` first, then `med`, then `low`. SQL
has no implicit ordering for those strings, so use a `CASE` expression, e.g.:

```sql
SELECT * FROM tasks WHERE archived = 0
ORDER BY
  CASE priority WHEN 'high' THEN 0 WHEN 'med' THEN 1 WHEN 'low' THEN 2 END,
  (due_date IS NULL), due_date ASC
```

Update the existing test coverage in `dashboard/server/test/tasks.test.ts` (or
add a new test) that creates 3 tasks with `low`, `high`, `med` priority (in
that creation order, to prove the sort isn't relying on insertion order) and
asserts `GET /api/tasks` returns them `high, med, low`.

No client changes needed for this task — `Tareas.tsx`'s `visible` list
already renders `tasks.data.tasks` in server order after filtering. Confirm
this by reading `Tareas.tsx` lines 93-100 and the render loop at line 197;
if you find the client actually needs a change to preserve/display server
order correctly, make the minimal fix and say so in your report — don't
silently skip it.

## Verification (each task)

- `dashboard/server`: `npm test` — all tests green, including any new ones.
- `dashboard/client`: `npx tsc --noEmit` — no errors.
