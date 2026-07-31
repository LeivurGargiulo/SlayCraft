# ADR-0001: Manager runtime — Mineflayer vs. Scarpet/Carpet vs. custom Fabric mod

**Status:** Superseded by [ADR-0002](./0002-manager-runtime-mcfarmmanager-fabric-mod.md) (2026-07-30)
**Date:** 2026-07-30
**Deciders:** Lei (project owner)

> **Superseded:** written without reading the actual codebase, the actual server, or two
> implementation attempts already in the workspace. ADR-0002 found the screenshot "hard
> constraint" this ADR's hybrid was built around doesn't currently work regardless of
> runtime (already cut from Mineflayer's `main`), that Scarpet has no existing footprint
> on the server (`world/scripts/` is empty, contrary to this ADR's assumption), that RCON
> isn't configured, and that a third attempt — a self-contained Fabric mod
> (MCFarmManager) — was already 8/12 tasks built and live-verified. See ADR-0002 for the
> full reasoning; kept below for historical context only.

## Context

MFO's `ARCHITECTURE.md` and `TECHNICAL_SPEC.md` currently specify a single "Manager"
runtime: a Node/TypeScript backend that drives a Mineflayer bot. The Manager is
responsible for two very different kinds of work:

1. **Sensing** — reading storage contents, computing production deltas, verifying
   worker (Carpet fake player) state, checking chunk load state, and scanning
   entities.
2. **Presence** — teleporting to a camera waypoint, rotating, and capturing a
   screenshot / driving the live Prismarine Viewer stream.

Both are bundled into one Mineflayer bot today because Mineflayer was the only
runtime under consideration. Two alternatives have since come up:

- **Scarpet**, the scripting layer bundled with Carpet, already running on the
  server (the Carpet fake-player workers depend on it).
- **A custom Fabric mod**, hand-written in Java/Kotlin against the Fabric API.

The non-negotiable constraints from `CLAUDE.md` apply to whichever runtime is
chosen: read-only with respect to gameplay state, configuration-driven, event-driven,
and plugin-friendly monitors.

A relevant technical constraint discovered during this evaluation: **dedicated
Minecraft servers have no rendering pipeline.** Neither Scarpet nor a Fabric mod can
produce a screenshot or a first-person camera frame — that capability only exists in
something that behaves like a real client (which is exactly what Mineflayer +
Prismarine Viewer provides). This rules out a clean "just replace Mineflayer"
outcome for any option and shapes the recommendation below.

## Decision

Adopt a **hybrid runtime**, splitting the current Manager into two collaborating
pieces:

- **Scarpet apps** (running on the server, alongside the existing Carpet workers)
  become the sensing layer: Storage Scanner, Production Engine, Worker Monitor,
  Chunk Monitor, and Entity Scanner move here. Scarpet reads tile-entity NBT and
  entity/chunk state directly, with no teleport or GUI interaction required.
- **A slim Mineflayer bot** is retained, scoped down to camera/screenshot duty only:
  Camera System, Screenshot Engine, and Live Viewer. This is the only piece that
  needs to behave like a real client.
- **The Node/TypeScript backend** (Scheduler, Health Engine, Alert Engine, Metrics,
  Persistence, REST/WebSocket API, Discord adapter, Dashboard) is unchanged from
  `TECHNICAL_SPEC.md`. It becomes the aggregation point for both runtimes instead of
  talking to a single monolithic Mineflayer Manager.
- **RCON is the transport** between Scarpet and the Node backend: the Scheduler
  invokes Scarpet app functions over RCON on a schedule (or on demand for a
  user-triggered scan) and receives structured results back, either as command
  output or via `/data` command-storage NBT that the backend reads immediately
  after.

A **custom Fabric mod is rejected for now** (see Option C below) — not because it's
technically incapable, but because it doesn't clearly outperform Scarpet for this
use case and adds a second compiled-language toolchain to maintain.

This changes `TECHNICAL_SPEC.md` §4 (Runtime Components) and §19 (folder layout,
which would need a `scarpet/` or sibling directory for the server-side apps, likely
outside `src/` since it's not TypeScript). **Nothing should be implemented against
this decision until it's confirmed** — per `CLAUDE.md`, this is exactly the kind of
architecture change that requires sign-off first.

## Options Considered

### Option A: Mineflayer only (status quo)

One Node/TS bot handles sensing and presence.

| Dimension | Assessment |
|---|---|
| Complexity | Low — single runtime, already documented, matches recommended stack |
| Cost | Low — no new language, no RCON bridge |
| Scalability / latency | Weakest — every scan requires a physical teleport + wait-for-chunk-load before reading anything |
| Team familiarity | High — TypeScript throughout |
| Read-only enforceability | Moderate — bot has "physical" friction (must actually be positioned to open a container) which incidentally limits blast radius of a bug |

**Pros:** simplest to reason about; one language; matches docs as written; a bug in
the sensing code can only affect what the bot can physically reach.
**Cons:** slowest sensing path (teleport + chunk-load wait per scan); bot occupies a
player slot/account; storage reads require opening a container instead of a direct
data read; doesn't take advantage of Scarpet already being present on the server.

### Option B: Scarpet/Carpet only

Push everything, including camera duty, into Scarpet.

| Dimension | Assessment |
|---|---|
| Complexity | Low-Med — reuses infrastructure already running for the Carpet workers |
| Cost | Low — no new language, no bot account |
| Scalability / latency | Strongest for sensing — in-process reads, no travel time |
| Team familiarity | Unknown — depends on Lei's Scarpet experience |
| Read-only enforceability | **Weakest** — Scarpet has unrestricted world read/write by default; no physical friction at all, so a one-line bug can mutate the world at scale |

**Pros:** fastest possible sensing; no bot account needed; naturally colocated with
the existing worker infrastructure; entity/chunk/inventory queries are more precise
than anything achievable through a simulated client.
**Cons:** **cannot produce screenshots or drive a live camera view — a hard
technical blocker**, not a workaround-able gap; no native outbound network I/O
(Discord/REST), so it can't stand alone without a bridge; weakest read-only
guarantee of the three options, since nothing stops a script from calling a
block-modifying function.

### Option C: Custom Fabric mod

Hand-rolled server-side mod in Java/Kotlin using the Fabric API (and mixins where
needed), potentially absorbing the entire Manager Core.

| Dimension | Assessment |
|---|---|
| Complexity | **High** — new toolchain, new language, mod-versioning burden tied to Minecraft/Fabric API releases |
| Cost | Medium-High — steeper dev time, more moving parts to keep working across MC updates |
| Scalability / latency | Strongest in theory (compiled, direct object access, can host HTTP/WebSocket in-process — no RCON bridge needed) |
| Team familiarity | Unknown, likely lower than Scarpet or TypeScript |
| Read-only enforceability | Weakest of all — full JVM-level access with no simulated limits, same risk as Scarpet but with less isolation |

**Pros:** best raw performance; type-safe; could eliminate the RCON hop entirely by
exposing HTTP/WebSocket directly from the mod; most future-proof if MFO's scope
grows into things Scarpet genuinely can't express.
**Cons:** still **cannot render a camera frame or screenshot** — a dedicated server
has no GL context regardless of language, so this doesn't solve the presence
problem either; doubles the tech stack (JVM + Node) unless the whole backend is
rewritten in Java/Kotlin, which contradicts the recommended stack in
`TECHNICAL_SPEC.md` §20; highest maintenance burden of the three; overkill for what
Scarpet already does adequately.

### Option D: Hybrid (Scarpet + slim Mineflayer + unchanged Node backend) — recommended

Described in full under **Decision** above.

| Dimension | Assessment |
|---|---|
| Complexity | Medium — two runtimes instead of one, plus an RCON bridge |
| Cost | Medium — Mineflayer bot account still needed, but with a much smaller responsibility surface |
| Scalability / latency | Best available sensing latency, camera path unchanged from today |
| Team familiarity | Mixed — Scarpet is new surface area, TS backend unchanged |
| Read-only enforceability | Sensing scripts need explicit code-review discipline (same risk as Option B, but scoped to a smaller, more scannable set of functions since the bot no longer does any reads) |

**Pros:** takes the real performance/precision win Scarpet offers for sensing
without giving up screenshots/live view; keeps the Node backend, database, API,
Discord adapter, and dashboard untouched; smallest blast radius for the Mineflayer
bot (it never opens a container or reads NBT — only moves a camera).
**Cons:** two runtimes to operate and monitor instead of one; RCON becomes a new
dependency and failure mode; Scarpet apps still carry the weaker read-only guarantee
and need their own review discipline; slightly more surface area in the docs and
folder layout.

## Trade-off Analysis

The deciding factor isn't "which one is fastest" — it's that **screenshots are a
hard constraint that only Mineflayer (or an equivalent real client) can satisfy**,
full stop, regardless of language or runtime. That eliminates any option that tries
to be a single unified runtime (pure Scarpet, pure Fabric mod) unless MFO drops
first-person camera/screenshot functionality entirely and replaces it with a
top-down map renderer (e.g., BlueMap) — which is a legitimate product decision, but
a different one than "which runtime should the Manager use," and out of scope for
this ADR.

Given screenshots stay in scope, the real choice is what handles *sensing*:
Mineflayer (status quo, slow but simple), Scarpet (fast, more precise, weaker
isolation), or a Fabric mod (fastest, but doubles the toolchain for a benefit over
Scarpet that's marginal at MFO's current scale). Scarpet wins that comparison on
cost/benefit: it reuses infrastructure already running on the server, and its
weaker read-only guarantee is a manageable, code-review-level risk rather than a
capability gap.

The custom Fabric mod's strongest argument — eliminating the RCON hop by hosting
HTTP/WebSocket in-process — is a real advantage, but not one that pays for itself
yet. It's worth revisiting if RCON turns out to be a bottleneck or a reliability
problem in practice.

## Consequences

- **Easier:** sensing scans become near-instant (no teleport/chunk-load wait);
  fewer things depend on the Mineflayer bot's physical position; entity/inventory
  reads become exact rather than GUI-simulated.
- **Harder:** operating two runtimes (server-side Scarpet + external Node process)
  instead of one; RCON becomes a dependency with its own failure/retry story that
  the Scheduler needs to handle; code review for Scarpet apps needs to explicitly
  check for accidental world-mutating calls, since nothing else will catch that.
- **To revisit:** whether screenshots/live camera stay in scope at all (map-renderer
  alternative), and whether a custom Fabric mod becomes worthwhile later if RCON
  proves to be a bottleneck or if MFO's needs outgrow what Scarpet expresses well.

## Action Items

1. [ ] Lei confirms or rejects this decision before any implementation starts.
2. [ ] If confirmed, update `ARCHITECTURE.md` §"High-level architecture" and
   `TECHNICAL_SPEC.md` §4 and §19 to reflect the two-runtime split.
3. [ ] Decide where Scarpet app source lives in the repo (likely a top-level
   `scarpet/` directory, sibling to `src/`, since it isn't TypeScript).
4. [ ] Spike the RCON bridge: confirm round-trip latency and payload size limits are
   acceptable for the Scheduler's NORMAL/LOW priority scan cadence.
5. [ ] Define the read-only review checklist for Scarpet apps specifically (no
   `set`, `break_block`, entity-modifying calls, etc.) before the first app is
   merged.
6. [ ] Decide, separately, whether screenshots/live camera stay as first-person
   Mineflayer captures or get replaced by a map renderer — flagged here but not
   resolved by this ADR.
