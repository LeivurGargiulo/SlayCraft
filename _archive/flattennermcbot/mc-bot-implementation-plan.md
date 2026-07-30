# Minecraft Builder Bot — Implementation Plan for Claude Code

## Context (read this first)

This continues from a validated spike. Confirmed working already:
- Mineflayer connects to the target server (modded, via a server-side
  compat mod called `mfo-registry-compat-1.0.0.jar`) with no client mods
  needed.
- A keepalive mismatch (server tuned to 120s intervals via the
  `packetfixer` mod, mineflayer defaulting to a 30s client timeout) was
  found and fixed via `checkTimeoutInterval: 150000` in `createBot()`
  options. This is a known-good, already-applied fix — don't revisit it.
- Whitelist-gated chat commands, basic `goto`, and a naive break-only
  `flatten` all work.

This document scopes the **next phase**: turning that spike into a real
tool with full flatten (break + fill), `.schem`/`.litematic` schematic
building, a job queue, resumability, concurrency handling, and decent UX.
Nothing below has been built yet — this is the plan, not a status report.

## Goals (recap, unchanged from earlier planning)

1. Flatten large areas via chat command, block-by-block, survival-legit
   (no `/fill`).
2. Build `.schem` and `.litematic` schematics, block-by-block, survival-legit.
3. Any whitelisted player can trigger jobs via in-game chat.
4. Jobs must be queueable, resumable across crashes/disconnects, and the
   bot must handle concurrent requests sanely (not silently drop or
   corrupt state).
5. Decent UX: players should always know what's happening, what's queued,
   what failed and why, without digging through server logs.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js (LTS, 20+) | matches existing spike |
| Protocol/bot | `mineflayer` | already in use, keep at latest for 1.21.11 support |
| Movement | `mineflayer-pathfinder` | already in use |
| Schematic parsing | `prismarine-schematic` (official, PrismarineJS) | handles `.schem` (Sponge/MCEdit format) reliably; this is the trustworthy fallback if the builder library below doesn't pan out |
| Schematic building (evaluate first, don't commit blindly) | `mineflayer-schem` (community fork, claims `.schem`/`.litematic`/NBT support, chest retrieval, progress events) | **Needs a standalone spike before adopting.** The official `PrismarineJS/mineflayer-builder` (which this forked from) explicitly states in its own README that it is "work in progress, not a usable package yet" — the fork claims full production features anyway. This mismatch means the fork's claims are unverified, not confirmed-good. Spike it in isolation first (see Phase 0 below). If it's solid, use it and save a lot of build-logic work. If it's flaky/abandoned/buggy, fall back to `prismarine-schematic` for parsing + hand-rolled placement/pathing logic (which we were going to need to write anyway, so this isn't wasted effort either way). |
| Persistence (job queue, progress, resumability) | SQLite via `better-sqlite3` | simple, file-based, no external DB server to run/maintain, fine for single-process job state |
| Job queue / concurrency control | Hand-rolled, in-process (see Architecture below) | no need for Redis/BullMQ-style infra for a single-bot single-process tool; would be overkill |
| Config | `.env` file via `dotenv`, or a `config.json` | credentials, whitelist, server address — keep out of source control |
| Logging | `pino` (or keep `console.log`, upgrade only if the noise becomes unmanageable) | structured logs help later; not critical to start |

## Architecture

### Core principle: decouple "what to do" from "how the bot does it"

Everything the bot does — flatten a region, build a schematic — should
reduce to the same underlying primitive: **a job is an ordered list of
block actions** (`{action: 'break'|'place', pos: {x,y,z}, blockType?}`).
This means:

- Flatten and schematic-build share the same execution engine (walk to
  position, perform action, mark complete, persist progress).
- Resumability, progress reporting, and pause/cancel logic only need to be
  built once, against this shared primitive — not duplicated per feature.
- If `mineflayer-schem` pans out for schematic building specifically, its
  output can still be adapted into this same job/action model rather than
  becoming a separate, differently-shaped code path.

### Components

```
┌─────────────────┐
│  Chat Command    │  parses "!bot flatten ...", "!bot build ...",
│  Parser          │  "!bot queue", "!bot cancel <id>", etc.
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Permission /     │  whitelist check, tiered permissions
│  Auth Layer       │  (e.g. only job owner or admin can cancel)
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Job Manager      │  owns the queue, one active job at a time (v1),
│                   │  persists job state to SQLite, exposes
│                   │  enqueue/cancel/status
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Job Compilers    │  turn a request into an ordered action list:
│  - Flatten        │    - flatten: scan region, compute break+fill actions
│  - Schematic       │    - schematic: parse file, compute placement order
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Execution Engine │  walks the action list, does pathfinder.goto +
│                   │  bot.dig/placeBlock per action, persists a
│                   │  "last completed index" checkpoint after each
│                   │  action (or every N actions, batched for perf)
└────────┬─────────┘
         │
┌────────▼─────────┐
│  Progress /       │  chat updates at intervals, `!bot status`,
│  UX Reporter       │  error reporting with specific failed positions
└──────────────────┘
```

### Data model (SQLite)

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,              -- 'flatten' | 'schematic'
  requested_by TEXT NOT NULL,      -- in-game username
  status TEXT NOT NULL,            -- 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  params_json TEXT NOT NULL,       -- original command params, for resuming/logging
  total_actions INTEGER,
  completed_actions INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE job_actions (
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  seq INTEGER NOT NULL,            -- order within the job
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

Storing the full action list up front (rather than computing it lazily)
is what makes resumability simple: after a crash, restart, load the job's
`job_actions` rows where `status = 'pending'`, and keep going from there.
It also gives you `!bot status` and material-requirement previews for free
(count `place` actions grouped by `block_type` before starting = "you need
340 cobblestone, 12 oak planks...").

### Concurrency model (v1 — keep it simple)

- **One active job at a time.** A single bot instance can only physically
  be in one place doing one thing — trying to parallelize within one bot
  is not worth the complexity right now.
- New requests while a job is running go into a **queue**, FIFO, visible
  via `!bot queue`.
- `!bot cancel <id>` — job owner or an admin-tier user can cancel; others
  cannot cancel someone else's job (this is the one permission tier worth
  having from day one).
- If multi-bot concurrency becomes a real want later (multiple bot
  accounts working different jobs simultaneously), that's a bigger
  redesign — don't build for it prematurely, note it as a possible future
  direction only.

### Resumability

- On every completed action, mark it `done` in `job_actions` (or batch
  every N actions if per-action SQLite writes prove too slow — measure
  before optimizing).
- On bot startup, check for any job with status `running` (meaning it was
  interrupted mid-execution, not cleanly finished/cancelled) and offer to
  resume it automatically or prompt an admin — decide this UX detail
  during Phase 3 below, not before.

### UX principles

- Every command gets an immediate chat acknowledgment (even just "Queued,
  position 2 in line") — never leave a player wondering if their command
  registered.
- Long jobs report progress at a reasonable interval (e.g. every 5% or
  every 10 seconds, whichever is less spammy) — not every single block.
- Errors report the *specific* failed position and reason
  ("Couldn't place at 120,64,88: no cobblestone in inventory"), not a
  generic failure.
- `!bot status` should always answer: what's running, % complete, what's
  queued, who requested it.
- Before starting a schematic build, report a materials summary and let
  the requester confirm, rather than starting and discovering a shortfall
  half-built in.

## Task breakdown (build in this order)

### Phase 0 — De-risk the schematic builder library (do this before anything else in this list)
- Standalone test script: load a small `.schem` and a small `.litematic`
  test file with `mineflayer-schem`, point it at the existing test server,
  and see if it actually builds correctly, handles chest retrieval as
  claimed, and doesn't crash on directional blocks (stairs/slabs are the
  usual pain point).
- Decision point: adopt `mineflayer-schem`, or fall back to
  `prismarine-schematic` (parsing only) + hand-rolled build logic.
- Don't proceed to Phase 4 (schematic building) until this is resolved —
  but Phases 1–3 don't depend on this decision, so they can proceed in
  parallel/first.

### Phase 1 — Job data layer
- Set up `better-sqlite3`, create the schema above.
- Job Manager module: `enqueue(job)`, `cancel(jobId, requestedBy)`,
  `getStatus()`, `getQueue()`.
- Unit-testable in isolation, no mineflayer dependency yet.

### Phase 2 — Flatten as the first job compiler + execution engine
- Rewrite the existing naive flatten into: (a) a compiler that scans the
  region and produces the full break+fill action list up front (including
  the fill logic that was deferred in the spike — decide fill source:
  bot's own inventory from breaking, a designated filler block, or a
  chest), (b) hand that action list to the Job Manager instead of
  executing inline.
- Build the Execution Engine as a generic action-list runner (not
  flatten-specific) — this is the piece that will be reused unchanged for
  schematics later.
- Get resumability working end-to-end here first, since flatten is
  simpler to test than schematic building.

### Phase 3 — Job UX layer
- `!bot queue`, `!bot status`, `!bot cancel <id>` commands.
- Progress reporting at intervals.
- Permission tier: job owner + admin can cancel, others cannot.
- Startup check for interrupted `running` jobs.

### Phase 4 — Schematic building (after Phase 0's decision is made)
- Job compiler that parses a `.schem`/`.litematic` file into the same
  action-list format used by flatten.
- Build order logic: bottom-to-top at minimum; refine further only if
  testing shows it's needed (e.g. bot getting stuck standing where it
  needs to place next).
- Materials preview before starting ("this needs X cobblestone, Y oak
  planks..."), sourced from counting `place` actions by block type.
- Wire into the same Job Manager / Execution Engine from Phases 1–2 — this
  phase should mostly be "write a new compiler," not "write a new engine."

### Phase 5 — Polish / hardening
- Handle edge cases: what if a required block type isn't available
  mid-build (pause vs. skip vs. abort — decide based on testing, this is
  a UX judgment call, not a technical one)।
- Reconnect-mid-job behavior: confirm a job correctly pauses and resumes
  across a bot disconnect/reconnect (this exercises the resumability work
  from Phase 2/3 against the real, less controllable failure mode of a
  dropped connection, not just a manual restart).
- Load-test flatten/build on a genuinely large area/schematic to find
  real-world pacing issues (SQLite write frequency, pathfinding thrash,
  etc.) before considering this "done."

## Open decisions to make during implementation, not before

- Exact fill-source strategy for flatten (own inventory vs. designated
  block vs. chest) — Phase 2.
- `mineflayer-schem` vs. hand-rolled — Phase 0.
- Build order refinement beyond bottom-to-top — Phase 4, only if testing
  shows the naive order causes real problems.
- Interrupted-job resume UX (auto-resume vs. prompt) — Phase 3.

These are flagged as "decide later" on purpose — they depend on how
earlier phases actually behave in testing, not on upfront theorizing.
