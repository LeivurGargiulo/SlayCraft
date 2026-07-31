# ADR-0001: Agent runtime — Mineflayer vs. Carpet/Automatone Fabric mod

**Status:** Accepted
**Date:** 2026-07-31
**Deciders:** Lei (project owner)

## Context

An LLM-driven agent is being built to handle flattening and schematic-building
tasks via freeform chat requests (design: `docs/superpowers/specs/2026-07-31-mineflayer-llm-agent-design.md`,
plan: `docs/superpowers/plans/2026-07-31-mineflayer-llm-agent.md`). Two runtime
approaches were on the table, surfaced by reviewing two external reference
projects:

- **mindcraft** (`mindcraft-bots/mindcraft`) — Node.js + Mineflayer, LLM-driven
  tool/action generation, multi-agent.
- **SecondBrain** (`sailex428/SecondBrain`) — a Fabric server mod (Java/Kotlin),
  built on **fabric-carpet** and **Automatone** for in-process, tick-level
  control of player-like NPCs, LLM-driven chat-reactive behavior.

This repo already carries direct experience with both families:

- `mineflayer/mineflayer-test/` is a **working, hardened Mineflayer bot** — a
  chat-command-driven, SQLite-backed job queue with crash-resume, whitelist/admin
  gating, and a flatten compiler/execution-engine split. It shipped through 5 real
  bug fixes found via live-server testing this branch (pathfinder hangs, fill-stock
  gating, tool-equip fallback, block-placement positioning, progress mirroring) and
  has passing unit tests for every non-network component.
- `mineflayer/archive/Bresenham` and `mineflayer/archive/BaritoneCustomBot` are
  **two prior Fabric-mod attempts, both archived/abandoned** before reaching the
  Mineflayer bot's level of maturity. Bresenham is a Fabric mod (Java 21, MC
  1.21.4) that ran an autonomous bot *on a player entity*, with Carpet listed only
  as an optional soft dependency for debugging — it did not use Carpet or
  Automatone for NPC control the way SecondBrain does.

The immediate task (flatten + schematic building, LLM tool-calling, Gemini +
OpenRouter) does not require anything a Fabric mod uniquely provides — no
render/screenshot need (unlike the unrelated MFO Manager decision in
`_archive/MFO/docs/adr/0001-*`), no requirement to avoid a bot player slot, no
tick-level precision beyond what pathfinder-driven block break/place already
achieves for a queued job.

## Decision

Build the LLM agent on **Mineflayer**, as a new sibling project
(`mineflayer/mineflayer-agent/`) to the existing flatten bot, reusing its proven
architecture (SQLite job queue, crash-resume, deterministic compile-then-execute
pipeline, chat-command whitelist/admin gating) with an LLM planning stage inserted
ahead of job compilation. A Carpet/Automatone Fabric mod is **rejected for this
work** — see Option B below.

## Options Considered

### Option A: Mineflayer (mindcraft-style) — chosen

Node.js process connecting to the server as a normal network client, LLM picks a
tool once per job, deterministic compiler expands to actions, existing
pathfinder-driven execution engine runs them.

| Dimension | Assessment |
|---|---|
| Complexity | Low — extends an already-working pattern; no new language or toolchain |
| Cost | Low — reuses `better-sqlite3`, `mineflayer-pathfinder`, and every lesson already paid for in the existing bot's 5 hardening fixes |
| Scalability / latency | Adequate — job-queued, not real-time; network-client movement is already the bot's proven bottleneck and known-quantity |
| Team familiarity | High — this is the stack the working bot is already built and tested in |
| Server footprint | None — no mod install on the server or any client; connects like any other player |
| Distribution | Trivial — `npm install && node index.js`, no MC-version-locked mod build |

**Pros:** directly reuses proven, tested infrastructure (job queue, crash-resume,
whitelist gating, pathfinder timeout/placement fixes already hardened out);
same language/runtime as the rest of this project's active tooling; no server-side
install or MC-version coupling; fastest path to a working agent given the existing
codebase.
**Cons:** occupies a bot player slot/account; block-by-block execution is bounded
by pathfinder movement speed and network round-trips, slower than in-process
world edits; no tick-level access to world state (reads go through the same
`bot.blockAt`/inventory APIs the existing bot already uses successfully).

### Option B: Carpet/Automatone Fabric mod (SecondBrain-style)

Server-side Fabric mod, Java/Kotlin, NPCs driven in-process via fabric-carpet +
Automatone, LLM backend (Ollama/OpenAI/Player2-style) drives chat-reactive
behavior.

| Dimension | Assessment |
|---|---|
| Complexity | **High** — new toolchain (JVM/Gradle/Fabric API/mixins), new language, MC/Fabric-version coupling on every server update |
| Cost | High — this repo has already spent two prior attempts (Bresenham, BaritoneCustomBot) in this exact space without reaching the Mineflayer bot's maturity level |
| Scalability / latency | Strongest in theory — in-process reads/writes, no network round-trip per action |
| Team familiarity | Low — no working precedent in this repo; both prior Fabric attempts were archived before completion |
| Server footprint | Requires installing the mod (and Carpet, and Automatone) server-side — a shared dependency every future change must keep compatible |
| Distribution | Mod-versioning burden tied to Minecraft/Fabric API releases, same class of maintenance cost flagged in `_archive/MFO/docs/adr/0001-*` for the unrelated Fabric-mod option there |

**Pros:** best raw performance/precision ceiling; no bot account/player-slot
needed; NPCs can act instantly without simulated movement; Automatone specifically
targets this problem (fake-player-driven task NPCs), so less would be built from
scratch than a fully custom mod.
**Cons:** doubles the tech stack (JVM + Node) for no capability this task
actually needs; reintroduces exactly the toolchain this project already tried and
shelved twice; server-side install requirement adds an operational dependency
(Carpet + Automatone + this mod, all version-matched to the server's Fabric
loader) that a plain network client sidesteps entirely; no reusable code from the
existing hardened Mineflayer bot — would start from zero on job queueing,
crash-resume, and every pathfinding/placement edge case already fixed there.

## Trade-off Analysis

The deciding factor is **sunk, working infrastructure vs. a clean-sheet rewrite in
an unproven toolchain**. Option B's theoretical performance edge (in-process
world access, no network round-trip) is real, but it doesn't offset restarting
from zero on a mod/Carpet/Automatone stack this repo has already tried and
abandoned twice (Bresenham, BaritoneCustomBot) without shipping — while the
Mineflayer stack has a bot in production-adjacent shape today, hardened through
real live-server bugs. The task at hand (queued flatten/schematic jobs, not
real-time reactive NPC behavior) doesn't need Option B's latency advantage: a job
queue already tolerates block-by-block execution time by design.

Option B remains the right call if the project's needs shift toward real-time,
reactive, in-world NPC behavior (chat-triggered instant responses, many
concurrent agents, tick-precise coordination) where network-client movement
latency becomes a hard blocker rather than an accepted cost of a queued job model.
That's not the current requirement.

## Consequences

- **Easier:** new agent work starts from a proven job-queue/execution-engine
  pattern instead of a blank Fabric-mod slate; no new server-side install or
  MC-version coupling; one language (JavaScript) across both the existing flatten
  bot and the new agent.
- **Harder:** block placement/breaking stays bounded by pathfinder movement and
  network round-trips — large builds take real wall-clock time proportional to
  action count, same constraint the existing flatten bot already lives with.
- **To revisit:** if the agent's scope grows to needing real-time reactive NPC
  behavior or many concurrent agents where Mineflayer's per-action movement cost
  becomes the bottleneck, Automatone specifically (not a from-scratch mod) is the
  narrower option worth re-evaluating first, since it directly targets fake-player
  task NPCs rather than requiring a hand-rolled mod.

## Action Items

1. [x] Lei confirmed the LLM-agent direction and scope (flatten + schematic
   building) during brainstorming — see the linked design spec.
2. [ ] Proceed with `docs/superpowers/plans/2026-07-31-mineflayer-llm-agent.md`
   (12-task TDD implementation plan) under the Option A decision recorded here.
3. [ ] If Option B is ever revisited, start from Automatone's existing
   fake-player task-NPC primitives rather than a hand-rolled mod — it is the
   closest existing building block to what SecondBrain used.
