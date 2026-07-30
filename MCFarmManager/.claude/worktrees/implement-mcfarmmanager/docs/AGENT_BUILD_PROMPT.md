# Implementation prompt: MCFarmManager

Paste this into a fresh agent session to build this project. Written as a standalone brief —
it doesn't assume the executor has any conversation history about how this design came
about, only this repo's own docs.

---

## Task

Build **MCFarmManager**: a read-only farm-observability tool for a Carpet-enabled Fabric
Minecraft server (1.21.11). A server-side Fabric mod, built as a Carpet Extension, embeds an
HTTP+JSON API and serves a small static dashboard on the same port. No separate backend, no
database server — the mod is the whole backend, with an embedded SQLite file for farm
history only.

## Read first, in order

1. `docs/SPEC.md` in this repo — the canonical architecture, protocol, data model, and
   config schema. **Do not redesign it.** If something in it turns out to be wrong or
   underspecified once you're actually building it, say so and propose the specific change
   rather than silently deviating.
2. This document, in full, before starting Phase 0.

## Non-negotiable constraints (repeated here because they're easy to erode one line at a
time during a multi-phase build — re-read before every commit)

- **Read-only, full stop.** No block breaking/placing, no item movement/use, no attacking,
  no crafting, no trading, no container-slot writes. Container reads happen by reading
  `BlockEntity` inventory slots directly — never simulate opening a screen, never send any
  interaction packet. If a feature you're about to add can't be phrased as "read a value,"
  stop and ask before writing it.
- **Config-driven.** No hardcoded farm names, coordinates, dimensions, or storage positions
  — all of it comes from `config/mcfarmmanager/farms.json` (schema in `SPEC.md`).
  Mod-level toggles (port, sample interval, retention) are Carpet rules, not a second config
  file.
- **One process, one artifact.** The mod embeds the HTTP server and serves the dashboard's
  static files itself. Don't introduce a second server process, don't add a build step to
  the dashboard, don't add a JS framework or bundler — plain HTML/CSS/vanilla JS, no CDN
  dependency (the mod serves it locally; nothing should reach out to the internet at
  runtime).
- **No new dependencies beyond what `SPEC.md` names.** JDK's own `com.sun.net.httpserver`
  for HTTP, `org.xerial:sqlite-jdbc` for history, Gson (already a transitive Fabric
  dependency) for JSON, Fabric API, fabric-carpet. Nothing else without stopping to ask —
  that's a scope decision, not an implementation detail.

## Phased plan — one phase at a time, per this workflow

Explain your plan for each phase before writing code, implement it, explain the resulting
decisions, note follow-ups, then move to the next phase. Don't jump ahead. Verify each phase
before starting the next — most phases have an explicit manual verification step since there
is no practical way to run a full Minecraft server inside an automated test suite for
in-world checks.

### Phase 0 — Repo scaffold + mod skeleton

Set up the repo layout:

```
MCFarmManager/
  mod/
    build.gradle
    gradle.properties
    settings.gradle
    src/main/java/...
    src/main/resources/fabric.mod.json
    src/test/java/...
  dashboard/
  config/
    farms.example.json
  docs/          (already has SPEC.md and this file)
  README.md
  .gitignore
```

Generate the Gradle project skeleton from **fabricmc.net/develop/template** (Minecraft
`1.21.11`, include Fabric API) rather than hand-writing `build.gradle` — see `SPEC.md`'s
"Build conventions" section for the exact known-good plugin id and mappings setup, and use
them; don't rediscover them by trial and error.

**Determine and pin the correct `fabric-carpet` version for Minecraft 1.21.11.** Check
Carpet's releases (GitHub `gnembon/fabric-carpet` or Modrinth) for the build targeting this
exact Minecraft version — do not guess a version number. Add it as a `modImplementation`
dependency.

**Confirm the Carpet Extension API surface before writing against it.** The `CarpetExtension`
interface and its registration entrypoint (historically a `"carpet:carpet_extension"` key in
`fabric.mod.json`, but confirm this against the actual dependency jar/source for the version
you pinned — it has changed across Carpet releases). Extract the actual `fabric-carpet` jar
from the Gradle cache and inspect it directly rather than relying on possibly-stale training
knowledge, same discipline `SPEC.md` calls out for vanilla mapped classes.

Write a minimal extension implementation that does nothing but register one test Carpet rule
(`mcfarmmanagerEnabled`, boolean, default `true`) and log a line on server start. Build it,
install it on a real Carpet-enabled 1.21.11 dev server, and verify:
- The server starts without errors.
- `/carpet mcfarmmanagerEnabled` shows the rule and its default.

Don't proceed to Phase 1 until this is confirmed working on a real server — everything after
this phase builds on the extension registration actually working.

### Phase 1 — Farm config + read-only query layer (no HTTP yet)

Implement:
- `farms.json` loading and validation per `SPEC.md`'s schema — fail loudly (clear log
  message, mod-level disable, not a server crash) on malformed config.
- A `FarmDataProvider` interface (plain Java records for return types, no Minecraft-API
  types leaking through it — this is what Phase 4's unit tests target) with methods to get:
  live entity list for a farm (bounding box query around `anchor` ± `entityScanRadius`,
  scoped to the farm's dimension), live storage contents for a farm (iterate configured
  positions, read `BlockEntity` inventory slots directly, aggregate by item id), chunk-loaded
  state for a farm's anchor position, and whether the farm's configured `fakePlayerName` (if
  any) is currently online (enumerate `server.getPlayerManager()`, filter for Carpet's fake
  player type).
- A concrete implementation of `FarmDataProvider` backed by the real `MinecraftServer` /
  `ServerWorld`.

No HTTP server yet. Verify via a temporary in-game command (`/mcfarmmanager debug <farmId>`,
throwaway, fine to delete once Phase 2's HTTP endpoint supersedes it) that prints the query
results to the log — confirms the read logic actually returns correct data against a real
farm before wiring up a network layer on top of it.

Write unit tests for `farms.json` parsing/validation using a fake `FarmDataProvider` is not
needed here since this phase's tests are about config parsing, not the provider — cover
malformed-config cases (duplicate ids, missing fields, unknown dimension) with plain JUnit
tests against the parser, no Minecraft runtime needed.

### Phase 2 — HTTP API

Embed `com.sun.net.httpserver.HttpServer`, bound to the `mcfarmmanagerHttpBindAddress` /
`mcfarmmanagerHttpPort` Carpet rules, started once the extension's server-loaded lifecycle
hook fires. Implement every endpoint in `SPEC.md`'s "HTTP API" section
(`/farms`, `/farms/{id}`, `/players`, `/world`, `/performance`, `/status`) against the
`FarmDataProvider` from Phase 1 plus the equivalent world/player/performance queries (add
these to `FarmDataProvider` or a sibling interface, your call, but keep the same
"plain-records, no leaking Minecraft types" discipline).

`/performance` reads from Carpet's own tick-timing tracking (`TickSpeed` or equivalent in
the pinned Carpet version — confirm the actual field/method names against the real jar, same
verify-don't-guess discipline as Phase 0). Don't reimplement tick-timing math by hand.

Unit tests: route matching and JSON response shape, using a fake `FarmDataProvider` — no
real server needed for this layer, that's the point of the interface boundary from Phase 1.

Manual verification against a real running dev server: `curl` (or a browser) each endpoint,
confirm the JSON matches `SPEC.md`'s documented shapes exactly, confirm a request for an
unconfigured farm id returns `404` with the documented error body.

### Phase 3 — History (SQLite)

Add `org.xerial:sqlite-jdbc`. Implement:
- Schema creation (per `SPEC.md`) at `<world save dir>/mcfarmmanager/history.sqlite` on
  first start, idempotent (safe to run every startup).
- The tick-counting sampler (`ServerTickEvents.END_SERVER_TICK`), firing every
  `mcfarmmanagerSampleIntervalMinutes * 60 * 20` ticks, calling the *same* entity/storage
  query methods `/farms/{id}` already uses — don't write a second query path.
- Pruning of rows older than `mcfarmmanagerHistoryRetentionDays` after each sample.
- `GET /farms/{id}/history?range=...` per `SPEC.md`.

To verify without waiting real minutes, temporarily override
`mcfarmmanagerSampleIntervalMinutes` to a sub-minute value (a Carpet rule value, not a code
change) on your dev server, confirm rows accumulate in the SQLite file (inspect with any
SQLite CLI/browser) and that `/farms/{id}/history` returns them, then confirm pruning removes
rows older than a (temporarily lowered) retention window. Reset both rules to their real
defaults afterward — don't leave the low interval in `farms.example.json` or as a changed
default anywhere in code.

### Phase 4 — Dashboard

Static site in `dashboard/`, bundled into the mod jar's resources, served by the same
`HttpServer` instance from Phase 2 on `/` and its asset paths (same origin, no CORS
handling). Implement the three views from `SPEC.md`'s "Dashboard" section (Overview, Farm
detail, Server panel) with the specified polling intervals.

History charts: hand-rolled inline SVG line charts (a plain JS function mapping
`{sampledAt, value}` points to an SVG `<polyline>`) — do not add a charting library or a
build step for this. If a specific chart genuinely can't be done reasonably by hand (it
shouldn't need to be — this is simple time-series data), stop and ask before reaching for a
dependency.

Verify by loading the dashboard in a real browser against the real running dev server:
overview cards populate and update, a farm detail page shows entities/storage/history for a
real configured farm, the server panel's numbers move when you check them against what
`/performance` and `/world` actually return.

### Phase 5 — Packaging + README

Write the top-level `README.md`: what this is, requirements (MC 1.21.11, Fabric Loader
version, Fabric API version, pinned Carpet version — all determined in Phase 0), install
steps (mod jar into the server's `mods/` folder, `farms.json` into
`config/mcfarmmanager/`), how to reach the dashboard (`http://<server-host>:<port>/`), and
the same read-only guarantee stated in `SPEC.md`, stated plainly for anyone installing this
who hasn't read the full spec.

## Explicitly out of scope for this build (don't implement, don't stub)

Per `SPEC.md`'s "Out of scope for v1": authentication, alerting, multi-server support,
history for anything other than farms, screenshots. If you find yourself writing code for
any of these, stop — it's scope creep, not a small addition.
