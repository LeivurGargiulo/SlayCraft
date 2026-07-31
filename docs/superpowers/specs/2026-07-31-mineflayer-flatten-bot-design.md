# Mineflayer Flatten Bot — Design

## Context

Supersedes the "next phase" scope in `mineflayer/mc-bot-implementation-plan.md`
for this iteration. That plan's spike is done and validated: mineflayer
connects to the target Fabric server via `mfo-registry-compat-1.0.0.jar`,
keepalive mismatch fixed (`checkTimeoutInterval: 150000`), whitelist-gated
chat commands, `goto`, and a naive break-only `flatten` all work
(`mineflayer/mineflayer-test/index.js`). See `mineflayer/HANDOFF.md` for full
history.

## Scope change from the original plan

**Schematic building (`.schem`/`.litematic`) is deferred, not built in this
iteration.** This drops:
- Phase 0 (de-risking `mineflayer-schem` vs. `prismarine-schematic`)
- The schematic job compiler (former Phase 4)
- The `prismarine-schematic` / `mineflayer-schem` dependencies

The bot is flatten-only for now. The Job Manager and Execution Engine stay
generic (operate on an action list of `{action: 'break'|'place', pos,
blockType?}`), so a schematic compiler can be added later as a new job
compiler without touching either — this is why the design keeps that split
even with only one compiler in play.

Everything else from the original plan holds: goal (1) flatten via chat
command, block-by-block, survival-legit; goal (3) any whitelisted player can
trigger jobs; goal (4) queueable/resumable/concurrency-safe jobs; goal (5)
decent UX (immediate ack, progress at intervals, specific error reporting,
`!bot status`). Goal (2), schematic building, is out of scope for this
iteration.

## Stack

Unchanged from the original plan except dropping the schematic libraries:

| Layer | Choice |
|---|---|
| Runtime | Node.js LTS 20+ |
| Protocol/bot | `mineflayer` |
| Movement | `mineflayer-pathfinder` |
| Persistence | SQLite via `better-sqlite3` |
| Job queue/concurrency | Hand-rolled, in-process, one active job at a time |
| Config | `.env` / `dotenv` |

## Architecture

```
Chat Command Parser  →  Permission/Auth Layer  →  Job Manager (SQLite)
                                                        │
                                            Flatten Job Compiler
                                                        │
                                              Execution Engine
                                                        │
                                            Progress / UX Reporter
```

- **Chat Command Parser**: `!bot flatten ...`, `!bot queue`, `!bot status`,
  `!bot cancel <id>`, `!bot stop`.
- **Permission/Auth Layer**: whitelist check (existing), plus one tier —
  job owner or admin can cancel a job, others cannot.
- **Job Manager**: owns the FIFO queue, one active job at a time, persists
  job state to SQLite, exposes `enqueue`, `cancel`, `getStatus`, `getQueue`.
- **Flatten Job Compiler**: turns a `!bot flatten` request into a full
  action list up front (see Fill logic below), before any execution starts.
- **Execution Engine**: generic action-list runner — walk to position
  (pathfinder), `bot.dig`/`bot.placeBlock` per action, mark `done` in
  `job_actions`, checkpoint for resumability. Not flatten-specific, so a
  future schematic compiler reuses it unchanged.
- **Progress/UX Reporter**: chat acknowledgment on enqueue, progress at
  intervals (every 5% or 10s, whichever is less spammy), specific
  failed-position error reporting.

## Data model (SQLite)

Unchanged from the original plan — `type` stays a free-text column (not an
enum) so a future `'schematic'` value doesn't need a migration, even though
only `'flatten'` is produced right now.

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,              -- 'flatten' (only value produced this iteration)
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL,            -- 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  params_json TEXT NOT NULL,
  total_actions INTEGER,
  completed_actions INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE job_actions (
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  seq INTEGER NOT NULL,
  action TEXT NOT NULL,            -- 'break' | 'place'
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  z INTEGER NOT NULL,
  block_type TEXT,                 -- null for 'break'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'done' | 'failed'
  error TEXT,
  PRIMARY KEY (job_id, seq)
);
```

## Fill logic (decided now, not deferred)

Fill source is **the bot's own inventory from breaking**, not a designated
filler block or chest retrieval:

1. The flatten compiler scans the region and produces `break` actions
   top-down per column (above `targetY`) followed by `place` actions
   bottom-to-top per column (below `targetY`), all up front as one action
   list — same as the original plan's "store the full action list" approach.
2. The Execution Engine tracks a per-job fill-stock counter, keyed by
   `block_type`, incremented as each `break` action completes (using the
   block that was actually dug).
3. Each `place` action draws one unit from that job's fill stock for its
   target `block_type`. If the action list's compiler can't determine a
   sensible fill type for a given position from stock (e.g. stock is empty
   for every broken type at that point), the action is left generic and
   resolved at execution time: pull whatever block_type currently has stock
   > 0.
4. If a `place` action executes with zero stock available for any
   block_type, it's marked `failed` with
   `error = "no fill block available (inventory exhausted)"`, reported via
   the existing specific-position error UX. No chest/purchase fallback —
   this is the deliberate simplification from choosing own-inventory-only
   fill.

## Concurrency & resumability

Unchanged from the original plan: one active job at a time, FIFO queue for
the rest, owner/admin-only cancel, checkpoint-on-completed-action (or
batched if per-action SQLite writes prove too slow — measure first), and a
startup check for any job left `running` from an unclean shutdown.

## Task breakdown (renumbered, schematic phase removed)

### Phase 1 — Job data layer
- `better-sqlite3` setup, schema above.
- Job Manager module: `enqueue`, `cancel`, `getStatus`, `getQueue`.
- Unit-testable without mineflayer.

### Phase 2 — Flatten compiler + Execution Engine
- Flatten compiler: region scan → full break+fill action list (fill logic
  above), replacing the spike's inline break-only loop.
- Execution Engine: generic action-list runner, checkpointing per action.
- Resumability working end-to-end (this is the simpler case to prove it on
  before any future schematic work reuses it).

### Phase 3 — Job UX layer
- `!bot queue`, `!bot status`, `!bot cancel <id>`.
- Progress reporting at intervals.
- Owner/admin cancel permission tier.
- Startup check for interrupted `running` jobs.

### Phase 4 — Polish/hardening
- Fill-exhaustion UX: pause vs. skip vs. abort when stock runs out mid-job
  — decide from testing, not upfront.
- Reconnect-mid-job test: confirm pause/resume across a real disconnect,
  not just a manual restart.
- Load-test flatten on a genuinely large area for real pacing issues
  (SQLite write frequency, pathfinding thrash) before calling this done.

## Open decisions left for implementation

- Fill-exhaustion behavior (pause/skip/abort) — Phase 4, needs testing data.
- Checkpoint batching frequency (per-action vs. every N) — Phase 2, measure
  before optimizing.
- Interrupted-job resume UX (auto-resume vs. admin prompt) — Phase 3.

## Deferred (not this iteration)

- Schematic building (`.schem`/`.litematic`), the `mineflayer-schem` vs.
  `prismarine-schematic` de-risking spike, and any materials-preview UX tied
  to it. Architecture (generic Job Manager/Execution Engine, free-text
  `type` column) is kept compatible with adding this later.
