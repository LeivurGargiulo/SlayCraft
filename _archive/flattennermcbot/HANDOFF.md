# Minecraft Bot Project — Session Handoff

## Project goal (big picture)

Building a bot for a survival Minecraft server that:
1. Can flatten large areas via command/chat, block-by-block, as a real player would (survival-legit, not `/fill`-based).
2. Can build schematics, also block-by-block.
3. Is triggerable by any whitelisted player via in-game chat, not just the owner.

## Architecture decision (already made, don't re-litigate)

**Chosen approach: Mineflayer**, not Baritone.

Baritone was seriously considered — it has more mature pathfinding and already
implements schematic building (`#build`). It was ruled out because Baritone
requires a real Minecraft client process (Forge/Fabric + Baritone mod), which
is a much heavier operational lift (headless client, real account management,
mod compatibility) than a lightweight Node.js bot. Mineflayer connects as a
protocol-level "fake player" with no real game client involved, which fits
"any whitelisted player can summon it via chat" much better.

There's a JS-based Baritone-style pathing library for mineflayer worth knowing
about if `mineflayer-pathfinder`'s movement ever feels too rough:
`@miner-org/mineflayer-baritone` (not evaluated yet, just noted as a fallback
option — not the real Baritone, a reimplementation).

## Server environment

- Server is **not vanilla** — runs a Fabric server with a few mods installed.
- Fabric API normally rejects clients that don't report the required mod
  list/channels at handshake (this is Fabric's standard client-mod-check
  behavior).
- The user has a **custom server-side mod, `mfo-registry-compat-1.0.0.jar`**,
  that bypasses this check — it allows bare/vanilla-presenting clients
  (including mineflayer, which presents as vanilla) to connect to the modded
  server without having the required client mods installed.
- Server address for testing: `localhost:25564`
- Minecraft version: `1.21.11`
- Auth: Microsoft account (spare account dedicated to the bot), OAuth
  device-code flow on first run.

## What's been built so far

A spike project (this folder) using:
- `mineflayer` (latest — has native 1.21.11 support, confirmed via web search
  of the official GitHub repo and npm listings as of this session)
- `mineflayer-pathfinder` for movement/goal-based pathing

Current spike features (`index.js`):
- Connects to the server with MS OAuth.
- Whitelist-gated chat command parser (`!bot <command> <args>`), only
  whitelisted in-game usernames can issue commands.
- `!bot goto <x> <y> <z>` — walks to a location via `GoalBlock`.
- `!bot flatten <x1> <z1> <x2> <z2> <targetY>` — naive column-by-column
  walk + `bot.dig()` loop that breaks blocks above `targetY` down to that
  height. **Does not yet fill blocks below target height** — that needs
  inventory-aware block selection, deliberately deferred.
- `!bot stop` — cancels current pathfinder goal.
- Auto-reconnect on disconnect.
- Verbose debug logging (`DEBUG_PACKETS = true` in the file) that logs:
  - every incoming packet, flagging any gap >2000ms since the last packet
  - outgoing `keep_alive` responses
  - `custom_payload` (plugin channel) traffic with channel name + data length
  - `parse_warning` events from the protocol parser
  - a periodic "silence duration" report so you can watch the countdown to
    the 30s keepalive timeout in real time

## Testing results so far

1. **Vanilla server**: bot connects and works cleanly. Confirms the core
   mineflayer setup, whitelist logic, goto, and flatten-break loop all
   function correctly on their own.

2. **Modded server (the real target, via the bypass mod)**: bot connects
   successfully (confirming the bypass mod works for a mineflayer client),
   but the connection died after exactly 30 seconds with:
   ```
   Error: client timed out after 30000 milliseconds
   ```
   This is `node-minecraft-protocol`'s keepalive watchdog firing. **Fixed
   this session** — see below.

## RESOLVED: root cause and fix (this session)

The Polymer hypothesis below was **wrong** — kept for history, but don't
chase it. Confirmed root cause:

**The `packetfixer` mod** (`packetfixer-fabric-3.3.4-1.21.11.jar`, already
installed on the modded server) mixes into vanilla's
`ServerCommonPacketListenerImpl` (the class that schedules keep-alive
packets) and makes the send interval configurable. Its config file,
`ServerModded/config/packetfixer.properties`, has:

```
keepAliveTimeout=120
```

So the server intentionally sends a `keep_alive` only once every **120
seconds**, not vanilla's default 15s. `node-minecraft-protocol`'s
client-side watchdog
(`mineflayer-test/node_modules/minecraft-protocol/src/client/keepalive.js`)
is hardcoded to expect the *next* `keep_alive` within a fixed 30s of the
last one it received — it never adapts to the server's actual cadence. One
`keep_alive` arrives at login, the 30s client timer starts, no second one
arrives in time (the server isn't due to send it for another ~90s), and the
client kills the connection right on schedule. Everything else (entity
movement broadcasts) kept flowing normally because that's a separate
packet-emission path unrelated to per-connection keep-alive scheduling —
which is exactly why the server-side logs showed nothing wrong: this is
expected, intentional server behavior, not a bug, exception, or crash.
`polymer:hello` showing up nearby in the logs was coincidental — Polymer,
the bypass mod, and `mfo-registry-compat` all have nothing to do with
keepalive scheduling (confirmed by decompiling both; `mfo-registry-compat`
only marks Fabric registries as sync-optional).

**Fix applied** (`mineflayer-test/index.js`, in the `createBot()` options):

```js
checkTimeoutInterval: 150000
```

mineflayer passes its `createBot()` options straight through to
`minecraft-protocol`'s `createClient()`, which is exactly where
`keepalive.js` reads `checkTimeoutInterval` from — so this is a supported,
intentional override, not a monkey-patch. 150s gives margin above the
server's 120s cadence. Verified live: bot stayed connected 2m40s+ with a
confirmed second `keep_alive` arriving well past the old 30s failure point,
no disconnects.

Left `packetfixer.properties`'s `keepAliveTimeout=120` alone — that's the
user's real server tuning (presumably to reduce keepalive-kicks for laggy
real players) and affects all players, not just the bot, so the client
adapting is the right fix, not lowering it server-wide.

`DEBUG_PACKETS` has been turned back to `false` in `index.js` now that this
is resolved.

<details>
<summary>Original (incorrect) Polymer hypothesis — kept for history</summary>

Debug logs from the timeout event showed:

- Normal entity/world packets (`rel_entity_move`, `entity_velocity`,
  `entity_move_look`, `entity_head_rotation`, `entity_status`) were flowing
  right up until the error. **The connection was not silent.**
- `time since last packet when error fired: 43ms` — packets were actively
  arriving at the moment of the timeout.
- `last keep_alive received 30004ms ago` — the server sent **exactly one**
  `keep_alive` packet after connecting, then **never sent another one for
  the full 30-second window**, all while other traffic kept flowing normally.

Right after reconnecting (in the same debug session), this packet appeared:

```
[packet:IN] custom_payload
[packet:CUSTOM_PAYLOAD] channel=polymer:hello dataLength=5
```

The working hypothesis was that Polymer's handshake state gated per-client
keepalive scheduling. This was investigated and ruled out: decompiling
`mfo-registry-compat-1.0.0.jar` showed it only marks Fabric registries as
sync-optional (no networking/keepalive code at all), and removing it
entirely (as a control test) caused the server to reject the connection
outright for a registry mismatch rather than changing keepalive behavior —
so it's unrelated to this bug. The real cause was `packetfixer`, above.

</details>

## Next steps (in priority order)

1. Once the connection is stable on the modded server, resume the actual
   feature work that's still pending:
   - Inventory-aware block selection so `flatten` can fill as well as break.
   - Schematic parsing (likely `prismarine-schematic` for `.schem` files)
     and a build-queue implementation using the same walk-to-block +
     place-block pattern already proven in the flatten command.
   - Basic job queue / progress reporting / resumability for long-running
     builds, since large flattens or schematic builds will take real time
     and the process needs to survive a disconnect mid-job.

## Files in this project

- `mineflayer-test/index.js` — the bot itself. `BOT_USERNAME`/`WHITELIST`
  are filled in with real values. `DEBUG_PACKETS` is back to `false` now
  that the keepalive issue is resolved (flip to `true` if diagnosing
  connection issues again — see `keepalive.js` note above for what it logs).
- `mineflayer-test/README.md` — setup/run instructions.
- `mineflayer-test/package.json` / `package-lock.json` — dependencies
  (`mineflayer`, `mineflayer-pathfinder`).
- `ServerModded/`, `ServerVanilla/` — the two test server instances (Fabric
  modded and vanilla respectively). Not normally left running between
  sessions — start with `java -jar server.jar nogui` from inside the
  relevant folder.
- `mfo-registry-compat/` — source for the `mfo_bridge` client mod (an
  unrelated MFO/Farm-Observatory bridge tool, despite the folder name). The
  actual `mfo-registry-compat-1.0.0.jar` bypass mod deployed in
  `ServerModded/mods/` is a separate, tiny compiled-only mod
  (`net.leivur.mforegistrycompat.MfoRegistryCompat`) whose source isn't
  checked in here — decompiled this session to confirm it only marks Fabric
  registries as sync-optional, nothing more.
