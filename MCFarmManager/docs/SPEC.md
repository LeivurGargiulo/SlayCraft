# MCFarmManager — Technical Specification

**Status:** implemented and live-verified (see top-level `README.md` for what's built). This
document remains the source of truth for architecture, protocol, and data model.
`AGENT_BUILD_PROMPT.md` in this same directory is the phased brief this was built from — read
this document first, that one second. The "Dashboard" section below (and `AGENT_BUILD_PROMPT.md`'s
Phase 4) describes a dashboard that was **not built here** — superseded by this repo's separate
coordination dashboard, which proxies this mod's HTTP API instead. See `README.md`.

## What this is

A read-only observability tool for Minecraft Fabric survival servers, purpose-built for
managing farms (iron farms, mob farms, raid farms, etc.) on a technical/semi-automated
server. It answers three questions an operator otherwise has to check manually, in-game,
farm by farm: *is this farm producing, is it still loaded and running, and is the server
healthy enough for it to keep running.*

It is **not** gameplay automation. It never breaks or places blocks, moves or uses items,
attacks, crafts, trades, or otherwise mutates world or player state. Every capability in
this spec is a read.

## Non-negotiable principles

- **Read-only, no exceptions.** No command in this system may call any block-breaking,
  block-placing, inventory-mutating, entity-damaging, crafting, or trading API. Container
  reads happen by reading `BlockEntity` inventory slots directly — never by simulating a
  player opening a screen, never sending any interaction packet.
- **Config-driven farms.** No farm, storage position, or region is hardcoded. All of it
  lives in `farms.json` (see [Farm configuration](#farm-configuration)).
- **One process.** The mod is the entire backend — it embeds its own HTTP server and serves
  the dashboard's static files itself. No separate Node/Python backend, no database server,
  no second process to deploy or supervise. The only new runtime dependency is an embedded
  SQLite file for farm history.
- **LAN-trusted, no auth.** The HTTP API has no authentication layer. It must only ever be
  reachable from a trusted network — this is a deliberate v1 scope decision, not an
  oversight (see [Security posture](#security-posture)).

## Why Carpet is a hard dependency

The target servers already run [fabric-carpet](https://github.com/gnembon/fabric-carpet) —
farms on this kind of server are built around Carpet fake players (`/player <name> spawn`)
that keep chunks loaded and ticking. Building this mod as a **Carpet Extension** rather than
a bare Fabric mod means:

- Fake-player enumeration (which farms have their chunk-loader online) comes from Carpet's
  own player-list bookkeeping, not a hand-rolled equivalent.
- Tick-rate/MSPT numbers come from Carpet's existing `TickSpeed` tracking, not a
  reimplementation of tick-timing math.
- Mobcap/spawn-cap data — directly relevant to spawner-based farm output — is already
  computed by Carpet for its own HUD/logging.
- Per-mod toggles (HTTP port, sample interval, retention) register as Carpet rules,
  reusing Carpet's existing rule persistence instead of inventing a settings file format.

This means MCFarmManager only runs on Carpet-enabled servers. That's an accepted trade-off,
not an oversight — a farm-management tool for a server that doesn't run Carpet is a
different, smaller product than this one.

## Component overview

```
┌─────────────────────────────────────────────────────────────┐
│  Minecraft Fabric server (Carpet-enabled, MC 1.21.11)         │
│                                                                 │
│  MCFarmManager mod (Carpet Extension)                          │
│    - HTTP+JSON API on a configurable port (LAN-reachable)      │
│    - Serves dashboard/ static files on the same port           │
│    - Reads world/entity/block-entity state directly, no        │
│      simulated player interaction                               │
│    - Periodic sampler → SQLite (farm history only)              │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │  plain HTTP, same-origin
                              │
                    ┌───────────────────┐
                    │  Browser           │
                    │  (dashboard, static │
                    │   HTML/JS/CSS,       │
                    │   served by the mod) │
                    └───────────────────┘
```

There is exactly one deployable artifact for the mod (the jar) and one bundled static site.
Nothing else to run.

## Farm configuration

`config/mcfarmmanager/farms.json`, loaded at server startup, validated eagerly (the server
fails to finish loading the mod — logged clearly, doesn't crash the whole server — on a
malformed file rather than silently running with partial config).

```jsonc
{
  "farms": [
    {
      "id": "iron",                     // stable identifier, used in URLs
      "name": "Iron Farm",              // display name
      "dimension": "minecraft:overworld",
      "anchor": { "x": 120, "y": 80, "z": -500 },
      "entityScanRadius": 32,           // blocks, for the entity query around anchor
      "fakePlayerName": "Worker-Iron",  // optional — which Carpet fake player, if any, "owns" this farm
      "storage": [
        { "id": "main-chest", "label": "Main output", "position": { "x": 123, "y": 79, "z": -501 } },
        { "id": "overflow", "label": "Overflow barrel", "position": { "x": 124, "y": 79, "z": -501 } }
      ],
      "afkSpot": {                      // optional — players (real or fake) within radius count as occupants
        "position": { "x": 118, "y": 81, "z": -498 },
        "radius": 16
      }
    }
  ]
}
```

Validation rules: `id` unique and non-empty, `dimension` a real registered dimension id,
`entityScanRadius` positive, `storage[].position` distinct per farm, and when `afkSpot` is
present its `position` is required and `radius` must be positive. Occupant matching is scoped
to the farm's own `dimension` — a player at the same coordinates in another dimension does not
count. Storage entries support
any block with a Minecraft `Inventory` block entity (chest, trapped chest, barrel, shulker
box, hopper, dispenser/dropper). Shulker boxes stored inside a scanned container have their
contents read one level deep (via the item's `container` data component) and exposed as
`shulkerContents`; that nested level is included in `storageItemCount` and in history samples.
Nesting deeper than one level is not possible in vanilla, so there is no recursion.

## Carpet rules (mod-level toggles)

Registered by the extension, persisted via Carpet's own rule mechanism:

| Rule | Type | Default | Meaning |
|---|---|---|---|
| `mcfarmmanagerEnabled` | boolean | `true` | Master on/off switch. When `false`, HTTP server and sampler don't start. |
| `mcfarmmanagerHttpPort` | int | `8642` | Port the HTTP server (API + dashboard) binds to. |
| `mcfarmmanagerHttpBindAddress` | string | `0.0.0.0` | Bind address. LAN-trusted by design — see [Security posture](#security-posture). |
| `mcfarmmanagerSampleIntervalMinutes` | int | `5` | How often farm history is sampled. |
| `mcfarmmanagerHistoryRetentionDays` | int | `30` | Rows older than this are pruned on each sample cycle. |
| `mcfarmmanagerApiToken` | string | `""` (empty) | Shared secret required in the `X-API-Token` header for the write endpoints. Empty means all writes are rejected with `403`. |

## HTTP API

All responses are `application/json`. The read endpoints are `GET` and unauthenticated; the
farm-config write endpoints (`POST`/`PUT`/`DELETE /farms`) require the `X-API-Token` header —
see [Farm config write endpoints](#farm-config-write-endpoints). Errors return a 4xx/5xx status
with `{"error": "<message>"}`.

### `GET /farms`

Summary list, for the dashboard overview page.

```jsonc
{
  "farms": [
    {
      "id": "iron",
      "name": "Iron Farm",
      "dimension": "minecraft:overworld",
      "entityCount": 12,
      "storageItemCount": 1836,
      "chunkLoaded": true,
      "occupantCount": 1
    }
  ]
}
```

### `GET /farms/{id}`

Full detail for one farm.

```jsonc
{
  "id": "iron",
  "name": "Iron Farm",
  "dimension": "minecraft:overworld",
  "anchor": { "x": 120, "y": 80, "z": -500 },
  "chunkLoaded": true,
  "occupants": [
    { "name": "Worker-Iron", "isFakePlayer": true, "position": { "x": 118, "y": 81, "z": -498 } }
  ],
  "entities": [
    { "id": "...", "type": "minecraft:iron_golem", "customName": null, "position": { "x": 121, "y": 80, "z": -499 }, "health": 100.0 }
  ],
  "storage": [
    {
      "id": "main-chest",
      "label": "Main output",
      "position": { "x": 123, "y": 79, "z": -501 },
      "capacity": 27,
      "items": [
        { "itemId": "minecraft:iron_ingot", "count": 1728, "shulkerContents": null },
        { "itemId": "minecraft:shulker_box", "count": 1,
          "shulkerContents": [ { "itemId": "minecraft:iron_ingot", "count": 1728, "shulkerContents": null } ] }
      ]
    }
  ]
}
```

`404` with `{"error": "unknown farm: <id>"}` for an unconfigured id.

### `GET /farms/{id}/history?range=24h`

Farm-only history (see [History](#history)). `range` accepts `1h`, `24h`, `7d`, `30d`, `all`
— defaults to `24h`.

```jsonc
{
  "farmId": "iron",
  "range": "24h",
  "samples": [
    {
      "sampledAt": "2026-07-29T04:00:00Z",
      "entityCounts": { "minecraft:iron_golem": 4 },
      "storageCounts": { "minecraft:iron_ingot": 1620 }
    }
  ]
}
```

Raw samples, not downsampled — at a 5-minute default interval and a 30-day retention window
this is at most ~8,640 rows per farm, trivially small to return and chart client-side.

### Farm config write endpoints

`POST /farms`, `PUT /farms/{id}` and `DELETE /farms/{id}` edit `farms.json` and hot-reload the
in-memory farm list — no server restart. All three require an `X-API-Token` request header whose
value matches the `mcfarmmanagerApiToken` Carpet rule; when that rule is empty (the default),
every write is rejected. Writes are serialized under a single lock and the config file is
replaced atomically, so a rejected request never leaves a partially-written file.

| Method | Path | Body | Success |
|---|---|---|---|
| `POST` | `/farms` | one farm object, same shape as a `farms[]` entry | `201` with the farm summary |
| `PUT` | `/farms/{id}` | one farm object whose `id` equals the URL `id` | `200` with the farm summary |
| `DELETE` | `/farms/{id}` | none | `204`, empty body |

Status codes: `400` for a malformed body, a body `id` that doesn't match the URL, or any config
validation failure (message from the validator is echoed in `error`); `403` for a missing or
wrong `X-API-Token`; `404` on `PUT`/`DELETE` of an unknown id; `500` if the mod hasn't finished
initializing.

### `GET /players`

Real (non-fake) online players.

```jsonc
{
  "players": [
    { "name": "leivur", "dimension": "minecraft:overworld", "position": { "x": 0, "y": 70, "z": 0 }, "gamemode": "survival" }
  ]
}
```

### `GET /world`

Per-dimension world state.

```jsonc
{
  "dimensions": [
    {
      "dimension": "minecraft:overworld",
      "timeOfDay": 13452,
      "dayCount": 47,
      "raining": false,
      "thundering": false,
      "difficulty": "hard",
      "loadedChunkCount": 812
    }
  ]
}
```

### `GET /performance`

Live only, never persisted.

```jsonc
{
  "tps": 19.87,
  "meanTickTimeMs": 47.3,
  "sampledOverTicks": 100
}
```

Sourced from Carpet's existing tick-timing tracking, not reimplemented.

### `GET /status`

```jsonc
{
  "modVersion": "1.0.0",
  "minecraftVersion": "1.21.11",
  "carpetVersion": "...",
  "uptimeSeconds": 3600,
  "farmCount": 4
}
```

## History

Farm data only, as scoped — server status (`/performance`, `/world`, `/players`) is always
live, never written to disk.

**Storage:** embedded SQLite (`org.xerial:sqlite-jdbc`), one file, no server process. Located
at `<world save dir>/mcfarmmanager/history.sqlite` (via `server.getSavePath(WorldSavePath.ROOT)`),
not the config directory — history belongs to a specific world save, and living next to it
means a restored backup carries the matching history rather than an unrelated config-dir
file that has drifted from whatever world is currently loaded.

**Schema:**

```sql
CREATE TABLE farm_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id TEXT NOT NULL,
  sampled_at INTEGER NOT NULL,       -- unix millis
  entity_counts_json TEXT NOT NULL,  -- {"minecraft:iron_golem": 4}
  storage_counts_json TEXT NOT NULL  -- {"minecraft:iron_ingot": 1620}
);
CREATE INDEX idx_farm_samples_farm_time ON farm_samples (farm_id, sampled_at);
```

JSON blobs for the per-type counts, not a normalized `(farm_id, item_id, count)` table — at
this data volume a normalized schema buys nothing but complexity; the blob is opaque to SQL
but that's fine, nothing here needs to filter or aggregate by item type inside the database.

**Sampler:** driven by `ServerTickEvents.END_SERVER_TICK`, counting ticks to fire every
`mcfarmmanagerSampleIntervalMinutes * 60 * 20` ticks. Reuses the exact same query code the
`/farms/{id}` endpoint uses for entity/storage counts — one code path computes "current farm
state," both the live endpoint and the sampler call it. After each sample, prune rows with
`sampled_at` older than `mcfarmmanagerHistoryRetentionDays`.

## Security posture

No authentication. This is a deliberate v1 decision: the mod's HTTP port is reachable from
the LAN the server and the dashboard's viewers are on, and that LAN is the trust boundary —
same trust model the underlying Minecraft server connection itself already relies on. Do not
port-forward this to the public internet. If a future deployment needs to cross an untrusted
network, that's a protocol change (a token header, most likely) — not something to
half-build now for a threat model that doesn't apply yet.

## Dashboard

**Superseded — not built.** This section describes the mod's originally-planned own dashboard.
It was not implemented: this repo's separate coordination dashboard proxies this mod's HTTP API
internally instead, absorbing the role described below. Kept for historical context only.

Static site (`dashboard/` — plain HTML/CSS/vanilla JS, no build step, no framework, no CDN
dependency) bundled into the mod jar's resources and served by the same embedded HTTP server
on `/` and its static asset paths — same origin as the API, so no CORS handling needed
anywhere.

**Views:**
- **Overview** — one card per farm from `GET /farms`: name, entity count, storage total,
  chunk-loaded indicator, fake-player-online indicator. Polls every 10s.
- **Farm detail** — full entity list, per-container item breakdown, and a history chart
  (line chart of entity/storage counts, selectable range) from `GET /farms/{id}` +
  `GET /farms/{id}/history`.
- **Server panel** — `GET /players`, `GET /world`, `GET /performance`, `GET /status` in one
  view. Polls every 5s (this is the "is the server healthy" glance view).

**Charts:** hand-rolled inline SVG line charts (a plain JS function turning an array of
`{sampledAt, value}` points into an SVG `<polyline>`), not a charting library. The data
volume and chart complexity here (a handful of simple time-series) doesn't justify a
dependency — see `AGENT_BUILD_PROMPT.md` Phase 4 for the exact scope.

## Testing

The HTTP/routing layer must be unit-testable without a running Minecraft server: query logic
(entity/storage/chunk reads) lives behind a small `FarmDataProvider` interface returning
plain Java records, and the HTTP handlers only do routing + JSON (de)serialization against
that interface. Unit tests exercise routing and serialization with a fake `FarmDataProvider`.
Actual in-world behavior (does `GET /farms/iron` return real golems) is verified by hand
against a real running dev server — the same limitation the read-only bridge-mod precedent
this design is based on had; there's no practical way to run a full Minecraft server as part
of an automated test suite for this kind of check.

## Build conventions (Fabric/Carpet specifics)

These are known-good as of a prior, closely related project targeting the same Minecraft
version — reuse them rather than rediscovering:

- Fabric Loom Gradle plugin id is **`net.fabricmc.fabric-loom-remap`**, not
  `net.fabricmc.fabric-loom` — the latter resolves but silently lacks the `mappings`
  configuration in current Loom releases.
- Generate the project skeleton from **fabricmc.net/develop/template** (Minecraft
  `1.21.11`, include Fabric API) rather than hand-writing `build.gradle` — the generator
  tracks the currently-correct Loom/Gradle/mappings combination.
- This target uses **official Mojang mappings** (`mappings loom.officialMojangMappings()`),
  not Yarn.
- Java 21 (`sourceCompatibility`/`targetCompatibility` = 21, `JavaCompile.release` = 21).
- **Do not guess renamed/moved vanilla or Carpet class names from training data** for a
  post-cutoff Minecraft/Carpet version — extract the actual mapped jar Loom downloaded
  (`~/.gradle/caches/fabric-loom/minecraftMaven/...`) and inspect it (`javap -p`), or read
  the actual `fabric-carpet` source for the version in use. This applies especially to the
  `CarpetExtension` interface and extension entrypoint key, which have changed across
  Carpet releases — confirm against the actual dependency jar before writing code against it.

## Out of scope for v1 (explicit follow-ups, not silently dropped)

- Authentication / cross-network access.
- Alerting (thresholds, notifications) — the original inspiration for this project had this;
  deliberately deferred here until the live-data foundation exists.
- Multi-server support (one mod instance manages one server's farms).
- History for anything other than farms (server performance/world state stay live-only, per
  explicit scope decision).
- Screenshots/visual capture of any kind.
