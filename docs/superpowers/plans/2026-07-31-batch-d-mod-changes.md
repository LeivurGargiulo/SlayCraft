# Batch D Mod Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AFK-spot occupant detection (real player or fake-player bot), farm config CRUD over HTTP with shared-secret auth and live hot-reload, and shulker-box nested contents in storage scans, to the MCFarmManager Fabric mod — per `docs/superpowers/specs/2026-07-31-batch-d-mod-changes-design.md`. This is the only batch requiring a mod rebuild/redeploy.

**Architecture:** All changes are inside `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/`. Config/data-shape changes (records) come first, then the provider methods that populate them, then the HTTP surface that exposes them, then the write path (auth + CRUD + hot reload) last since it depends on everything else being in place. Verified against the actual mapped 1.21.11 Minecraft jar via `javap` during planning — `DataComponents.CONTAINER` / `ItemContainerContents.nonEmptyItems()` for shulker contents (see Task 6), confirmed exact signatures, not guessed.

**Tech Stack:** Java 21, Fabric Loader 0.19.3, Fabric API 0.141.3+1.21.11, Carpet 1.21.11-1.4.194+v251223, Gson (transitive via Minecraft/Fabric), `com.sun.net.httpserver.HttpServer` (JDK built-in, no web framework). Build: `./gradlew build` from `MCFarmManager/mod/`. No automated test suite exists for this mod (confirmed) — verification is compile success (`./gradlew build`) per task plus a final live-server manual verification pass covering all three features together, consistent with how this mod's prior phases were verified per project history.

## Global Constraints

- No changes to the dashboard (`dashboard/`) in this plan — this is mod-only. Dashboard-side fallout from the `fakePlayer` → `occupants` API change is explicitly out of scope here (noted in the spec).
- Write endpoints (`POST`/`PUT`/`DELETE` on `/farms`) require a matching `X-API-Token` header against the new `mcfarmmanagerApiToken` Carpet rule. Default value is empty string, meaning **writes are rejected by default** until an operator sets a token via `/carpet mcfarmmanagerApiToken <value>`.
- Read endpoints (`GET /farms`, `/players`, `/world`, `/performance`, `/status`) get no new auth — unchanged from today.
- Config writes must hot-reload without a server restart: both the HTTP server's farm list AND `FarmSampler`'s farm list need to read the live `MCFarmManagerMod.farms()` accessor rather than a snapshot captured at server-start time (the sampler reads its own snapshot too, today — same class of staleness bug as the HTTP server, fixed together in Task 5 so a newly-added farm actually gets sampled without a restart).
- One level of shulker nesting only — vanilla Minecraft doesn't allow a shulker box inside another shulker box.

---

### Task 1: `AfkSpot` config field + validation

**Files:**
- Create: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/AfkSpot.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfig.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfigLoader.java`

**Interfaces:**
- Consumes: `Position` (existing record, `config/Position.java`).
- Produces: `AfkSpot(Position position, int radius)`; `FarmConfig.afkSpot()` accessor (nullable). Task 2 depends on this.

- [ ] **Step 1: Create the `AfkSpot` record**

Create `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/AfkSpot.java`:

```java
package net.mcfarmmanager.mod.config;

public record AfkSpot(Position position, int radius) {}
```

- [ ] **Step 2: Add the field to `FarmConfig`**

Replace `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfig.java` in full:

```java
package net.mcfarmmanager.mod.config;

import java.util.List;

public record FarmConfig(
    String id,
    String name,
    String dimension,
    Position anchor,
    int entityScanRadius,
    String fakePlayerName,
    List<StorageConfig> storage,
    AfkSpot afkSpot
) {}
```

- [ ] **Step 3: Validate the new field**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfigLoader.java`, add after the existing storage-position validation loop (after line 79, before the closing brace of `validate()`):

```java
        if (farm.afkSpot() != null) {
            if (farm.afkSpot().position() == null) {
                throw new FarmConfigException("farm " + farm.id() + ": afkSpot missing position");
            }
            if (farm.afkSpot().radius() <= 0) {
                throw new FarmConfigException("farm " + farm.id() + ": afkSpot radius must be positive");
            }
        }
```

- [ ] **Step 4: Update the deployed `farms.json` for the new nullable field**

No change required — `afkSpot` is nullable and Gson leaves missing JSON fields as `null` on record deserialization; the existing `servers/fabric/config/mcfarmmanager/farms.json` (Iron Farm) continues to load without modification, simply with `afkSpot: null`.

- [ ] **Step 5: Compile check**

Run: `cd MCFarmManager/mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
cd /home/leivur/minecraft
git add MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/AfkSpot.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfig.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfigLoader.java
git commit -m "mcfarmmanager: add optional afkSpot field to farm config"
```

---

### Task 2: Occupant detection provider method

**Files:**
- Create: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/OccupantInfo.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/FarmDataProvider.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/RealFarmDataProvider.java`

**Interfaces:**
- Consumes: `FarmConfig.afkSpot()` (Task 1).
- Produces: `OccupantInfo(String name, boolean isFakePlayer, Position position)`; `FarmDataProvider.occupants(FarmConfig)` → `List<OccupantInfo>`; `RealFarmDataProvider.occupants(FarmConfig)` implementation. Task 3 depends on this.

- [ ] **Step 1: Create `OccupantInfo`**

Create `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/OccupantInfo.java`:

```java
package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.Position;

public record OccupantInfo(String name, boolean isFakePlayer, Position position) {}
```

- [ ] **Step 2: Add the method to the interface**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/FarmDataProvider.java`, change:

```java
public interface FarmDataProvider {
    List<EntityInfo> entities(FarmConfig farm);
    List<StorageInfo> storage(FarmConfig farm);
    boolean chunkLoaded(FarmConfig farm);
    FakePlayerStatus fakePlayer(FarmConfig farm);
}
```

to:

```java
public interface FarmDataProvider {
    List<EntityInfo> entities(FarmConfig farm);
    List<StorageInfo> storage(FarmConfig farm);
    boolean chunkLoaded(FarmConfig farm);
    List<OccupantInfo> occupants(FarmConfig farm);
}
```

(Note `fakePlayer` is removed from the interface here — its implementation is deleted from `RealFarmDataProvider` in the next step, and the last remaining caller is updated in Task 3.)

- [ ] **Step 3: Implement `occupants()` and remove `fakePlayer()`**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/RealFarmDataProvider.java`, add the import:

```java
import net.minecraft.server.level.ServerPlayer;
```

(already imported at line 30 — no change needed there, just confirming it's present.) Replace the `fakePlayer` method (lines 158-177) with:

```java
    @Override
    public List<OccupantInfo> occupants(FarmConfig farm) {
        if (farm.afkSpot() == null) {
            return List.of();
        }
        MinecraftServer server = serverSupplier.get();
        if (server == null) {
            return List.of();
        }
        return onMainThread(server, () -> {
            Position center = farm.afkSpot().position();
            double radius = farm.afkSpot().radius();
            List<OccupantInfo> result = new ArrayList<>();
            for (ServerPlayer player : server.getPlayerList().getPlayers()) {
                BlockPos pos = player.blockPosition();
                double dx = pos.getX() - center.x();
                double dy = pos.getY() - center.y();
                double dz = pos.getZ() - center.z();
                if (dx * dx + dy * dy + dz * dz <= radius * radius) {
                    result.add(new OccupantInfo(
                            player.getGameProfile().name(),
                            player instanceof EntityPlayerMPFake,
                            new Position(pos.getX(), pos.getY(), pos.getZ())));
                }
            }
            return result;
        }, List.of());
    }
```

`carpet.patches.EntityPlayerMPFake` is already imported (line 18). `player.getGameProfile().name()` matches the accessor pattern already confirmed and used in `server/RealServerDataProvider.java:70-91` for the same authlib 7.0.61 `GameProfile` record.

- [ ] **Step 4: Compile check**

Run: `cd MCFarmManager/mod && ./gradlew build`
Expected: build FAILS at this point — `MCFarmManagerHttpServer.java` still references the now-deleted `farmData.fakePlayer(farm)` and `FarmDetail`/`FarmSummary` still declare a `fakePlayer`/`fakePlayerOnline` field referencing the deleted `FakePlayerStatus` usage. This is expected; Task 3 fixes it. Confirm the failure is specifically about `fakePlayer`/`FakePlayerStatus` references in `http/MCFarmManagerHttpServer.java`, not an unrelated error, before proceeding.

- [ ] **Step 5: Commit**

```bash
cd /home/leivur/minecraft
git add MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/OccupantInfo.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/FarmDataProvider.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/RealFarmDataProvider.java
git commit -m "mcfarmmanager: replace fakePlayer provider method with occupants()"
```

(Committing a build-broken intermediate state here is intentional and scoped to this one task boundary — Task 3 immediately follows and restores a green build; this mirrors how the interface/implementation and its sole call site are naturally split across two reviewable diffs.)

---

### Task 3: Wire `occupants`/`occupantCount` into the HTTP API

**Files:**
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/FarmDetail.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/FarmSummary.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`

**Interfaces:**
- Consumes: `FarmDataProvider.occupants(FarmConfig)` (Task 2).
- Produces: `FarmDetail.occupants: List<OccupantInfo>`; `FarmSummary.occupantCount: int`. Consumed by the dashboard once its own plans catch up (out of scope here, noted in spec).

- [ ] **Step 1: Update `FarmDetail`**

Replace `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/FarmDetail.java` in full:

```java
package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.data.EntityInfo;
import net.mcfarmmanager.mod.data.OccupantInfo;
import net.mcfarmmanager.mod.data.StorageInfo;

import java.util.List;

public record FarmDetail(String id, String name, String dimension, Position anchor, boolean chunkLoaded, List<OccupantInfo> occupants, List<EntityInfo> entities, List<StorageInfo> storage) {}
```

- [ ] **Step 2: Update `FarmSummary`**

Replace `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/FarmSummary.java` in full:

```java
package net.mcfarmmanager.mod.http;

public record FarmSummary(String id, String name, String dimension, int entityCount, int storageItemCount, boolean chunkLoaded, int occupantCount) {}
```

- [ ] **Step 3: Update the handlers that build these records**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`, replace `summarize()` (lines 219-233):

```java
    private FarmSummary summarize(FarmConfig farm) {
        int storageItemCount = farmData.storage(farm).stream()
                .flatMap(s -> s.items().stream())
                .mapToInt(item -> item.count())
                .sum();
        return new FarmSummary(
                farm.id(),
                farm.name(),
                farm.dimension(),
                farmData.entities(farm).size(),
                storageItemCount,
                farmData.chunkLoaded(farm),
                farmData.occupants(farm).size());
    }
```

Replace `detail()` (lines 235-245):

```java
    private FarmDetail detail(FarmConfig farm) {
        return new FarmDetail(
                farm.id(),
                farm.name(),
                farm.dimension(),
                farm.anchor(),
                farmData.chunkLoaded(farm),
                farmData.occupants(farm),
                farmData.entities(farm),
                farmData.storage(farm));
    }
```

- [ ] **Step 4: Delete the now-unused `FakePlayerStatus` record**

Nothing references `net.mcfarmmanager.mod.data.FakePlayerStatus` anymore after this task (its only producer, `RealFarmDataProvider.fakePlayer()`, was removed in Task 2; its only consumers, `FarmDetail`/`FarmSummary`, were just changed above). Delete `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/FakePlayerStatus.java`.

- [ ] **Step 5: Compile check**

Run: `cd MCFarmManager/mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
cd /home/leivur/minecraft
git add MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/FarmDetail.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/FarmSummary.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java
git add MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/FakePlayerStatus.java
git commit -m "mcfarmmanager: expose occupants/occupantCount over HTTP, drop unused FakePlayerStatus"
```

---

### Task 4: `mcfarmmanagerApiToken` Carpet rule + write-auth filter

**Files:**
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Settings.mcfarmmanagerApiToken: String`; auth check reusable by Task 5's write handlers.

- [ ] **Step 1: Add the Carpet rule**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java`, add to the `Settings` class (after line 61, the `mcfarmmanagerHistoryRetentionDays` rule):

```java
        @Rule(categories = RuleCategory.FEATURE)
        public static String mcfarmmanagerApiToken = "";
```

Add the corresponding translation entries to `canHasTranslations()` (extend the `Map.of(...)` call, which has a 10-argument limit per pair — `Map.of` supports up to 10 key-value pairs (20 args); the existing call already has 4 pairs (8 args), adding one more pair keeps it at 5 pairs (10 args), still within `Map.of`'s overload range):

```java
                "mcfarmmanager.rule.mcfarmmanagerApiToken.name", "MCFarmManager API Token",
                "mcfarmmanager.rule.mcfarmmanagerApiToken.desc",
                "Shared secret required in the X-API-Token header for farm-config write requests (POST/PUT/DELETE on /farms). Empty (default) rejects all writes.");
```

- [ ] **Step 2: Add the auth check helper**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`, add a private method after `stripPort()` (after line 135):

```java
    private boolean isAuthorizedWrite(HttpExchange exchange) {
        String expected = net.mcfarmmanager.mod.MCFarmManagerExtension.Settings.mcfarmmanagerApiToken;
        if (expected == null || expected.isEmpty()) {
            return false;
        }
        String provided = exchange.getRequestHeaders().getFirst("X-API-Token");
        return expected.equals(provided);
    }
```

This is called from Task 5's write handlers (not wired to anything yet in this task — this task only adds the rule and the reusable check).

- [ ] **Step 3: Compile check**

Run: `cd MCFarmManager/mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL` (the new `isAuthorizedWrite` method is unused until Task 5, which will produce an "unused private method" warning, not a compile error, until then — confirm it's a warning, not a failure, if the build output flags it).

- [ ] **Step 4: Commit**

```bash
cd /home/leivur/minecraft
git add MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java
git commit -m "mcfarmmanager: add mcfarmmanagerApiToken rule and write-auth check"
```

---

### Task 5: Farm config CRUD endpoints + hot reload

**Files:**
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfigLoader.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/history/FarmSampler.java`

**Interfaces:**
- Consumes: `FarmConfigLoader.validate()` (made reusable in this task), `MCFarmManagerMod.farms()` (existing static accessor).
- Produces: `POST /farms`, `PUT /farms/{id}`, `DELETE /farms/{id}`; `MCFarmManagerHttpServer` constructor now takes `Supplier<List<FarmConfig>>` instead of `List<FarmConfig>`; `FarmSampler` constructor likewise. Final task with mod-side write behavior — nothing later depends on this.

- [ ] **Step 1: Make `FarmConfigLoader.validate()` reusable and add an atomic-write helper**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfigLoader.java`, change the method signature from `private static void validate` to `public static void validate` (line 47) — now callable from the `http` package for single-farm validation on write.

Add two new public methods to the class (after `load()`, before `validate()`):

```java
    public static void validateAll(List<FarmConfig> farms) {
        Set<String> seenIds = new HashSet<>();
        for (FarmConfig farm : farms) {
            validate(farm, seenIds);
        }
    }

    public static void write(Path jsonFile, List<FarmConfig> farms) {
        validateAll(farms);
        String json = new com.google.gson.GsonBuilder().setPrettyPrinting().create()
                .toJson(new FarmsFile(farms));
        try {
            Path tmp = jsonFile.resolveSibling(jsonFile.getFileName() + ".tmp");
            Files.writeString(tmp, json);
            Files.move(tmp, jsonFile, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new FarmConfigException("could not write farms.json: " + e.getMessage());
        }
    }
```

Refactor `load()`'s existing validation loop (lines 40-43) to reuse the new `validateAll`:

```java
        validateAll(parsed.farms());
        return parsed.farms();
```

- [ ] **Step 2: Give `MCFarmManagerMod` a config-path accessor and a way to replace the live farm list**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerMod.java`, the class currently is:

```java
public final class MCFarmManagerMod implements ModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("mcfarmmanager");
    private static volatile List<FarmConfig> farms = List.of();
    public static List<FarmConfig> farms() { return farms; }

    @Override
    public void onInitialize() {
        LOGGER.info("MCFarmManager mod loaded (base entrypoint)");
        MCFarmManagerExtension extension = new MCFarmManagerExtension();
        CarpetServer.manageExtension(extension);
        extension.registerSettings();

        try {
            farms = FarmConfigLoader.load(
                    FabricLoader.getInstance().getConfigDir().resolve("mcfarmmanager/farms.json"));
            LOGGER.info("Loaded {} farm(s) from mcfarmmanager/farms.json", farms.size());
        } catch (FarmConfigException e) {
            LOGGER.error("Failed to load mcfarmmanager/farms.json - mod behavior disabled: {}", e.getMessage());
            farms = List.of();
        }
    }
}
```

Change to add a config-path constant, a setter, and a path accessor:

```java
public final class MCFarmManagerMod implements ModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("mcfarmmanager");
    private static volatile List<FarmConfig> farms = List.of();
    private static Path configPath;

    public static List<FarmConfig> farms() { return farms; }
    public static void setFarms(List<FarmConfig> updated) { farms = updated; }
    public static Path configPath() { return configPath; }

    @Override
    public void onInitialize() {
        LOGGER.info("MCFarmManager mod loaded (base entrypoint)");
        MCFarmManagerExtension extension = new MCFarmManagerExtension();
        CarpetServer.manageExtension(extension);
        extension.registerSettings();

        configPath = FabricLoader.getInstance().getConfigDir().resolve("mcfarmmanager/farms.json");
        try {
            farms = FarmConfigLoader.load(configPath);
            LOGGER.info("Loaded {} farm(s) from mcfarmmanager/farms.json", farms.size());
        } catch (FarmConfigException e) {
            LOGGER.error("Failed to load mcfarmmanager/farms.json - mod behavior disabled: {}", e.getMessage());
            farms = List.of();
        }
    }
}
```

Add the import `import java.nio.file.Path;` alongside the existing imports.

- [ ] **Step 3: Make `MCFarmManagerHttpServer` read the live farm list**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`, change the field and constructor (lines 36, 45-54):

```java
    private final java.util.function.Supplier<List<FarmConfig>> farmsSupplier;
```

```java
    public MCFarmManagerHttpServer(java.util.function.Supplier<List<FarmConfig>> farmsSupplier, FarmDataProvider farmData,
                                    ServerDataProvider serverData, HistoryStore historyStore,
                                    int port, String bindAddress) {
        this.farmsSupplier = farmsSupplier;
        this.farmData = farmData;
        this.serverData = serverData;
        this.historyStore = historyStore;
        this.port = port;
        this.bindAddress = bindAddress;
    }
```

Every existing use of the field `farms` in this class now reads `farmsSupplier.get()` instead. Specifically:
- Line 63 (`/status` context): `respondJson(exchange, serverData.status(farms.size()))` → `respondJson(exchange, serverData.status(farmsSupplier.get().size()))`
- Line 150 (`handleFarms`, list): `farms.stream()` → `farmsSupplier.get().stream()`
- Line 182 (`findFarm`): `return farms.stream()...` → `return farmsSupplier.get().stream()...`

- [ ] **Step 4: Add the write handlers and route them by HTTP method**

Replace `handleFarms()` (lines 147-166) to dispatch by method for the `/farms` and `/farms/{id}` paths (history sub-path handling is unchanged):

```java
    private void handleFarms(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod();

        if (path.equals("/farms")) {
            if (method.equals("POST")) {
                handleCreateFarm(exchange);
                return;
            }
            respondJson(exchange, Map.of("farms", farmsSupplier.get().stream().map(this::summarize).toList()));
            return;
        }

        String remainder = path.substring("/farms/".length());
        if (remainder.endsWith("/history")) {
            handleFarmHistory(exchange, remainder.substring(0, remainder.length() - "/history".length()));
            return;
        }

        if (method.equals("PUT")) {
            handleReplaceFarm(exchange, remainder);
            return;
        }
        if (method.equals("DELETE")) {
            handleDeleteFarm(exchange, remainder);
            return;
        }

        FarmConfig farm = findFarm(remainder);
        if (farm == null) {
            respondJson(exchange, 404, Map.of("error", "unknown farm: " + remainder));
            return;
        }
        respondJson(exchange, detail(farm));
    }

    private void handleCreateFarm(HttpExchange exchange) throws IOException {
        if (!isAuthorizedWrite(exchange)) {
            respondJson(exchange, 403, Map.of("error", "missing or invalid X-API-Token"));
            return;
        }
        FarmConfig candidate;
        try {
            candidate = gson.fromJson(new java.io.InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8), FarmConfig.class);
        } catch (com.google.gson.JsonSyntaxException e) {
            respondJson(exchange, 400, Map.of("error", "malformed JSON body"));
            return;
        }
        List<FarmConfig> current = farmsSupplier.get();
        List<FarmConfig> updated = new java.util.ArrayList<>(current);
        updated.add(candidate);
        try {
            net.mcfarmmanager.mod.config.FarmConfigLoader.write(net.mcfarmmanager.mod.MCFarmManagerMod.configPath(), updated);
        } catch (net.mcfarmmanager.mod.config.FarmConfigException e) {
            respondJson(exchange, 400, Map.of("error", e.getMessage()));
            return;
        }
        net.mcfarmmanager.mod.MCFarmManagerMod.setFarms(updated);
        respondJson(exchange, 201, summarize(candidate));
    }

    private void handleReplaceFarm(HttpExchange exchange, String id) throws IOException {
        if (!isAuthorizedWrite(exchange)) {
            respondJson(exchange, 403, Map.of("error", "missing or invalid X-API-Token"));
            return;
        }
        FarmConfig candidate;
        try {
            candidate = gson.fromJson(new java.io.InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8), FarmConfig.class);
        } catch (com.google.gson.JsonSyntaxException e) {
            respondJson(exchange, 400, Map.of("error", "malformed JSON body"));
            return;
        }
        if (candidate.id() == null || !candidate.id().equals(id)) {
            respondJson(exchange, 400, Map.of("error", "body id must match URL id"));
            return;
        }
        List<FarmConfig> current = farmsSupplier.get();
        if (current.stream().noneMatch(f -> f.id().equals(id))) {
            respondJson(exchange, 404, Map.of("error", "unknown farm: " + id));
            return;
        }
        List<FarmConfig> updated = current.stream().map(f -> f.id().equals(id) ? candidate : f).toList();
        try {
            net.mcfarmmanager.mod.config.FarmConfigLoader.write(net.mcfarmmanager.mod.MCFarmManagerMod.configPath(), updated);
        } catch (net.mcfarmmanager.mod.config.FarmConfigException e) {
            respondJson(exchange, 400, Map.of("error", e.getMessage()));
            return;
        }
        net.mcfarmmanager.mod.MCFarmManagerMod.setFarms(updated);
        respondJson(exchange, summarize(candidate));
    }

    private void handleDeleteFarm(HttpExchange exchange, String id) throws IOException {
        if (!isAuthorizedWrite(exchange)) {
            respondJson(exchange, 403, Map.of("error", "missing or invalid X-API-Token"));
            return;
        }
        List<FarmConfig> current = farmsSupplier.get();
        if (current.stream().noneMatch(f -> f.id().equals(id))) {
            respondJson(exchange, 404, Map.of("error", "unknown farm: " + id));
            return;
        }
        List<FarmConfig> updated = current.stream().filter(f -> !f.id().equals(id)).toList();
        try {
            net.mcfarmmanager.mod.config.FarmConfigLoader.write(net.mcfarmmanager.mod.MCFarmManagerMod.configPath(), updated);
        } catch (net.mcfarmmanager.mod.config.FarmConfigException e) {
            respondJson(exchange, 400, Map.of("error", e.getMessage()));
            return;
        }
        net.mcfarmmanager.mod.MCFarmManagerMod.setFarms(updated);
        exchange.sendResponseHeaders(204, -1);
    }
```

- [ ] **Step 5: Make `FarmSampler` read the live farm list too**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/history/FarmSampler.java`, change the field and constructor's `farms` parameter (line 19, 26-28) from `List<FarmConfig> farms` to `java.util.function.Supplier<List<FarmConfig>> farmsSupplier`, and change the sampling loop (line 46) from `for (FarmConfig farm : farms)` to `for (FarmConfig farm : farmsSupplier.get())`.

- [ ] **Step 6: Update the two construction call sites in `MCFarmManagerExtension`**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java`, change line 128 from:

```java
        activeSampler = new FarmSampler(MCFarmManagerMod.farms(), farmData, historyStore,
```

to:

```java
        activeSampler = new FarmSampler(MCFarmManagerMod::farms, farmData, historyStore,
```

Change lines 139-145 from:

```java
        httpServer = new MCFarmManagerHttpServer(
                MCFarmManagerMod.farms(),
                farmData,
```

to:

```java
        httpServer = new MCFarmManagerHttpServer(
                MCFarmManagerMod::farms,
                farmData,
```

(both are method-reference `Supplier<List<FarmConfig>>` — `MCFarmManagerMod::farms` re-invokes the static accessor on every call rather than capturing one snapshot.)

- [ ] **Step 7: Compile check**

Run: `cd MCFarmManager/mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 8: Commit**

```bash
cd /home/leivur/minecraft
git add MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfigLoader.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerMod.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/history/FarmSampler.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java
git commit -m "mcfarmmanager: add farm config CRUD endpoints with live hot-reload"
```

---

### Task 6: Shulker box nested contents

**Files:**
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/ItemStackInfo.java`
- Modify: `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/RealFarmDataProvider.java`

**Interfaces:**
- Consumes: nothing new. Uses `net.minecraft.core.component.DataComponents.CONTAINER` and `net.minecraft.world.item.component.ItemContainerContents.nonEmptyItems()` — signatures confirmed via `javap` against the mapped 1.21.11 jar during planning (`ItemStack.get(DataComponentType<? extends T>)` inherited from `DataComponentHolder`, returns `T` or `null`; `ItemContainerContents.nonEmptyItems()` returns `Iterable<ItemStack>`).
- Produces: `ItemStackInfo.shulkerContents: List<ItemStackInfo>` (null for non-shulker items). Final task in this batch.

- [ ] **Step 1: Add the field to `ItemStackInfo`**

Replace `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/ItemStackInfo.java` in full:

```java
package net.mcfarmmanager.mod.data;

import java.util.List;

public record ItemStackInfo(String itemId, int count, List<ItemStackInfo> shulkerContents) {}
```

- [ ] **Step 2: Read shulker contents in `storage()`**

In `MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/RealFarmDataProvider.java`, add imports:

```java
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.component.ItemContainerContents;
```

Change the item-building block inside `storage()` (lines 129-132) from:

```java
                        if (!stack.isEmpty()) {
                            slotItems.add(new ItemStackInfo(
                                    BuiltInRegistries.ITEM.getKey(stack.getItem()).toString(), stack.getCount()));
                        }
```

to:

```java
                        if (!stack.isEmpty()) {
                            slotItems.add(new ItemStackInfo(
                                    BuiltInRegistries.ITEM.getKey(stack.getItem()).toString(),
                                    stack.getCount(),
                                    shulkerContentsOf(stack)));
                        }
```

Add a new private static method, after `storage()` (after line 140):

```java
    private static List<ItemStackInfo> shulkerContentsOf(ItemStack stack) {
        ItemContainerContents contents = stack.get(DataComponents.CONTAINER);
        if (contents == null) {
            return null;
        }
        List<ItemStackInfo> result = new ArrayList<>();
        for (ItemStack inner : contents.nonEmptyItems()) {
            result.add(new ItemStackInfo(BuiltInRegistries.ITEM.getKey(inner.getItem()).toString(), inner.getCount(), null));
        }
        return result.isEmpty() ? null : result;
    }
```

(One level of nesting only — `inner`'s own `shulkerContents` is always passed as `null` since a shulker box cannot contain another shulker box in vanilla Minecraft, so no recursive call is needed.)

- [ ] **Step 3: Compile check**

Run: `cd MCFarmManager/mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd /home/leivur/minecraft
git add MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/ItemStackInfo.java MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/data/RealFarmDataProvider.java
git commit -m "mcfarmmanager: read shulker box nested contents in storage scans"
```

---

### Task 7: Live verification (deploy + manual test pass)

**Files:** none — deployment and manual testing only.

**Interfaces:**
- Consumes: the built jar from `MCFarmManager/mod/build/libs/mcfarmmanager-1.0.0.jar`.
- Produces: nothing — final verification task confirming the whole batch works end-to-end on a running server.

- [ ] **Step 1: Build and deploy the jar**

Run: `cd MCFarmManager/mod && ./gradlew build`
Copy the resulting jar to the running server's mods directory: `cp build/libs/mcfarmmanager-1.0.0.jar /home/leivur/minecraft/servers/fabric/mods/mcfarmmanager-1.0.0.jar`

- [ ] **Step 2: Set an API token and add an `afkSpot` to the Iron Farm config**

Edit `/home/leivur/minecraft/servers/fabric/config/mcfarmmanager/farms.json`, add to the Iron Farm entry:

```json
"afkSpot": { "position": { "x": 120, "y": 82, "z": -498 }, "radius": 5 }
```

Restart the Fabric server (`docker compose restart mcserver` if using the containerized setup from earlier in this project, or the equivalent for however it's currently running) to pick up both the new jar and the manually-edited config for this first pass.

- [ ] **Step 3: Verify occupant detection**

Stand a real player within the configured `afkSpot` radius. Query `GET /farms/iron` (via `curl` with the correct `Host` header, or through the dashboard's existing proxy if Batches A-C haven't changed the `fakePlayer` reference yet — expect a dashboard-side error there, which is expected and out of scope per the spec). Confirm `occupants` includes the real player with `isFakePlayer: false`. If the farm's configured fake player is also online and in range, confirm it appears too with `isFakePlayer: true`.

- [ ] **Step 4: Verify config CRUD + hot reload**

Set a token: in-game `/carpet mcfarmmanagerApiToken test-secret-123`. `POST /farms` a new test farm (with a valid `id`, `name`, `dimension`, `anchor`, `entityScanRadius`, empty `storage: []`) with header `X-API-Token: test-secret-123`. Confirm `201` and that `GET /farms` immediately lists it — **without restarting the server**. `DELETE /farms/<test-id>` with the same header, confirm `204` and it's gone from `GET /farms`. Confirm a `POST`/`DELETE` **without** the header, or with the wrong value, gets `403`. Inspect `servers/fabric/config/mcfarmmanager/farms.json` directly, confirm it reflects the additions/removals on disk.

- [ ] **Step 5: Verify shulker contents**

Place a shulker box with known contents (e.g. 2 stacks of dirt) inside one of the Iron Farm's configured storage chests. Query `GET /farms/iron`, confirm the shulker box's `ItemStackInfo` entry in the chest's `items` array has a `shulkerContents` array matching what's actually inside it.

- [ ] **Step 6: Restart cleanly and confirm no regressions**

Stop and restart the server one more time, confirm it comes up cleanly (no crash, no exception in logs related to the new code), and `GET /farms/iron` still returns a valid response reflecting whatever farms.json currently contains (including any CRUD changes from Step 4 that weren't reverted).
