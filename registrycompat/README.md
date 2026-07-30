# mfo-bridge-mod

Client-side Fabric mod that lets MFO drive a real Minecraft client over a loopback TCP/NDJSON
socket, read-only. See `docs/BRIDGE_MOD_PROTOCOL.md` in the MFO repo for the protocol this
implements. This is Phase 1 only — the mod by itself does nothing until something speaks the
protocol to it; that's Phase 2 (`FabricBridgeConnection`), not built yet. Until then, verify it
by hand as described below.

## Requirements

- Minecraft **1.21.11**, the exact version the server runs.
- Fabric Loader **>= 0.19.3**.
- Fabric API **0.141.3+1.21.11**.
- Java 21+ (whatever launcher you use for 1.21.11 already bundles a compatible runtime).
- The server's full client-side modpack — see [Install](#install) below.

## Build

Already built once from the sandboxed dev environment (`./gradlew build`, offline, using the
Loom/Gradle caches already warmed by the earlier `mfo-registry-compat` mod build). To rebuild
after changing the source:

```sh
./gradlew build
```

Output: `build/libs/mfo-bridge-mod-1.0.0.jar`.

## Install

This has to go into a **real Fabric client instance** on the gaming PC — not the server's
`mods/` folder, and not a bare vanilla install.

1. **Set up a Fabric client profile** for Minecraft 1.21.11 / Loader 0.19.3+, e.g. via the
   [Fabric installer](https://fabricmc.net/use/installer/) in client mode, or an existing
   MultiMC/Prism Fabric instance pointed at 1.21.11.
2. **Mirror the server's mods folder** into that client instance's `mods/` folder. The server's
   current modpack lives at `C:\Users\Leivur\Documents\MCTesting\mods\` (confirm this path
   hasn't moved again). Copy everything **except**:
   - `mfo-registry-compat-*.jar` — server-only (`"environment": "server"`), and irrelevant once
     the client actually has the real mods (that compat mod exists specifically to fake having
     them; a real client with the real mods doesn't need it).
   Everything else (including server-utility mods like `lithium`/`c2me`/`servercore`) is safe to
   include even though most of it does nothing on a client — Fabric Loader itself skips
   anything whose `fabric.mod.json` declares `"environment": "server"`.
3. **Add the bridge mod**: copy `build/libs/mfo-bridge-mod-1.0.0.jar` into that same `mods/`
   folder.

## Launch

Add a JVM argument for the bridge port (default `45565` if omitted — matches
`config/manager.yml`'s `fabricBridge.port` in the MFO repo):

```
-Dmfo.bridge.port=45565
```

- **Vanilla Minecraft Launcher**: select the Fabric 1.21.11 installation → *Installation
  Settings* → *More Options* → add the flag to *JVM Arguments*.
- **MultiMC/Prism**: instance *Edit* → *Settings* → *Java* → *JVM arguments*.

Log in and join the same server MFO connects to (`config/manager.yml`: `192.168.0.141:25564` as
of this writing — check that file, it's the source of truth, not this README).

The bridge's TCP server starts during mod init, **before** you're logged into the world — so
you can smoke-test the socket itself even at the main menu. World-touching commands
(`teleport`, `queryEntities`, `queryBlock`, `readContainer`, `captureScreenshot`) need you
actually spawned in.

## Verify

Phase 2 (MFO actually speaking this protocol) doesn't exist yet, so verify by hand.

**1. The port is bound to loopback only** (PowerShell, on the same PC as the client):

```powershell
netstat -ano | findstr 45565
```

Should show `127.0.0.1:45565` — not `0.0.0.0:45565`. If it's not loopback-only, something's
wrong; a machine elsewhere on the LAN should not be able to reach this port at all.

**2. Send a real command and read the response** (PowerShell, `TcpClient` one-liner — do this
while actually spawned in-world):

```powershell
$client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 45565)
$stream = $client.GetStream()
$writer = New-Object System.IO.StreamWriter($stream)
$reader = New-Object System.IO.StreamReader($stream)
$writer.AutoFlush = $true
$writer.WriteLine('{"id":"c-1","kind":"command","name":"queryEntities","payload":{"radius":50}}')
$reader.ReadLine()
```

Expect a line back like `{"id":"c-1","kind":"response","ok":true,"payload":{"entities":[...]}}`.
`queryEntities` is a good first test — it's read-only, synchronous, and doesn't depend on
anything else in the world being in a particular state.

**3. Confirm the `connected` event fires on login**: reconnect the `TcpClient` *before* clicking
"Join Server" from the title screen (the bridge's socket is already listening), then watch for
an unsolicited line:

```json
{"id":"e-1","kind":"event","name":"connected","payload":{}}
```

right around when the world finishes loading.

**4. `teleport`** (only if you're comfortable with the client actually moving on a test
server — this sends a real `/execute in ... run tp @s` command, same as `TeleportService` does
via mineflayer today):

```powershell
$writer.WriteLine('{"id":"c-2","kind":"command","name":"teleport","payload":{"dimension":"overworld","x":0,"y":100,"z":0}}')
$reader.ReadLine()
```

Expect `{"id":"c-2","kind":"response","ok":true,"payload":{}}` once the server confirms the
move (may take a moment — there's a client-side poll waiting for position+dimension to match,
capped at 10s before it reports a timeout error instead).

**5. Non-loopback refusal**: nothing to actively test here beyond step 1 — since the
`ServerSocket` is bound only to `127.0.0.1`, a remote host can't even reach the port to attempt
a connection (OS-level, not app-level filtering).

If all five look right, Phase 1 is verified end-to-end as far as it can be without Phase 2.
