# MCFarmManager

Read-only observability tool for Minecraft Fabric survival farms (Carpet-enabled servers,
MC 1.21.11). A server-side mod (built as a Carpet Extension) exposes farm/world/server state
over a local HTTP+JSON API and serves a small static dashboard on the same port — one
process, no separate backend or database server.

**Status:** implemented and live-verified against the real server (`servers/fabric`), tasks
1–9 of the original 12-task build plan (`docs/superpowers/plans/2026-07-29-mcfarmmanager-implementation.md`)
done. Tasks 10–11 (the mod's own dashboard) are **superseded, not pending** — see below. Task 12
(formal packaging/versioned release) is the only remaining item.

- [`docs/SPEC.md`](docs/SPEC.md) — architecture, protocol, data model, config schema.
- [`docs/AGENT_BUILD_PROMPT.md`](docs/AGENT_BUILD_PROMPT.md) — phased brief for building it.
- [`mod/`](mod/) — the Gradle project. `cd mod && ./gradlew build` produces
  `mod/build/libs/mcfarmmanager-1.0.0.jar` (23/23 unit tests passing).

Read `SPEC.md` first.

## What's built and live-verified

Booted against the real `servers/fabric` server (66-mod pack, MC 1.21.11, Fabric Loader
0.19.3, fabric-carpet 1.21.11-1.4.194+v251223) with a throwaway farm config:

- Carpet Extension registration (`MCFarmManagerExtension`), Carpet rules
  (`mcfarmmanagerEnabled`, `mcfarmmanagerHttpPort`, `mcfarmmanagerHttpBindAddress`,
  `mcfarmmanagerSampleIntervalMinutes`, `mcfarmmanagerHistoryRetentionDays`) — registered under
  their own `/mcfarmmanager <rule> [value]` command, **not** `/carpet <rule>` (Carpet only
  auto-registers commands for its own built-in settings manager; each extension has to register
  its own via `registerCommands(dispatcher, context)` — see fix note below).
- `farms.json` loading/validation.
- All HTTP endpoints (`/farms`, `/farms/{id}`, `/farms/{id}/history`, `/players`, `/world`,
  `/performance`, `/status`), including the documented 404 shape for an unknown farm id.
- SQLite history sampling and the `/history` endpoint, confirmed accumulating real rows under
  an accelerated sample interval; pruning runs every cycle without error (also unit-tested,
  `SqliteHistoryStoreTest`).

## Bug found and fixed this session

`MCFarmManagerExtension` originally called `SETTINGS.parseSettingsClass(Settings.class)` from
`onGameStarted()`, per `CarpetExtension`'s documented lifecycle hook. Live-verified this never
actually ran: `CarpetServer.onGameStarted()` only invokes it on extensions already in its static
list at the moment *it* fires, and on this Carpet build that firing happens before this mod's own
Fabric `ModInitializer` runs `CarpetServer.manageExtension(...)` — so the hook never reached this
extension at all. Fixed by parsing the rules eagerly, right after `manageExtension(...)`, instead
of waiting on the callback.

That alone wasn't sufficient: `parseSettingsClass` only populates the `SettingsManager`'s internal
rule map, it doesn't wire the Brigadier command tree. `CarpetServer.registerCarpetCommands` only
auto-registers commands for Carpet's own built-in settings manager — each extension has to
implement `registerCommands(dispatcher, context)` itself and forward to
`SETTINGS.registerCommand(dispatcher, context)`. `MCFarmManagerExtension` didn't override this, so
none of the five rules were ever reachable by command, even though their hardcoded field defaults
still worked (the HTTP server booted fine on `8642`/`0.0.0.0` regardless). Fixed by adding the
override. Confirmed live: rules now show and set correctly via `/mcfarmmanager <rule> [value]`.

## Tasks 10–11 (mod's own dashboard): superseded, not incomplete

Per this repo's consolidation decision (see `MFO/docs/adr/0002-manager-runtime-mcfarmmanager-fabric-mod.md`),
the standalone coordination dashboard being built elsewhere in this repo absorbs this role —
it proxies MCFarmManager's HTTP API internally rather than this mod serving its own UI.
`docs/SPEC.md`'s "Dashboard" section and `docs/AGENT_BUILD_PROMPT.md`'s Phase 4 describe a
dashboard that will not be built here.

## Network exposure

MCFarmManager's HTTP API has no authentication by design (LAN-trust model, see `SPEC.md`'s
Security posture section) and must **never** be exposed directly to the internet. Only the
coordination dashboard's own container/process should reach it, over an internal network.
