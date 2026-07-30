# Fabric Bridge Client — Protocol Design (Proposal)

**Status:** proposal, not implemented, not adopted into `docs/ARCHITECTURE.md` or
`docs/TECHNICAL_SPEC.md`. This document exists so the design can be reviewed before any
code is written. Nothing here changes MFO's current behavior.

## Why

The Manager currently connects via [mineflayer](https://github.com/PrismarineJS/mineflayer),
a protocol-level reimplementation of the Minecraft client embedded directly in MFO's Node
process. That works, but it isn't a real client: it has no Fabric Loader, no mods, and no
rendering. When a server mod registers custom data (as `TravelersBackpack` does with its
`DataComponentType` entries — see `docs/PROGRESS.md`'s connectivity investigation) and
doesn't opt out of Fabric's registry-sync strictness, the server hard-kicks any client that
can't prove it has the matching mods. mineflayer can never prove that, because it isn't
running them. MFO worked around today's instance of this with a server-side compat mod
(`RegistryAttributeHolder`), but that's a per-mod patch that has to be revisited every time
the modpack changes.

Running an actual Fabric client — with the real modpack installed — sidesteps the problem
at its root: it *is* a real client, so registry-sync just passes. It's also a strictly more
robust connection than a hand-rolled protocol client, since it can't be told apart from a
player's client by anything the server does going forward.

## Non-goals (read this before the rest of the document)

This proposal keeps the Manager exactly as read-only as it is today. Specifically excluded:

- **No pathfinding, no Baritone.** The Manager only ever needs to be *at* a position, never
  to *walk* there — every current movement is a server-authoritative `/execute ... tp`
  command (see `TeleportService`), not client-driven motion. Baritone-style navigation
  breaks and places blocks as its core mechanism for routing around obstacles; there is no
  configuration of it that makes that impossible, only unlikely. It has no job here.
- **No player interaction.** No item movement, no block breaking/placing, no attacking, no
  crafting, no trading, no use-item. The bridge protocol below has no command that can
  cause any of these, on purpose — not "not yet implemented," not exposed.
- **No new capability over what mineflayer already does today.** Every command in this
  protocol maps to something `TeleportService`, `CameraService`, `ScreenshotService`, or one
  of the four monitors already does via mineflayer's `Bot`. This is a transport swap, not a
  capability increase. See [Command-to-usage mapping](#command-to-usage-mapping).

If a future need for interaction genuinely arises, that requires a deliberate change to
`docs/ARCHITECTURE.md`'s read-only principle first — a project decision, not a protocol
extension.

## Component overview

```
┌────────────────────────────────┐   TCP, NDJSON    ┌───────────────────────────────────┐
│  MFO (Node.js, unchanged)       │◄────────────────►│  Real Fabric client (JVM process)  │
│                                  │  localhost only   │  — has the actual modpack          │
│  TeleportService                 │                   │                                     │
│  CameraService                    │                   │  MFO Bridge mod (client-side)      │
│  ScreenshotService                 │                   │   - TCP server on 127.0.0.1:PORT   │
│  EntityMonitor / StorageMonitor     │                   │   - reads ClientLevel entities     │
│  WorkerMonitor / ChunkMonitor         │                   │   - opens containers (read-only)   │
│                                  │                   │   - sets client yaw/pitch          │
│  new: FabricBridgeConnection     │                   │   - sends /execute ... tp commands │
│  (integrations/fabric-bridge/)   │                   │   - grabs the real framebuffer     │
└────────────────────────────────┘                   └───────────────────────────────────┘
```

Two new pieces, both out of scope for this document to implement, only to specify:

1. **MFO Bridge mod** — a small client-side Fabric mod (Java) that runs inside the real
   Minecraft client alongside the server's actual modpack. Owns the TCP server and
   translates bridge commands into the same client-API calls a real player's actions would
   trigger.
2. **`FabricBridgeConnection`** — a new MFO-side class in `src/integrations/fabric-bridge/`
   that speaks this protocol and satisfies the same contract `ManagerConnection` does today
   (see [Prerequisite refactor](#prerequisite-refactor-a-manager-client-interface)), so
   `TeleportService`, `CameraService`, `ScreenshotService`, and all four monitors need zero
   changes to work against either transport.

## Process lifecycle

The JVM client is a separate OS process from MFO, unlike mineflayer which lives in-process.
MFO becomes responsible for supervising it:

1. MFO's bootstrap spawns the client process (Java launch command, config-driven — see
   [Configuration](#configuration)), passing the bridge port as a JVM argument
   (`-Dmfo.bridge.port=...`).
2. The bridge mod starts its TCP server as soon as the client's mod-init phase runs — before
   the client has necessarily logged into the Minecraft server. MFO connects to this socket
   and retries with the *same* `computeReconnectDelayMs` exponential backoff
   `manager-connection.ts` already uses for the mineflayer path (reused, not reimplemented).
3. Once connected to the bridge socket, MFO waits for a `connected` event (below), which the
   bridge mod fires only once the client has actually spawned into the Minecraft world —
   this is the equivalent of mineflayer's `spawn` event and is what triggers
   `ManagerConnected`.
4. If the JVM process itself dies (crash, OOM), MFO detects the closed socket, publishes
   `ManagerDisconnected`, and restarts the process — a supervision layer mineflayer's
   approach never needed, since there was no separate process to lose.

## Transport

Plain TCP on `127.0.0.1`, newline-delimited JSON (NDJSON) — one JSON object per line, no
external framing library needed on either side (Node: built-in `net` + `readline`; Java:
`java.net.ServerSocket` + `BufferedReader`, both stdlib). Loopback-only: the bridge mod
should refuse connections from any address other than `127.0.0.1`, since this is a local
control channel with no authentication.

### Message envelope

```jsonc
// MFO → bridge: command
{"id": "c-1", "kind": "command", "name": "teleport", "payload": {"dimension": "overworld", "x": 100, "y": 64, "z": -32}}

// bridge → MFO: response (echoes id)
{"id": "c-1", "kind": "response", "ok": true, "payload": {}}
{"id": "c-1", "kind": "response", "ok": false, "error": "teleport timed out"}

// bridge → MFO: unsolicited event (no correlating command)
{"id": "e-7", "kind": "event", "name": "disconnected", "payload": {"reason": "socketClosed"}}
```

`id` is generated by whichever side originates the message (MFO for commands, the bridge
mod for events) and is opaque — a UUID or incrementing counter, either is fine.

## Command-to-usage mapping

Every command below exists because current code already does the equivalent thing through
mineflayer. Nothing here is speculative.

| Command | Payload | Response | Replaces (today) |
|---|---|---|---|
| `teleport` | `{dimension, x, y, z}` | `{}` on confirmed move | `TeleportService`: `bot.chat('/execute in ... tp @s x y z')` + wait for `bot.once('forcedMove')` |
| `look` | `{yawDegrees, pitchDegrees}` | `{}` | `CameraService`: `bot.look(yaw, pitch, true)` |
| `queryEntities` | `{radius}` | `{entities: [{id, type, username?, name?, customName?, position, health?}]}` | `EntityMonitor` / `WorkerMonitor`: `bot.entities` |
| `queryBlock` | `{x, y, z}` | `{loaded: boolean}` | `ChunkMonitor` / `StorageMonitor`: `bot.blockAt(...)` (null when chunk unloaded) |
| `readContainer` | `{x, y, z}` | `{capacity, items: [{itemId, count}]}` or `{error: "not found"}` | `StorageMonitor`: `bot.openContainer(block)` → `window.containerItems()` → `bot.closeWindow(window)`, all read-only, no click/transfer packets ever sent |
| `captureScreenshot` | `{}` | `{filePath}` | `ScreenshotService`: replaces the entire puppeteer + prismarine-viewer headless-render pipeline with a single real-framebuffer grab |

### Events (bridge → MFO, unsolicited)

| Event | Payload | Replaces (today) |
|---|---|---|
| `connected` | `{}` | mineflayer `bot.once('spawn', ...)` → `ManagerConnected` |
| `disconnected` | `{reason}` | mineflayer `bot.once('end', ...)` / `bot.on('kicked', ...)` → `ManagerDisconnected`. The bridge mod has direct access to the real disconnect screen text, so this can skip the NBT-flattening `kick-reason.ts` currently needs — the client already renders it as plain text. |
| `error` | `{message}` | mineflayer `bot.on('error', ...)` |

`readContainer` deliberately has no counterpart command to move, insert, extract, or click
anything — it opens the container's data (a read a real player's client already receives
just by having the window open), reports it, and the bridge closes the window server-side
immediately after. There is no click-slot command in this protocol, full stop.

## Client-side mod responsibilities

The bridge mod is the only new Java code. Per command:

- **`teleport`** — sends the identical `/execute in <dim> run tp @s <x> <y> <z>` chat
  command real players use, then waits for the client to receive a forced player-position
  packet from the server (same confirmation signal mineflayer's `forcedMove` uses) before
  responding.
- **`look`** — sets the client player entity's yaw/pitch directly and lets the client's
  normal network tick send the orientation update. No position change.
- **`queryEntities`** — reads `ClientLevel.entitiesForRendering()` (or equivalent), filtered
  by distance, mapped to the same shape `EntityMonitor`/`WorkerMonitor` already expect.
- **`queryBlock`** — checks whether the target position's chunk is loaded client-side;
  returns `loaded: false` exactly where `bot.blockAt` would have returned `null`.
- **`readContainer`** — opens the container (client `useOnBlock` equivalent, i.e. the
  identical action a right-click would trigger), reads the resulting `AbstractContainerMenu`
  slots, immediately closes it. No slot-click packets are ever sent — the mod only reads
  the menu contents that appear after opening.
- **`captureScreenshot`** — grabs the client's actual OpenGL framebuffer (the same mechanism
  vanilla's own F2 screenshot uses) instead of rendering a synthetic scene, writes it to the
  configured screenshots directory, returns the path.

## Prerequisite refactor: a `ManagerClient` interface

Today, `TeleportService`, `CameraService`, `ScreenshotService`, and all four monitors call
mineflayer's `Bot` object directly (`bot.chat`, `bot.look`, `bot.blockAt`,
`bot.openContainer`, `bot.entities`, `bot.viewer`). For `FabricBridgeConnection` to be a true
drop-in alternative to `ManagerConnection` — the actual goal, so this is a transport choice,
not a rewrite of every consumer — those six call sites need to go through a small MFO-owned
interface (something like `ManagerClient`, living in `manager/connection/`) that both
mineflayer's `Bot` and the new bridge RPC client can satisfy. This is a prerequisite for
implementation, not part of the protocol itself, and is its own reviewable change since it
touches every existing service and monitor.

## Configuration

Config-driven, per `manager.yml`'s existing shape — nothing hardcoded, connection mode
selectable so mineflayer remains available as a fallback:

```yaml
connectionMode: mineflayer # | fabricBridge

fabricBridge:
  port: 45565
  clientLaunchCommand: ["path/to/launch-client.sh"]
  reconnect:
    enabled: true
    initialDelayMs: 5000
    maxDelayMs: 60000
```

## Open questions (not resolved by this document)

- **Client credentials.** The real client needs a Microsoft account and the same
  `nmp-cache`-style token caching mineflayer's `auth: microsoft` already relies on — same
  account, different login path. Needs confirming the bridge mod can reuse or needs its own
  cache.
- **Rendering environment.** A real client needs *something* to render into — a GPU context
  or a software renderer (e.g. Mesa's `llvmpipe`) under a headless X server (Xvfb) if the
  host has no display. This is a real resource-footprint increase over mineflayer's
  zero-rendering approach and should be sized before committing to this path.
- **Modpack maintenance.** The client needs the server's actual mod jars kept in sync. This
  trades "maintain one compat mod" for "keep a client mods folder in sync with the server's"
  — worth weighing against just keeping the compat-mod approach already in place.
- **Failure isolation.** A JVM crash now takes down the Manager without taking down the rest
  of MFO (they're separate processes) — a real improvement over today, where mineflayer
  crashes happen in-process. Confirm the supervisor in
  [Process lifecycle](#process-lifecycle) actually gets this right before relying on it.
