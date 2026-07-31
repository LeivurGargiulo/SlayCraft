# ADR-0002: Agent runtime — reopen for real-time/realism priority, spike Automatone before committing

**Status:** Resolved — spike failed, ADR-0001 reaffirmed (2026-07-31)
**Date:** 2026-07-31
**Deciders:** Lei (project owner)
**Supersedes:** [ADR-0001](./0001-agent-runtime-mineflayer-vs-carpet-fabric-mod.md) (temporarily — see Spike Results, ADR-0001 reinstated)

## Context

ADR-0001 chose Mineflayer over a Carpet/Automatone Fabric mod (Option B), primarily on
the grounds that this repo had already sunk two abandoned Fabric-mod attempts
(`mineflayer/archive/Bresenham`, `mineflayer/archive/BaritoneCustomBot`) without reaching
production maturity, while the Mineflayer flatten bot was hardened and working.

Two things changed after that ADR was written:

1. **Requirement clarified:** the agent needs to behave "as realistically/fast/real-time
   as possible" — not just complete jobs correctly on a queue. This directly engages the
   trade-off ADR-0001's Trade-off Analysis already flagged as the condition for revisiting
   Option B: *"if the agent's scope grows to needing real-time reactive NPC behavior... where
   Mineflayer's per-action movement cost becomes the bottleneck."*
2. **MCFarmManager checked directly**, not recalled from memory. It's real, live-verified
   evidence of this team shipping a working Fabric+Carpet mod against *this exact server*
   (MC 1.21.11, Fabric loader 0.19.3, fabric-carpet 1.21.11-1.4.194+v251223 — confirmed via
   `MCFarmManager/mod/gradle.properties`): Carpet Extension registration, custom Carpet
   rules, an embedded HTTP server, 23/23 unit tests, booted against `servers/fabric`. This
   materially undercuts ADR-0001's "low team familiarity / high toolchain cost" argument
   against Option B — the Gradle/Fabric/Carpet-Extension toolchain itself is now a proven
   quantity here, unlike when Bresenham/BaritoneCustomBot were abandoned.

That evidence is **partial**, though. MCFarmManager's own spec is explicit that it "never
breaks or places blocks, moves or uses items... every capability in this spec is a read."
It has zero code path touching entity control, fake players, or Automatone. So it de-risks
*building and shipping a Fabric+Carpet mod against this server* — it says nothing about
the actually hard, unverified part of Option B: driving an entity through Automatone to
break/place blocks convincingly and fast.

A direct check of the Automatone repo (`Ladysnake/Automatone`) surfaced two open
questions neither ADR-0001 nor this context resolves on its own:

- Automatone attaches its `IBaritone` pathfinding/interaction API to **custom entities**
  via Cardinal Components, and explicitly **cannot control real players**. Whether it
  integrates with Carpet's fake-player entities (`EntityPlayerMPFake`, the mechanism
  SecondBrain and this server's existing Carpet workers use) or requires a separate custom
  entity type is unconfirmed from documentation alone.
- The version/branch information surfaced for Automatone referenced Minecraft 1.17.
  Compatibility with this server's actual target (1.21.11 / Fabric loader 0.19.3) is
  **unverified** — this is the single highest-risk unknown blocking a real decision either
  way, and needs a direct check against the mod's actual release list, not a webpage
  summary.

Committing the full 12-task LLM-agent implementation plan
(`docs/superpowers/plans/2026-07-31-mineflayer-llm-agent.md`) to either runtime without
resolving these unknowns risks repeating Bresenham/BaritoneCustomBot's outcome: real
implementation effort spent before the runtime's actual feasibility for this use case was
confirmed.

## Decision

Run a **timeboxed spike** to resolve the two unknowns above before recommitting the agent
build to either runtime. Do not proceed with the full 12-task Mineflayer plan and do not
start the full Automatone-based agent build until the spike reports back.

The spike is scoped to answer exactly one question: **can Automatone drive a
Carpet-fake-player-class entity through one real break-then-place cycle on this server's
actual version stack, and does it deliver a meaningful realism/speed win over the existing
Mineflayer bot's pathfinder-driven approach?** Nothing beyond that — no LLM integration, no
job queue, no chat commands. It reuses MCFarmManager's Gradle/Fabric project layout as a
starting template (proven to build and load against this server already) rather than
starting from Bresenham's or BaritoneCustomBot's archived, stale setups.

### Spike scope

**Timebox: 2 working days.** If the spike is not conclusively answered (pass or fail) by
then, stop, write up what's known, and default back to ADR-0001's Option A (Mineflayer)
rather than let the spike run unbounded — this is the same trap that produced two prior
abandoned Fabric attempts.

**Steps:**

1. **Version compatibility check (must pass before anything else).** Check Automatone's
   actual release/branch list (not a stale webpage summary) for a build compatible with MC
   1.21.11 + Fabric loader 0.19.3. If none exists and porting/building it from source against
   this version is itself a multi-day undertaking, **stop here** — that alone is a fail
   result, write it up, done. Don't spend the rest of the timebox on a mod that can't run on
   the target server.
2. **Minimal mod scaffold.** New Gradle project (`mineflayer/archive/` sibling or a new
   top-level spike directory — not under `mineflayer/mineflayer-agent/`, since this is
   explicitly not committing to that plan yet), templated off `MCFarmManager/mod`'s
   `build.gradle`/`gradle.properties` structure, with Automatone added as a dependency.
3. **Spawn + attach.** Spawn a Carpet fake player (or confirm Automatone requires a
   different custom entity type — this answers the fake-player-integration question from
   Context) and attach Automatone's `IBaritone` component to it.
4. **One break-then-place cycle.** Command the entity to path to a known block, break it,
   then place a block from a fixed inventory slot at a known coordinate. This is
   deliberately the same primitive operation the Mineflayer bot's `executionEngine.js`
   already does — so timing and behavior are directly comparable.
5. **Measure and observe, against the existing Mineflayer bot as baseline:**
   - Wall-clock time for the break-then-place cycle (Automatone vs. the existing bot's
     `_gotoWithTimeout` + `dig` + `placeBlock` path).
   - Whether the entity is visible to another connected client and reads as a real player
     moving/acting (the realism criterion) — not just a teleport-and-edit.
   - Whether Automatone's own pathfinding survives the same awkward-terrain cases that
     required `executionEngine.js`'s pathfind-timeout fix (see the "Post-plan: manual
     hardening" history baked into that file's comments) — a fast happy path that hangs on
     real terrain isn't a win.
6. **Write up results** as a short addendum to this ADR (append a "Spike Results" section
   below) with a clear pass/fail against the question this spike exists to answer, and
   either: (a) greenlight Option B and open ADR-0003 scoping the real Automatone-agent plan,
   or (b) confirm ADR-0001's Option A stands and resume executing
   `docs/superpowers/plans/2026-07-31-mineflayer-llm-agent.md` as already written.

**Explicit non-goals for the spike:** no LLM integration, no job queue/persistence, no
chat commands, no schematic loading, no multi-block job. One entity, one break, one place.
Anything more is scope creep that defeats the point of timeboxing.

## Consequences

- **Easier:** the real decision between Option A and Option B gets made on measured
  evidence (actual latency, actual visual realism, actual version compatibility) instead of
  a second round of ADR trade-off tables built on assumptions.
- **Harder:** the 12-task Mineflayer implementation plan is paused, not cancelled, pending
  spike results — a 2-day delay before any agent implementation resumes either direction.
- **To revisit:** if the spike passes, the existing implementation plan
  (`docs/superpowers/plans/2026-07-31-mineflayer-llm-agent.md`) needs a from-scratch
  replacement scoped to the Automatone runtime — none of its Mineflayer-specific tasks
  (pathfinder timeout handling, `bot.blockAt`, `mineflayer-pathfinder` goals) carry over
  directly, though the job-queue/LLM-planner/tool-registry architecture above the runtime
  layer likely does.

## Action Items

1. [x] Check Automatone's actual releases/branches for MC 1.21.11 / Fabric loader 0.19.3
   compatibility. Stop and report fail if none exists (Step 1 above). **FAILED — see Spike
   Results.**
2. [ ] ~~Scaffold the spike mod from MCFarmManager's Gradle template.~~ Not reached — Step 1
   gate failed.
3. [ ] ~~Spawn a Carpet fake player, attach Automatone, confirm the integration point.~~ Not
   reached.
4. [ ] ~~Run one break-then-place cycle, measure latency, observe realism from a second
   client.~~ Not reached.
5. [x] Appended "Spike Results" section to this ADR with pass/fail and the next action:
   resume Mineflayer plan (Option A stands).
6. [x] Timebox not needed — Step 1 gate failed same day, well within 2-day timebox.

## Spike Results

**Date:** 2026-07-31
**Verdict: FAIL at Step 1 (version compatibility gate).** Spike stopped before scaffolding — steps 2-6 not run.

### Step 1 findings

Checked `Ladysnake/Automatone` directly via `gh api` (releases, branches, repo metadata), not a cached/webpage summary:

- **Releases:** newest is `v0.11.0`, published 2024-01-21. No release newer than that exists.
- **Branches:** `1.17`, `1.18`, `1.19`, `1.19.2`, `1.20`, `dev`, `feature/swimming`, `main`. No `1.21` branch of any kind.
- **Repo activity:** `pushed_at: 2024-01-21T21:29:59Z`, not archived but dormant for ~2.5 years as of this spike.
- **Target stack** (confirmed via `MCFarmManager/mod/gradle.properties`): `minecraft_version=1.21.11`, `loader_version=0.19.3`.

Newest available Automatone code targets MC 1.20 — three-plus major Minecraft versions behind the 1.21.11 target, spanning the entire 1.21.x mapping-churn era (Yarn mappings, Fabric API, and Cardinal Components API all shifted substantially across 1.20 → 1.21.11). Porting Automatone from its 1.20 branch to 1.21.11 is not a same-day rebuild against a stable API — it requires re-deriving mappings, updating the Fabric API surface, verifying Cardinal Components compatibility, and revalidating its Baritone-fork internals, none of which can be scoped or attempted within the spike's 2-day timebox. Per the spike's own Step 1 rule ("if none exists and porting/building it from source against this version is itself a multi-day undertaking, stop here"), this is a hard fail.

### Outcome

**Confirm ADR-0001's Option A stands.** Resume `docs/superpowers/plans/2026-07-31-mineflayer-llm-agent.md` as already written — no changes needed there. Do not open ADR-0003; Option B (Automatone) is not viable against this server's actual version stack without an out-of-scope porting effort.
