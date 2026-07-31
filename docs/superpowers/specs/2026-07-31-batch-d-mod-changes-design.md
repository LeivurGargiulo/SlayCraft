# Batch D: MCFarmManager mod changes

Part of the 11-item feature request tracked in `dashboard/docs/FEATURE_FEASIBILITY.md`. Covers item 2 (real occupant at AFK spot), item 3 (farm config CRUD from the dashboard), and the shulker-box-contents half of item 4. Unlike Batches A–C, this batch requires rebuilding and redeploying the Fabric mod (`MCFarmManager/`) — all three sections touch `mod/src/main/java/net/mcfarmmanager/mod/`, so they're planned together to share one build/deploy/restart cycle.

## Design decisions locked in during brainstorming

- **Write endpoints get a shared-secret auth token.** The mod's HTTP server currently has zero auth (only a Host-header anti-DNS-rebinding check). Adding the mod's first write endpoints (farm config CRUD) without auth would mean anyone who can reach port 8642 could delete farm configs. New Carpet rule `mcfarmmanagerApiToken` (default empty = writes disabled by default). Read endpoints are unchanged — no auth added there, out of scope.
- **Config writes hot-reload immediately**, no server restart required. `MCFarmManagerMod.farms` is already a `volatile` field; the write path validates, atomically persists to `farms.json`, then swaps the reference.
- **AFK spot is a new dedicated config field** (`afkSpot: {position, radius}`), not a reuse of the existing `anchor`/`entityScanRadius`. Farms that don't set it simply report no occupant data — no forced migration on existing farms.
- **`fakePlayer` is replaced by `occupants`** (breaking API change) rather than added alongside it. Confirmed acceptable since Batches A–C haven't executed against the live API yet.
- **Multiple simultaneous occupants (human + bot) are both reported** — `occupants` is a list, not a single winner-takes-it field. Matches the original ask literally: a real player and the fake-player bot can both be "at the AFK spot" at once and both should show.

## 1. AFK-spot occupant detection

**Config schema addition** — `FarmConfig` (currently `id, name, dimension, anchor, entityScanRadius, fakePlayerName, storage`) gains an optional field:

```java
public record FarmConfig(
    String id, String name, String dimension, Position anchor, int entityScanRadius,
    String fakePlayerName, List<StorageConfig> storage,
    AfkSpot afkSpot  // nullable — farms without an AFK spot configured report no occupants
) {}

public record AfkSpot(Position position, int radius) {}
```

`FarmConfigLoader.validate()` gains: if `afkSpot` is present, `radius > 0` and `position` non-null (same shape of check already applied to `entityScanRadius`/`anchor`).

**New data type**:

```java
public record OccupantInfo(String name, boolean isFakePlayer, Position position) {}
```

**New provider method** — `RealFarmDataProvider.occupants(FarmConfig farm)`: if `farm.afkSpot() == null`, returns `List.of()`. Otherwise iterates `server.getPlayerList().getPlayers()` (the same source `RealServerDataProvider.players()` reads, but *without* that method's `EntityPlayerMPFake` exclusion — occupant detection wants both humans and the bot), filters to those within `afkSpot.radius()` of `afkSpot.position()`, and returns one `OccupantInfo` per match with `isFakePlayer = entity instanceof EntityPlayerMPFake`. Uses the existing `onMainThread` hop already used by every other farm-data read in this class (`Level`/`Entity` state requires main-thread access).

**API change** (breaking, see decisions above):
- `FarmDetail.fakePlayer: FakePlayerStatus` → `FarmDetail.occupants: List<OccupantInfo>`
- `FarmSummary.fakePlayerOnline: boolean` → `FarmSummary.occupantCount: int`

**Dashboard fallout**: `GranjaDetail.tsx`'s "Trabajador" card currently reads `f.fakePlayer`. This spec doesn't restructure that card (out of scope — a dashboard-side follow-up, either folded into whichever of Batches A–C's plans hasn't executed yet if this batch lands first, or a small standalone patch if Batch D lands last). Flagging here so it isn't a silent surprise: after this batch ships, `f.fakePlayer` no longer exists in the API response.

## 2. Farm config CRUD

**Auth**: new Carpet rule in `MCFarmManagerExtension.Settings`:

```java
@Rule(categories = RuleCategory.FEATURE)
public static String mcfarmmanagerApiToken = "";
```

Write endpoints (below) check an `X-API-Token` request header against this value. Empty default token means **all writes are rejected** (`403`) until an operator explicitly sets a token — a locked-by-default posture rather than an open one. Mismatched or missing header on a write request → `403 Forbidden`. Read endpoints are unaffected.

**New endpoints**, registered in `MCFarmManagerHttpServer.start()` alongside the existing `/farms` context:
- `POST /farms` — body: a single `FarmConfig` JSON object. Validates (id not already in use, plus all the existing per-farm checks `FarmConfigLoader.validate()` already applies — refactored into a shared `validateFarm(FarmConfig candidate, Set<String> existingIds)` static method callable from both the file-load path and this new write path, rather than duplicating validation logic). On success: appends to the farm list, persists, hot-reloads, returns `201` with the created farm.
- `PUT /farms/{id}` — body: a single `FarmConfig` JSON object, replaces the farm at that id (id in the URL must match the body's `id`, or `400`). Same validation path.
- `DELETE /farms/{id}` — removes the farm with that id. `404` if it doesn't exist.

**Persistence**: all three write a new `farms.json` via write-to-temp-file-then-atomic-rename (avoids a torn/corrupt config file if the process dies mid-write — this is new territory since the mod has only ever *read* this file before).

**Hot reload — the one structural change this requires**: today `MCFarmManagerHttpServer` is constructed once with a `List<FarmConfig> farms` parameter captured at server-start time (`onServerLoaded` in `MCFarmManagerExtension`); nothing currently re-reads `MCFarmManagerMod.farms()` after that. For a write to take effect without a restart, the HTTP server needs to read the **current** farm list on every request instead of a snapshot from construction time — the constructor parameter changes from `List<FarmConfig> farms` to a `Supplier<List<FarmConfig>>` (or every call site that currently uses the captured `farms` field is changed to call `MCFarmManagerMod.farms()` directly, since that accessor already exists and already returns the live `volatile` field).

**Request body parsing**: new code — nothing in the mod reads `exchange.getRequestBody()` today (confirmed: current handlers only parse the query string). New helper reads the body via `gson.fromJson(new InputStreamReader(exchange.getRequestBody()), FarmConfig.class)`, wrapped to return `400` on `JsonSyntaxException`.

## 3. Shulker box nested contents

New method in `RealFarmDataProvider`, invoked from the existing `storage()` scan whenever a slot's `ItemStack` is a shulker box: read the stack's container contents via Minecraft 1.21.x's data component API (`DataComponents.CONTAINER`, backed by `ItemContainerContents`) — confirmed nothing in this codebase touches this API today, this is new territory, not an extension of an existing pattern (unlike the top-level `Container`-interface read that `storage()` already does for chests/barrels/hoppers/etc. sitting *in the world*).

`ItemStackInfo` gains an optional field:

```java
public record ItemStackInfo(String itemId, int count, List<ItemStackInfo> shulkerContents) {}
```

`shulkerContents` is `null` (or an empty list — pick one and apply consistently, `null` matches how `Gson`'s `serializeNulls()` already renders absent optional fields elsewhere in this codebase) for every non-shulker item. One level of nesting only — vanilla Minecraft doesn't allow a shulker box inside another shulker box, so no recursion needed.

## Non-goals (explicitly deferred / rejected)

- Auth on read endpoints — out of scope, current LAN-trust model for reads is unchanged.
- Multi-level shulker nesting — impossible in vanilla, not implemented.
- Migrating Batch C's `expected_rates` (dashboard-local) into mod-side farm config — separate future decision, not part of this batch.
- Config validation UI on the dashboard side (form for adding/editing/deleting a farm) — this spec covers the mod's HTTP surface only; the dashboard-side CRUD form is a separate concern for whichever plan wires up the client against these new endpoints.

## Files touched (mod)

- `config/FarmConfig.java` — add `afkSpot` field
- `config/AfkSpot.java` — new file
- `config/FarmConfigLoader.java` — validate `afkSpot`; extract shared `validateFarm()` for reuse by the write path; add atomic-write helper
- `data/OccupantInfo.java` — new file
- `data/RealFarmDataProvider.java` — `occupants()` method; shulker-contents read in `storage()`
- `data/FarmDataProvider.java` — interface gains `occupants(FarmConfig)`
- `data/ItemStackInfo.java` — add `shulkerContents` field
- `data/FakePlayerStatus.java` — no longer referenced by `FarmDetail` (left in place; `fakePlayer()` provider method becomes unused/removed as part of implementation, decided at plan time)
- `http/FarmDetail.java` — `fakePlayer` → `occupants`
- `http/FarmSummary.java` — `fakePlayerOnline` → `occupantCount`
- `http/MCFarmManagerHttpServer.java` — new write endpoints, request-body parsing, `X-API-Token` check, constructor change to a live farm-list supplier
- `MCFarmManagerExtension.java` — new `mcfarmmanagerApiToken` Carpet rule, translation entries for it
- `MCFarmManagerMod.java` — likely no change (already exposes `farms()`), confirm at plan time whether the HTTP server constructor call site needs updating here or in `MCFarmManagerExtension.onServerLoaded`

## Testing

The mod has no visible automated test suite referenced in prior research (unlike the dashboard's `node:test` suite) — verification is manual, consistent with how this mod's previous phases were verified (per project memory: "live-verified... clean load, HTTP endpoints work, clean stop"):
1. Set `mcfarmmanagerApiToken` via `/carpet`, confirm a write without the header gets `403`, with the correct header succeeds.
2. `POST /farms` a new farm, confirm `farms.json` is updated on disk and `GET /farms` reflects it **without restarting the server**.
3. `PUT`/`DELETE` an existing farm, same live-reload check.
4. Configure `afkSpot` on a farm, stand a real player and spawn/verify the fake player both within radius, confirm `occupants` lists both; move outside radius, confirm the list empties.
5. Place a shulker box with known contents inside a configured farm chest, confirm `storage()`'s response shows the shulker's `shulkerContents` matching what's actually inside it in-game.
