# Mineflayer Flatten Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the spike's naive break-only `flatten` with a job-queued, SQLite-resumable, fill-from-own-inventory flatten command, per `docs/superpowers/specs/2026-07-31-mineflayer-flatten-bot-design.md`. Schematic building stays deferred; Job Manager/Execution Engine stay generic so a schematic compiler can slot in later without touching them.

**Architecture:** `db.js` (JobManager over `better-sqlite3`) ← `flattenCompiler.js` (region scan → full break+place action list) ← `executionEngine.js` (generic action-list runner, rebuilds fill-stock from done actions on resume) ← `commands.js` (chat command parsing + owner/admin permission tier) ← `index.js` (wiring, FIFO queue-drain loop, startup requeue of interrupted jobs).

**Tech Stack:** Node.js LTS 20+ (repo has v24), `mineflayer` (existing), new deps `better-sqlite3` and promoting `vec3` to a direct dependency (already transitive via mineflayer at 0.1.10). Tests use Node's built-in `node:test`/`assert` — no new test-framework dependency.

## Global Constraints

- Fill source is the bot's own inventory from breaking, per spec's Fill logic section — no chest/purchase fallback this iteration.
- `place` action with empty stock for every `block_type` → marked `failed` with `error = "no fill block available (inventory exhausted)"`; Execution Engine skips it and continues (Phase-4 "skip" decision made now, not deferred).
- `type` column on `jobs` stays free-text (only `'flatten'` produced now), matching spec's forward-compat note for a future `'schematic'` value.
- One active job at a time, FIFO queue for the rest, checkpoint per completed action (no batching — measure first if per-action writes prove slow, per spec).
- Startup requeues any job left `running` from an unclean shutdown (auto-requeue, decided now not deferred).
- Cancel requires job owner or admin — new `ADMINS` set, a subset of the existing whitelist.

---

### Task 1: Job data layer (`db.js`)

**Files:**
- Create: `mineflayer/mineflayer-test/src/db.js`
- Create: `mineflayer/mineflayer-test/test/db.test.js`
- Modify: `mineflayer/mineflayer-test/package.json` (add `better-sqlite3`)

**Interfaces:**
- Produces: `class JobManager` with `enqueue(type, requestedBy, paramsJson, actions)`, `cancel(jobId, requestedBy, isAdmin)`, `getStatus(jobId)`, `getQueue()`, `getNextQueuedJob()`, `markRunning(jobId)`, `markJobStatus(jobId, status)`, `markActionDone(jobId, seq)`, `markActionFailed(jobId, seq, error)`, `getPendingActions(jobId)`, `getDoneActions(jobId)`, `getInterruptedJobs()`, `close()`. Consumed by `executionEngine.js` (Task 3), `commands.js` (Task 4), `index.js` (Task 4).

- [ ] **Step 1: Install `better-sqlite3`**

Run from `mineflayer/mineflayer-test/`:
```bash
npm install better-sqlite3
```

- [ ] **Step 2: Write `db.js`**

Schema exactly as in the spec (`jobs` and `job_actions` tables, see design doc's Data model section). `JobManager` constructor takes a db file path, runs `CREATE TABLE IF NOT EXISTS` for both tables, and wraps all the methods listed above as prepared statements. `enqueue` inserts the job row plus one `job_actions` row per action in the given list, all in a transaction. `getDoneActions`/`getPendingActions` filter `job_actions` by `status`. `getInterruptedJobs` returns jobs with `status = 'running'` (used by `index.js` startup requeue).

- [ ] **Step 3: Write `test/db.test.js`**

Using `node:test` + `node:assert`, against a temp SQLite file (or `:memory:` if `better-sqlite3` supports it for this use — confirm during implementation): cover enqueue→getQueue, markRunning→getInterruptedJobs, markActionDone/markActionFailed→getDoneActions/getPendingActions split, and cancel permission (owner can, non-owner/non-admin cannot).

- [ ] **Step 4: Run tests**

Run from `mineflayer/mineflayer-test/`: `node --test test/db.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add mineflayer/mineflayer-test/package.json mineflayer/mineflayer-test/package-lock.json mineflayer/mineflayer-test/src/db.js mineflayer/mineflayer-test/test/db.test.js
git commit -m "feat(mineflayer): add SQLite job data layer"
```

---

### Task 2: Flatten compiler (`flattenCompiler.js`)

**Files:**
- Create: `mineflayer/mineflayer-test/src/flattenCompiler.js`
- Create: `mineflayer/mineflayer-test/test/flattenCompiler.test.js`

**Interfaces:**
- Produces: `function compileFlatten(bot, {x1, z1, x2, z2, targetY})` returning an ordered action array `[{action: 'break'|'place', pos: {x,y,z}, blockType?}]`. Consumed by `commands.js` (Task 4, on `!bot flatten`) and by `test/flattenCompiler.test.js` against a fake `bot.blockAt`.

- [ ] **Step 1: Write `flattenCompiler.js`**

Constants `BREAK_SCAN_HEIGHT = 10`, `FILL_SCAN_DEPTH = 10`. For each column `(x, z)` in the `[x1,x2] x [z1,z2]` rectangle: scan from `targetY + BREAK_SCAN_HEIGHT` down to `targetY + 1` via `bot.blockAt`, emit a `break` action (top-down) for every non-air block found. Then scan from `targetY - 1` down to `targetY - FILL_SCAN_DEPTH`, emit a `place` action (bottom-to-top, so lowest gap first) for every air block found. Return the full break-then-fill list, break actions first (column order doesn't matter for correctness, but keep it deterministic — same iteration order for both scans).

- [ ] **Step 2: Write `test/flattenCompiler.test.js`**

Fake `bot` with a `blockAt(vec3)` stub backed by a small in-memory column map. Cover: a column entirely above `targetY` (all break, no place), a column entirely air below `targetY` (all place, no break), a mixed column, and multi-column ordering.

- [ ] **Step 3: Run tests**

Run from `mineflayer/mineflayer-test/`: `node --test test/flattenCompiler.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add mineflayer/mineflayer-test/src/flattenCompiler.js mineflayer/mineflayer-test/test/flattenCompiler.test.js
git commit -m "feat(mineflayer): add flatten job compiler"
```

---

### Task 3: Execution engine (`executionEngine.js`)

**Files:**
- Create: `mineflayer/mineflayer-test/src/executionEngine.js`
- Create: `mineflayer/mineflayer-test/test/executionEngine.test.js`
- Modify: `mineflayer/mineflayer-test/package.json` (promote `vec3` to direct dependency)

**Interfaces:**
- Consumes: `JobManager` (Task 1) methods `getDoneActions`, `getPendingActions`, `markActionDone`, `markActionFailed`, `markJobStatus`.
- Produces: `class ExecutionEngine { constructor(bot, jobManager); async runJob(jobId): Promise<void> }`. Consumed by `commands.js`/`index.js` (Task 4).

- [ ] **Step 1: Add `vec3` as a direct dependency**

Run from `mineflayer/mineflayer-test/`: `npm install vec3` (pins the version already resolved transitively via mineflayer 0.1.10 as a direct dep, since `executionEngine.js` requires it directly for place-block face vectors).

- [ ] **Step 2: Write `executionEngine.js`**

`runJob(jobId)`:
1. Rebuild the job's fill-stock map from `jobManager.getDoneActions(jobId)`: for each done action, `break` → `stock[blockType] = (stock[blockType] ?? 0) + 1`, `place` → `stock[blockType] -= 1`. This makes resume-from-crash correct without a separate persisted counter.
2. Walk `jobManager.getPendingActions(jobId)` in `seq` order. For each:
   - `break`: pathfind to the position, `bot.dig` the block, `blockType = ` the block that was actually there; on success `stock[blockType] += 1`, `markActionDone`. On dig failure, `markActionFailed` with the thrown error's message and continue.
   - `place`: pick a `blockType` — the action's own `block_type` if `stock[blockType] > 0`, else the first `block_type` in `stock` with count `> 0`. If none available, `markActionFailed(jobId, seq, "no fill block available (inventory exhausted)")` and continue (do not abort the job). Otherwise pathfind, equip that block type, `bot.placeBlock` against the correct face vector (`vec3`), `stock[blockType] -= 1`, `markActionDone`.
3. Chat progress every 10s (a `setInterval` cleared when the loop ends): completed/total action count.
4. On loop completion, `markJobStatus(jobId, 'completed')` (or `'failed'` if any action ended in `failed` — decide via a completion pass over `job_actions` status, matching spec's "specific failed-position error reporting" goal without aborting mid-job).

- [ ] **Step 3: Write `test/executionEngine.test.js`**

Fake `bot` (stub `dig`, `placeBlock`, `equip`, `blockAt`, pathfinder no-op) and a real or fake `JobManager` (in-memory SQLite is fine here too, reusing Task 1's `JobManager`). Cover: full run with even break/place balance, resume after a simulated crash (some actions already `done` — confirm stock rebuild is correct and no double-execution), and stock exhaustion (a `place` with no matching stock gets `failed` with the exact error string, engine continues past it).

- [ ] **Step 4: Run tests**

Run from `mineflayer/mineflayer-test/`: `node --test test/executionEngine.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add mineflayer/mineflayer-test/package.json mineflayer/mineflayer-test/package-lock.json mineflayer/mineflayer-test/src/executionEngine.js mineflayer/mineflayer-test/test/executionEngine.test.js
git commit -m "feat(mineflayer): add execution engine with resumable fill-stock"
```

---

### Task 4: Command layer + entrypoint wiring

**Files:**
- Create: `mineflayer/mineflayer-test/src/commands.js`
- Modify: `mineflayer/mineflayer-test/index.js` (rewrite entrypoint)

**Interfaces:**
- Consumes: `JobManager` (Task 1), `compileFlatten` (Task 2), `ExecutionEngine` (Task 3).
- Produces: `function registerCommands(bot, {jobManager, whitelist, admins, startProcessing})` wiring chat listeners for `!bot goto/flatten/queue/status/cancel/stop`.

- [ ] **Step 1: Write `commands.js`**

`registerCommands` attaches a `bot.on('chat', ...)` handler gated by the existing whitelist check. Commands:
- `!bot goto x y z` — existing pathfinder behavior from the spike, unchanged.
- `!bot flatten x1 z1 x2 z2 targetY` — `compileFlatten` then `jobManager.enqueue('flatten', username, JSON.stringify(params), actions)`, chat back the new job id, call `startProcessing()` to kick the queue-drain loop if idle.
- `!bot queue` — chat `jobManager.getQueue()` summary.
- `!bot status [jobId]` — chat `jobManager.getStatus(jobId)` (default: current running job).
- `!bot cancel <id>` — check `requestedBy === username || admins.has(username)` before `jobManager.cancel`; chat a permission-denied message otherwise.
- `!bot stop` — admin-only, stops the current job after its in-flight action (sets a flag the running `ExecutionEngine.runJob` loop checks between actions).

New `ADMINS` set (subset of whitelist) — define alongside the existing whitelist config in `index.js` and pass through.

- [ ] **Step 2: Rewrite `index.js`**

Wire `JobManager` + `ExecutionEngine` on bot spawn. `startProcessing()`: if no job currently running, pop `jobManager.getNextQueuedJob()`, `markRunning`, `await executionEngine.runJob(jobId)`, then loop (FIFO drain) until the queue is empty. On bot spawn (startup), call `jobManager.getInterruptedJobs()` and re-requeue each (`markJobStatus(jobId, 'queued')`) before starting the drain loop — this is the crash-resume auto-requeue.

- [ ] **Step 3: Manual verification against real server**

Connect the bot to the target Fabric server (per `mineflayer/HANDOFF.md` setup). Verify:
- `!bot flatten` on a small region enqueues, processes, and actually flattens correctly in-game.
- `!bot queue`/`!bot status` reflect real state.
- `!bot cancel` respects owner/admin permission.
- Killing and restarting the bot process mid-job requeues and resumes correctly (fill-stock rebuild proven, not just unit-tested).

- [ ] **Step 4: Commit**

```bash
git add mineflayer/mineflayer-test/src/commands.js mineflayer/mineflayer-test/index.js
git commit -m "feat(mineflayer): wire job queue commands into bot entrypoint"
```

---

### Task 5: Phase-4 manual hardening checklist

**Files:** none (manual testing only, no code changes expected unless a bug surfaces)

- [ ] **Step 1: Reconnect-mid-job test**

Force a real disconnect (not just a process kill) while a flatten job is running. Confirm the bot reconnects and the job resumes correctly, not just pauses forever.

- [ ] **Step 2: Load test**

Run flatten on a genuinely large region. Watch for SQLite write-frequency slowdown (per-action checkpoint may need batching — spec left this open, decide from this data) and pathfinding thrash. Note findings; only change checkpoint batching if this test shows it's actually a problem.

- [ ] **Step 3: Record open-decision resolutions**

Update `docs/superpowers/specs/2026-07-31-mineflayer-flatten-bot-design.md`'s "Open decisions left for implementation" section with what Steps 1-2 resolved (fill-exhaustion behavior was already decided in Task 3 as "skip"; confirm checkpoint batching and interrupted-job resume UX here).

---

## Post-plan

After Task 4 is verified and Task 5's checklist is run, this branch is ready to merge per `superpowers:finishing-a-development-branch`.
