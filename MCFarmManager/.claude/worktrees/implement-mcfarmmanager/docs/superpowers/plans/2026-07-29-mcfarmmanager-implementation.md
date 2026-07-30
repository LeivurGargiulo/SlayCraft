# MCFarmManager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MCFarmManager, a read-only Fabric/Carpet Extension mod for Minecraft 1.21.11 that
exposes farm/world/server state over an embedded HTTP+JSON API and serves a static dashboard on
the same port, with SQLite-backed farm history.

**Architecture:** One Gradle-built Fabric mod (`mod/`), registered as a Carpet Extension. A
`FarmDataProvider` interface isolates all farm reads (entities/storage/chunk/fake-player) behind
plain Java records so the HTTP/routing layer is unit-testable without a running server. A sibling
`ServerDataProvider` covers world/players/performance/status. `com.sun.net.httpserver.HttpServer`
serves both the JSON API and the bundled static `dashboard/` files on one port. A tick-driven
sampler writes farm-only history to an embedded SQLite file.

**Tech Stack:** Java 21, Fabric Loader, Fabric API, fabric-carpet, Gson, `org.xerial:sqlite-jdbc`,
JUnit 5, `com.sun.net.httpserver` (JDK built-in), vanilla HTML/CSS/JS dashboard (no build step).

## Global Constraints

- **Minecraft version:** `1.21.11` — exact, not "latest".
- **Fabric Loader:** `0.19.3` (confirmed installed and running on the real target server; do not
  substitute a different version without re-confirming compatibility).
- **Fabric API:** `0.141.3+1.21.11` (jar: `fabric-api-0.141.3+1.21.11.jar`, already running on the
  real target server).
- **fabric-carpet:** `1.21.11-1.4.194+v251223` (jar: `fabric-carpet-1.21.11-1.4.194+v251223.jar`,
  already running on the real target server). This version is pinned from direct observation of a
  real, currently-working server install — do not re-derive it from a version-lookup search.
- **SQLite JDBC:** `org.xerial:sqlite-jdbc:3.49.1.0` (this exact version is already present and
  working in the real target server's mod set, confirming JVM/Java-21 compatibility).
- **Java:** 21 (`sourceCompatibility`/`targetCompatibility` = 21, `JavaCompile.release` = 21).
- **Mappings:** official Mojang mappings (`mappings loom.officialMojangMappings()`), not Yarn.
- **Loom plugin id:** `net.fabricmc.fabric-loom-remap` (NOT `net.fabricmc.fabric-loom` — the
  latter resolves but silently lacks the `mappings` configuration in current Loom releases).
- **Gradle project generation:** generate the skeleton from the Fabric template generator
  (`fabricmc.net/develop/template`, Minecraft `1.21.11`, Fabric API included) rather than
  hand-writing `build.gradle` from scratch — it tracks the currently-correct
  Loom/Gradle/mappings combination. Adjust the generated file only to add the exact dependency
  versions and Loom plugin id pinned above if the generator's defaults differ.
- **Group id / package root:** `net.mcfarmmanager`, root package `net.mcfarmmanager.mod`.
- **Mod id:** `mcfarmmanager` (matches the existing Carpet rule prefix `mcfarmmanager*` already
  defined in `docs/SPEC.md`).
- **fabric.mod.json `environment`:** `"server"` — this mod embeds an HTTP server and has no
  client-side behavior.
- **Carpet Extension entrypoint key and `CarpetExtension` interface:** DO NOT assume the
  historical `"carpet:carpet_extension"` key or method signatures from training data. Extract the
  actual `fabric-carpet-1.21.11-1.4.194+v251223.jar` from the Gradle cache
  (`~/.gradle/caches/fabric-loom/...` or wherever Loom placed it after the first build) and run
  `javap -p` on `carpet.api.settings.CarpetExtension` (or search the jar for the actual class if
  the package differs) to confirm the real interface and entrypoint key before writing against it.
  This is a required discovery step in Task 2, not optional.
- **No new dependencies beyond:** JDK `com.sun.net.httpserver`, `org.xerial:sqlite-jdbc:3.49.1.0`,
  Gson (transitive Fabric dependency), Fabric API, fabric-carpet, JUnit 5 (test scope only).
  Nothing else without stopping and asking — this is a scope decision per `docs/SPEC.md`.
- **Read-only, no exceptions.** No block-breaking, block-placing, item-movement/use,
  entity-damaging, crafting, or trading API call anywhere in `mod/src/main`. Container reads
  happen by reading `BlockEntity` inventory slots directly — never simulate opening a screen,
  never send an interaction packet. (Test-fixture setup via server console commands, described
  below, is explicitly outside this rule — it's disposable world scaffolding for verification,
  not mod code.)
- **Config-driven.** No hardcoded farm ids, coordinates, dimensions, or storage positions in Java
  source — all from `config/mcfarmmanager/farms.json`.
- **One process, one artifact.** The mod's `HttpServer` instance serves both the JSON API and the
  bundled `dashboard/` static files. No second process, no dashboard build step, no JS framework,
  no CDN dependency.
- **Interface design (locked so every task agrees on names):**
  - `record Position(int x, int y, int z)`
  - `record FarmConfig(String id, String name, String dimension, Position anchor, int entityScanRadius, String fakePlayerName, List<StorageConfig> storage)` — `fakePlayerName` is `null` when not configured.
  - `record StorageConfig(String id, String label, Position position)`
  - `record EntityInfo(String id, String type, String customName, Position position, double health)`
  - `record ItemStack(String itemId, int count)`
  - `record StorageInfo(String id, String label, Position position, int capacity, List<ItemStack> items)`
  - `record FakePlayerStatus(String name, boolean online, Position position)` — `position` is `null` when `online` is `false`.
  - `record FarmSummary(String id, String name, String dimension, int entityCount, int storageItemCount, boolean chunkLoaded, boolean fakePlayerOnline)`
  - `record FarmDetail(String id, String name, String dimension, Position anchor, boolean chunkLoaded, FakePlayerStatus fakePlayer, List<EntityInfo> entities, List<StorageInfo> storage)`
  - `record HistorySample(long sampledAtMillis, Map<String, Integer> entityCounts, Map<String, Integer> storageCounts)`
  - `record PlayerInfo(String name, String dimension, Position position, String gamemode)`
  - `record DimensionState(String dimension, long timeOfDay, long dayCount, boolean raining, boolean thundering, String difficulty, int loadedChunkCount)`
  - `record PerformanceInfo(double tps, double meanTickTimeMs, int sampledOverTicks)`
  - `record StatusInfo(String modVersion, String minecraftVersion, String carpetVersion, long uptimeSeconds, int farmCount)`
  - `interface FarmDataProvider { List<EntityInfo> entities(FarmConfig farm); List<StorageInfo> storage(FarmConfig farm); boolean chunkLoaded(FarmConfig farm); FakePlayerStatus fakePlayer(FarmConfig farm); }` — no Minecraft types in the signature.
  - `interface ServerDataProvider { List<PlayerInfo> players(); List<DimensionState> worldState(); PerformanceInfo performance(); StatusInfo status(int farmCount); }`
  - `interface HistoryStore { void recordSample(String farmId, long sampledAtMillis, Map<String,Integer> entityCounts, Map<String,Integer> storageCounts); List<HistorySample> query(String farmId, long sinceMillis); void pruneOlderThan(long cutoffMillis); }`

## Live verification target (real server)

A real Carpet-enabled 1.21.11 dev/survival server already exists at
`/home/leivur/projects/flattennermcbot/ServerModded` (this is a sibling project directory, not
part of this repo — do not commit anything from it). Facts:

- Start command: `bash run.sh` from that directory (runs `java -Xmx6G -jar server.jar`), which is
  a heavy pack (~90 mods) — allow 1-3 minutes for `Done (` to appear in the log before treating it
  as ready.
- Port `25564`, `online-mode=true`, `white-list=true`, `enable-rcon=false` — do not flip
  `enable-rcon` or edit any of this file's other settings; use the console-via-FIFO procedure
  below instead of RCON.
- Mods live in `mods/`, config in `config/`. Adding `mcfarmmanager-1.0.0.jar` to `mods/` and
  `config/mcfarmmanager/farms.json` are the only writes this plan makes there.
- **Console access without RCON:** create a named pipe and pipe it into the server's stdin so
  commands can be sent programmatically without editing server config:
  ```bash
  cd /home/leivur/projects/flattennermcbot/ServerModded
  mkfifo server_stdin 2>/dev/null || true
  (tail -f server_stdin | java -Xmx6G -jar server.jar) > mcfarmmanager_verify.log 2>&1 &
  # wait for "Done (" in mcfarmmanager_verify.log, then:
  echo 'some command' > server_stdin
  # to stop cleanly:
  echo 'stop' > server_stdin
  ```
  Always stop the server with `stop` via the pipe (never `kill -9`) so the world saves cleanly.
  Delete `server_stdin` and `mcfarmmanager_verify.log` after each verification session — they are
  scratch files, not part of that project.

### Test rig (disposable, out-of-the-way world fixture)

Used by Tasks 5, 7, 9, 11 for live verification without touching any real build. Located at a
remote, empty sky position far from spawn/any existing builds: **Overworld, x=10000, y=200,
z=10000.**

Setup (send each line through `server_stdin` once the server is up):
```
fill 9998 199 9998 10002 199 10002 minecraft:stone
setblock 9999 200 9999 minecraft:chest
setblock 10000 200 9999 minecraft:barrel
item replace block 9999 200 9999 container.0 with minecraft:iron_ingot 64
item replace block 9999 200 9999 container.1 with minecraft:iron_ingot 64
item replace block 10000 200 9999 container.0 with minecraft:iron_ingot 32
summon minecraft:iron_golem 10000 201 10000 {Tags:["mcfarmmanager_test"]}
summon minecraft:zombie 10001 201 10000 {Tags:["mcfarmmanager_test"]}
player MCFMTestWorker spawn
tp MCFMTestWorker 9999 201 10000
```
`config/mcfarmmanager/farms.json` for verification:
```json
{
  "farms": [
    {
      "id": "test-rig",
      "name": "Test Rig",
      "dimension": "minecraft:overworld",
      "anchor": { "x": 10000, "y": 200, "z": 10000 },
      "entityScanRadius": 16,
      "fakePlayerName": "MCFMTestWorker",
      "storage": [
        { "id": "test-chest", "label": "Test Chest", "position": { "x": 9999, "y": 200, "z": 9999 } },
        { "id": "test-barrel", "label": "Test Barrel", "position": { "x": 10000, "y": 200, "z": 9999 } }
      ]
    }
  ]
}
```
Cleanup (run after each verification session that used the rig, via `server_stdin`):
```
kill @e[tag=mcfarmmanager_test]
player MCFMTestWorker kill
fill 9998 199 9998 10002 201 10002 minecraft:air
```

---

## Task 1: Repo scaffold + buildable mod skeleton

**Files:**
- Create: `mod/build.gradle`, `mod/gradle.properties`, `mod/settings.gradle`, Gradle wrapper files
- Create: `mod/src/main/resources/fabric.mod.json`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerMod.java`
- Create: `.gitignore` additions for Gradle/Loom build artifacts (if not already covered)

**Interfaces:**
- Produces: a Gradle project at `mod/` that builds `mcfarmmanager-1.0.0.jar` via `./gradlew build`.

- [ ] **Step 1: Generate the project skeleton**

Use the Fabric template generator for Minecraft `1.21.11` with Fabric API included, package
`net.mcfarmmanager.mod`, mod name `MCFarmManager`, mod id `mcfarmmanager`. If fetching the
generator programmatically isn't practical, generate it via the generator's documented CLI/API
and inspect the result; otherwise hand-assemble `build.gradle` using Loom plugin id
`net.fabricmc.fabric-loom-remap`, `mappings loom.officialMojangMappings()`, and dependencies:

```gradle
dependencies {
    minecraft "com.mojang:minecraft:1.21.11"
    mappings loom.officialMojangMappings()
    modImplementation "net.fabricmc:fabric-loader:0.19.3"
    modImplementation "net.fabricmc.fabric-api:fabric-api:0.141.3+1.21.11"
    modImplementation "carpet:fabric-carpet:1.21.11-1.4.194+v251223"
    implementation "org.xerial:sqlite-jdbc:3.49.1.0"
    testImplementation platform("org.junit:junit-bom:5.10.2")
    testImplementation "org.junit.jupiter:junit-jupiter"
}
```

Add the Carpet maven repo (`https://masa.dy.fi/maven`) and the sqlite-jdbc dependency to
`repositories`/`dependencies` blocks as needed. Set `sourceCompatibility`/`targetCompatibility` to
`JavaVersion.VERSION_21` and `tasks.withType(JavaCompile) { options.release = 21 }`. Configure the
`test` task to use JUnit Platform (`useJUnitPlatform()`).

- [ ] **Step 2: `fabric.mod.json`**

```json
{
  "schemaVersion": 1,
  "id": "mcfarmmanager",
  "version": "1.0.0",
  "name": "MCFarmManager",
  "description": "Read-only farm observability for Carpet-enabled Fabric servers.",
  "authors": ["leivur"],
  "environment": "server",
  "entrypoints": {
    "main": ["net.mcfarmmanager.mod.MCFarmManagerMod"]
  },
  "depends": {
    "fabricloader": ">=0.19.3",
    "fabric-api": "*",
    "minecraft": "1.21.11",
    "java": ">=21",
    "carpet": "*"
  }
}
```
(The Carpet extension entrypoint key is added in Task 2 once confirmed — do not guess it here.)

- [ ] **Step 3: Minimal mod class**

```java
package net.mcfarmmanager.mod;

import net.fabricmc.api.ModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class MCFarmManagerMod implements ModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("mcfarmmanager");

    @Override
    public void onInitialize() {
        LOGGER.info("MCFarmManager mod loaded (base entrypoint)");
    }
}
```

- [ ] **Step 4: Build**

Run: `cd mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL`, `mod/build/libs/mcfarmmanager-1.0.0.jar` exists.

- [ ] **Step 5: Commit**

```bash
git add mod .gitignore
git commit -m "Add Fabric mod skeleton for MCFarmManager"
```

---

## Task 2: Carpet Extension registration + verify on real server

**Files:**
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerMod.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java`
- Modify: `mod/src/main/resources/fabric.mod.json` (add confirmed Carpet entrypoint key)

**Interfaces:**
- Consumes: nothing new.
- Produces: registered Carpet rule `mcfarmmanagerEnabled` (boolean, default `true`), confirmed
  live on the real server.

- [ ] **Step 1: Discovery (required — do not skip)**

Locate the remapped `fabric-carpet-1.21.11-1.4.194+v251223.jar` in the Gradle/Loom cache after
Task 1's build (search `~/.gradle/caches/fabric-loom/` or the project's own dependency cache).
Run `javap -p` (or extract and read the `.class`/decompile) on the `CarpetExtension` interface to
confirm: its fully-qualified name, its exact methods (rule registration hook, server-loaded hook,
any others), and the `fabric.mod.json` entrypoint key Carpet scans for (historically
`"carpet:carpet_extension"` — confirm, don't assume). Record what you found directly in this
task's commit message or a code comment at the top of `MCFarmManagerExtension.java` (one line:
what class/method signatures you confirmed and how).

- [ ] **Step 2: Implement the extension**

Implement `MCFarmManagerExtension` against the confirmed interface. It must, at minimum:
register a boolean Carpet rule named exactly `mcfarmmanagerEnabled` defaulting to `true`, and log
`"MCFarmManager Carpet extension registered"` at extension-registration time. Wire it up in
`MCFarmManagerMod.onInitialize()` (or wherever the confirmed Carpet registration hook expects it
— e.g. some Carpet versions require registering the extension instance against
`CarpetServer.manageExtension(...)` from a specific lifecycle point; use whatever the real,
confirmed API requires).

Add the confirmed entrypoint key to `fabric.mod.json`'s `"entrypoints"` block, pointing at
`net.mcfarmmanager.mod.MCFarmManagerExtension`.

- [ ] **Step 3: Build**

Run: `cd mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Deploy and verify on the real server**

Copy `mod/build/libs/mcfarmmanager-1.0.0.jar` into
`/home/leivur/projects/flattennermcbot/ServerModded/mods/`. Start the server via the FIFO
procedure in this plan's "Live verification target" section. Confirm in the log: no startup
errors, `"MCFarmManager Carpet extension registered"` appears. Send `carpet mcfarmmanagerEnabled`
through `server_stdin` and confirm the response shows the rule and its default `true`. Stop the
server cleanly (`stop` via the pipe). Remove the jar from that `mods/` folder afterward only if a
later task needs the slot free — otherwise leave it (each later task rebuilds and re-copies it,
overwriting in place is fine, no need to remove between tasks).

- [ ] **Step 5: Commit**

```bash
git add mod
git commit -m "Register MCFarmManager as a Carpet Extension with a test rule"
```

---

## Task 3: Farm config loader + validation + unit tests

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfig.java` (record, per Global Constraints)
- Create: `mod/src/main/java/net/mcfarmmanager/mod/config/StorageConfig.java` (record)
- Create: `mod/src/main/java/net/mcfarmmanager/mod/config/Position.java` (record)
- Create: `mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfigLoader.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/config/FarmConfigException.java`
- Test: `mod/src/test/java/net/mcfarmmanager/mod/config/FarmConfigLoaderTest.java`

**Interfaces:**
- Consumes: nothing new (pure JSON parsing, Gson).
- Produces: `FarmConfigLoader.load(Path jsonFile) -> List<FarmConfig>` throwing
  `FarmConfigException` (with a clear `getMessage()`) on any validation failure. Later tasks
  (4, 6) consume `List<FarmConfig>` and the `FarmConfig`/`StorageConfig`/`Position` records
  exactly as named in Global Constraints.

- [ ] **Step 1: Write the records**

```java
package net.mcfarmmanager.mod.config;

public record Position(int x, int y, int z) {}
```
```java
package net.mcfarmmanager.mod.config;

public record StorageConfig(String id, String label, Position position) {}
```
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
    List<StorageConfig> storage
) {}
```
```java
package net.mcfarmmanager.mod.config;

public class FarmConfigException extends RuntimeException {
    public FarmConfigException(String message) { super(message); }
}
```

- [ ] **Step 2: Write the failing tests**

```java
package net.mcfarmmanager.mod.config;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FarmConfigLoaderTest {

    private Path writeTemp(String json) throws IOException {
        Path file = Files.createTempFile("farms", ".json");
        Files.writeString(file, json);
        return file;
    }

    @Test
    void loadsValidConfig() throws IOException {
        String json = """
            { "farms": [ {
              "id": "iron", "name": "Iron Farm", "dimension": "minecraft:overworld",
              "anchor": { "x": 120, "y": 80, "z": -500 }, "entityScanRadius": 32,
              "fakePlayerName": "Worker-Iron",
              "storage": [ { "id": "main-chest", "label": "Main output",
                "position": { "x": 123, "y": 79, "z": -501 } } ]
            } ] }
            """;
        List<FarmConfig> farms = FarmConfigLoader.load(writeTemp(json));
        assertEquals(1, farms.size());
        assertEquals("iron", farms.get(0).id());
        assertEquals(32, farms.get(0).entityScanRadius());
        assertEquals(1, farms.get(0).storage().size());
    }

    @Test
    void nullFakePlayerNameIsAllowed() throws IOException {
        String json = """
            { "farms": [ {
              "id": "iron", "name": "Iron Farm", "dimension": "minecraft:overworld",
              "anchor": { "x": 0, "y": 0, "z": 0 }, "entityScanRadius": 10,
              "storage": []
            } ] }
            """;
        List<FarmConfig> farms = FarmConfigLoader.load(writeTemp(json));
        assertNull(farms.get(0).fakePlayerName());
    }

    @Test
    void rejectsDuplicateFarmIds() throws IOException {
        String json = """
            { "farms": [
              { "id": "iron", "name": "A", "dimension": "minecraft:overworld",
                "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] },
              { "id": "iron", "name": "B", "dimension": "minecraft:overworld",
                "anchor": {"x":1,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] }
            ] }
            """;
        FarmConfigException ex = assertThrows(FarmConfigException.class,
            () -> FarmConfigLoader.load(writeTemp(json)));
        assertTrue(ex.getMessage().contains("duplicate"));
    }

    @Test
    void rejectsEmptyFarmId() throws IOException {
        String json = """
            { "farms": [ { "id": "", "name": "A", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsMissingRequiredField() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsUnknownDimension() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "name": "A", "dimension": "minecraft:not_a_real_dim",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsNonPositiveEntityScanRadius() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "name": "A", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 0, "storage": [] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsDuplicateStoragePositionsWithinAFarm() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "name": "A", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10,
              "storage": [
                { "id": "a", "label": "A", "position": {"x":1,"y":1,"z":1} },
                { "id": "b", "label": "B", "position": {"x":1,"y":1,"z":1} }
              ] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsMalformedJson() throws IOException {
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp("{ not json")));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.config.FarmConfigLoaderTest"`
Expected: FAIL (compile error — `FarmConfigLoader` doesn't exist yet).

- [ ] **Step 3: Implement `FarmConfigLoader`**

Validation rules to implement, from `docs/SPEC.md`: `id` unique and non-empty across all farms;
`name` non-empty; `dimension` must be one of `minecraft:overworld`, `minecraft:the_nether`,
`minecraft:the_end` (the loader has no live `MinecraftServer` to ask, so validate against this
fixed known set of vanilla dimension ids — this is a deliberate simplification since farms.json
is loaded before any live registry is guaranteed available; note this in a one-line comment);
`entityScanRadius` positive (> 0); `storage[].position` distinct per farm (compare by
`Position.equals`); `fakePlayerName` may be absent/null. On any violation, or malformed JSON,
throw `FarmConfigException` with a message naming the specific problem (e.g.
`"duplicate farm id: iron"`).

```java
package net.mcfarmmanager.mod.config;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class FarmConfigLoader {
    private static final Set<String> VALID_DIMENSIONS = Set.of(
        "minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"
    );

    private FarmConfigLoader() {}

    private record FarmsFile(List<FarmConfig> farms) {}

    public static List<FarmConfig> load(Path jsonFile) {
        String content;
        try {
            content = Files.readString(jsonFile);
        } catch (IOException e) {
            throw new FarmConfigException("could not read farms.json: " + e.getMessage());
        }

        FarmsFile parsed;
        try {
            parsed = new Gson().fromJson(content, FarmsFile.class);
        } catch (JsonSyntaxException e) {
            throw new FarmConfigException("malformed farms.json: " + e.getMessage());
        }
        if (parsed == null || parsed.farms() == null) {
            throw new FarmConfigException("malformed farms.json: missing \"farms\" array");
        }

        Set<String> seenIds = new HashSet<>();
        for (FarmConfig farm : parsed.farms()) {
            validate(farm, seenIds);
        }
        return parsed.farms();
    }

    private static void validate(FarmConfig farm, Set<String> seenIds) {
        if (farm.id() == null || farm.id().isEmpty()) {
            throw new FarmConfigException("farm id must be non-empty");
        }
        if (!seenIds.add(farm.id())) {
            throw new FarmConfigException("duplicate farm id: " + farm.id());
        }
        if (farm.name() == null || farm.name().isEmpty()) {
            throw new FarmConfigException("farm " + farm.id() + ": name must be non-empty");
        }
        if (farm.dimension() == null || !VALID_DIMENSIONS.contains(farm.dimension())) {
            throw new FarmConfigException("farm " + farm.id() + ": unknown dimension: " + farm.dimension());
        }
        if (farm.anchor() == null) {
            throw new FarmConfigException("farm " + farm.id() + ": missing anchor");
        }
        if (farm.entityScanRadius() <= 0) {
            throw new FarmConfigException("farm " + farm.id() + ": entityScanRadius must be positive");
        }
        if (farm.storage() == null) {
            throw new FarmConfigException("farm " + farm.id() + ": storage array is required (may be empty)");
        }
        Set<Position> seenPositions = new HashSet<>();
        for (StorageConfig storage : farm.storage()) {
            if (storage.id() == null || storage.id().isEmpty()) {
                throw new FarmConfigException("farm " + farm.id() + ": storage entry missing id");
            }
            if (!seenPositions.add(storage.position())) {
                throw new FarmConfigException("farm " + farm.id() + ": duplicate storage position: " + storage.position());
            }
        }
    }
}
```

Note: the `rejectsMissingRequiredField` test (missing `name`) relies on Gson leaving `name()` as
`null` for a record field absent from JSON — confirm this is Gson's actual behavior for records
during implementation (Gson supports records since 2.10; if the project's Gson version predates
records support, use a plain class with a no-args constructor + setters instead of a record for
the Gson-deserialization target, and map to the `FarmConfig` record afterward). Adjust the
implementation, not the test's intent, if this surfaces.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.config.FarmConfigLoaderTest"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add mod
git commit -m "Add farms.json loader with validation and unit tests"
```

---

## Task 4: FarmDataProvider interface + real implementation

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/data/EntityInfo.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/data/ItemStackInfo.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/data/StorageInfo.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/data/FakePlayerStatus.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/data/FarmDataProvider.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/data/RealFarmDataProvider.java`

**Interfaces:**
- Consumes: `FarmConfig`, `StorageConfig`, `Position` from Task 3.
- Produces: `FarmDataProvider` interface and `RealFarmDataProvider` implementation, consumed by
  Task 5 (debug command), Task 6 (HTTP), Task 8 (sampler).

- [ ] **Step 1: Records and interface**

```java
package net.mcfarmmanager.mod.data;

public record ItemStackInfo(String itemId, int count) {}
```
```java
package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.Position;

public record EntityInfo(String id, String type, String customName, Position position, double health) {}
```
```java
package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.Position;
import java.util.List;

public record StorageInfo(String id, String label, Position position, int capacity, List<ItemStackInfo> items) {}
```
```java
package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.Position;

public record FakePlayerStatus(String name, boolean online, Position position) {}
```
```java
package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.FarmConfig;
import java.util.List;

public interface FarmDataProvider {
    List<EntityInfo> entities(FarmConfig farm);
    List<StorageInfo> storage(FarmConfig farm);
    boolean chunkLoaded(FarmConfig farm);
    FakePlayerStatus fakePlayer(FarmConfig farm);
}
```

- [ ] **Step 2: Discovery for the real implementation (required)**

Against the Task 1/2 remapped Minecraft + fabric-carpet jars, confirm (via `javap -p` or reading
decompiled/mapped source, per this plan's Global Constraints discipline — do not guess):
- How to get a `ServerWorld` for a given dimension id from a `MinecraftServer` (e.g.
  `server.getWorld(RegistryKey<World>)`, confirm exact method/registry-key construction for
  official mappings).
- How to query entities in a bounding box around a point (e.g.
  `ServerWorld.getEntitiesByClass(...)` or `getOtherEntities(...)` — confirm exact signature).
- How to read a `BlockEntity`'s inventory directly without simulating a player interaction (e.g.
  cast to `Inventory` / `SidedInventory` and read `getStack(slot)` / `size()` — confirm exact
  types for chest, barrel, trapped chest, shulker box, hopper, dispenser, dropper; nested shulker
  boxes inside a chest slot are summarized by item id only, per `docs/SPEC.md` — do not recurse
  into their contents).
- How to check chunk-loaded state for a position (e.g. `ServerWorld.isChunkLoaded(ChunkPos)` or
  equivalent — confirm).
- How to enumerate Carpet fake players and confirm a given name is a fake player (Carpet's
  `EntityPlayerMPFake` or equivalent — confirm the exact class in this Carpet version, and how to
  get its position).

Record what you confirmed in a one-line comment atop `RealFarmDataProvider.java`.

- [ ] **Step 3: Implement `RealFarmDataProvider`**

Implement against the confirmed APIs from Step 2. Constructor takes whatever server handle(s) the
confirmed API needs (likely a `MinecraftServer` or a `Supplier<MinecraftServer>` if the server
instance isn't available at construction time — your call based on the extension's lifecycle
hook confirmed in Task 2). Follow the read-only rule from Global Constraints strictly: only
getters/read methods, never `setStack`, never `breakBlock`, never any interaction-packet method.

- [ ] **Step 4: Build**

Run: `cd mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
git add mod
git commit -m "Add FarmDataProvider interface and real Minecraft-backed implementation"
```

---

## Task 5: Debug command + live verification against the real server

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/DebugCommand.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerMod.java` (wire config loading + command registration)

**Interfaces:**
- Consumes: `FarmConfigLoader`, `FarmConfig` (Task 3), `FarmDataProvider`/`RealFarmDataProvider`
  (Task 4).
- Produces: confirmation, on a real server, that farm reads return correct data — this is the
  gate before Task 6 builds a network layer on top.

- [ ] **Step 1: Wire config loading at startup**

In `MCFarmManagerMod.onInitialize()` (or the Carpet extension's server-loaded hook confirmed in
Task 2 — whichever actually has access to `FabricLoader.getInstance().getConfigDir()` and, if
needed, the live server), load
`FabricLoader.getInstance().getConfigDir().resolve("mcfarmmanager/farms.json")` via
`FarmConfigLoader.load(...)`. On `FarmConfigException`, log the message clearly at `ERROR` level
and disable the mod's further behavior (do not throw past this point — per `docs/SPEC.md`, a
malformed config must not crash the server). Store the loaded `List<FarmConfig>` for later use.

- [ ] **Step 2: Temporary debug command**

Register a `/mcfarmmanager debug <farmId>` command (Brigadier, via Fabric's command registration
callback) that looks up the `FarmConfig` by id from the loaded list (404-equivalent: send a chat
error if not found), calls all four `FarmDataProvider` methods against it, and logs the full
result to the server log at `INFO` level (entity count + types, storage counts by item, chunk
loaded, fake player status).

- [ ] **Step 3: Build and place the test rig**

Run: `cd mod && ./gradlew build`. Copy the jar to
`/home/leivur/projects/flattennermcbot/ServerModded/mods/` (overwriting the Task 2 copy). Write
this plan's test-rig `farms.json` to
`/home/leivur/projects/flattennermcbot/ServerModded/config/mcfarmmanager/farms.json`. Start the
server via the FIFO procedure, run the test-rig **Setup** commands from this plan's "Live
verification target" section through `server_stdin`.

- [ ] **Step 4: Verify**

Send `mcfarmmanager debug test-rig` through `server_stdin`. Confirm in the log: 2 entities
(1 iron_golem, 1 zombie), storage totals matching what was placed (96 iron ingots across the two
containers, or whatever exact counts Step 3's `item replace` commands produced), chunk loaded
`true`, fake player `MCFMTestWorker` online `true` with a position near the rig. If any of these
are wrong, fix `RealFarmDataProvider` (this is exactly the kind of bug this step exists to catch)
and re-verify before moving on.

Run the test-rig **Cleanup** commands, then stop the server (`stop` via the pipe). Delete
`server_stdin` and the verification log.

- [ ] **Step 5: Commit**

```bash
git add mod
git commit -m "Add temporary debug command; verified farm reads against real server"
```

---

## Task 6: HTTP API (all endpoints except history) + unit tests

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/server/PlayerInfo.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/server/DimensionState.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/server/PerformanceInfo.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/server/StatusInfo.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/server/ServerDataProvider.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/server/RealServerDataProvider.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/FarmSummary.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/FarmDetail.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerMod.java` (start HTTP server bound to Carpet rules)
- Test: `mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java`
- Test: `mod/src/test/java/net/mcfarmmanager/mod/http/FakeFarmDataProvider.java` (test double)
- Test: `mod/src/test/java/net/mcfarmmanager/mod/http/FakeServerDataProvider.java` (test double)

**Interfaces:**
- Consumes: `FarmConfig`, `FarmDataProvider` (Tasks 3-4); adds `ServerDataProvider`,
  `RealServerDataProvider` per Global Constraints.
- Produces: `MCFarmManagerHttpServer` — a class wrapping `com.sun.net.httpserver.HttpServer`,
  constructible with `(List<FarmConfig> farms, FarmDataProvider farmData, ServerDataProvider serverData, int port, String bindAddress)`,
  with `start()`/`stop()` methods. Task 8 adds one more endpoint to this same class; Task 10 adds
  static-file serving to this same instance.

- [ ] **Step 1: New Carpet rules**

Register these Carpet rules alongside `mcfarmmanagerEnabled` from Task 2:
`mcfarmmanagerHttpPort` (int, default `8642`), `mcfarmmanagerHttpBindAddress` (string, default
`"0.0.0.0"`). (`mcfarmmanagerSampleIntervalMinutes` and `mcfarmmanagerHistoryRetentionDays` are
added in Task 8, not here.)

- [ ] **Step 2: `ServerDataProvider` records and interface**

```java
package net.mcfarmmanager.mod.server;

import net.mcfarmmanager.mod.config.Position;

public record PlayerInfo(String name, String dimension, Position position, String gamemode) {}
```
```java
package net.mcfarmmanager.mod.server;

public record DimensionState(String dimension, long timeOfDay, long dayCount, boolean raining, boolean thundering, String difficulty, int loadedChunkCount) {}
```
```java
package net.mcfarmmanager.mod.server;

public record PerformanceInfo(double tps, double meanTickTimeMs, int sampledOverTicks) {}
```
```java
package net.mcfarmmanager.mod.server;

public record StatusInfo(String modVersion, String minecraftVersion, String carpetVersion, long uptimeSeconds, int farmCount) {}
```
```java
package net.mcfarmmanager.mod.server;

import java.util.List;

public interface ServerDataProvider {
    List<PlayerInfo> players();
    List<DimensionState> worldState();
    PerformanceInfo performance();
    StatusInfo status(int farmCount);
}
```

Discovery required for `RealServerDataProvider` (same discipline as Task 4 Step 2): confirm how
to enumerate real (non-fake) online players and exclude Carpet fake players; confirm
`server.getTicks()`/day-count and per-`ServerWorld` weather/difficulty accessors; confirm Carpet's
existing tick-timing tracking API (`CarpetServer` / `TickSpeed` or the confirmed equivalent in
`1.4.194+v251223`) for `/performance` — do not reimplement tick-timing math by hand.

- [ ] **Step 3: `FarmSummary`/`FarmDetail` (HTTP-shape records, distinct from the plain data records)**

```java
package net.mcfarmmanager.mod.http;

public record FarmSummary(String id, String name, String dimension, int entityCount, int storageItemCount, boolean chunkLoaded, boolean fakePlayerOnline) {}
```
```java
package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.data.EntityInfo;
import net.mcfarmmanager.mod.data.FakePlayerStatus;
import net.mcfarmmanager.mod.data.StorageInfo;
import java.util.List;

public record FarmDetail(String id, String name, String dimension, Position anchor, boolean chunkLoaded, FakePlayerStatus fakePlayer, List<EntityInfo> entities, List<StorageInfo> storage) {}
```

- [ ] **Step 4: Write the failing tests**

```java
package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.config.StorageConfig;
import net.mcfarmmanager.mod.data.EntityInfo;
import net.mcfarmmanager.mod.data.FakePlayerStatus;
import net.mcfarmmanager.mod.data.ItemStackInfo;
import net.mcfarmmanager.mod.data.StorageInfo;

import java.util.List;
import java.util.Map;

class FakeFarmDataProvider implements net.mcfarmmanager.mod.data.FarmDataProvider {
    @Override
    public List<EntityInfo> entities(FarmConfig farm) {
        return List.of(new EntityInfo("uuid-1", "minecraft:iron_golem", null, new Position(121, 80, -499), 100.0));
    }
    @Override
    public List<StorageInfo> storage(FarmConfig farm) {
        return farm.storage().stream()
            .map(s -> new StorageInfo(s.id(), s.label(), s.position(), 27,
                List.of(new ItemStackInfo("minecraft:iron_ingot", 1728))))
            .toList();
    }
    @Override
    public boolean chunkLoaded(FarmConfig farm) { return true; }
    @Override
    public FakePlayerStatus fakePlayer(FarmConfig farm) {
        if (farm.fakePlayerName() == null) return null;
        return new FakePlayerStatus(farm.fakePlayerName(), true, new Position(118, 81, -498));
    }
}
```
```java
package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.server.DimensionState;
import net.mcfarmmanager.mod.server.PerformanceInfo;
import net.mcfarmmanager.mod.server.PlayerInfo;
import net.mcfarmmanager.mod.server.StatusInfo;

import java.util.List;

class FakeServerDataProvider implements net.mcfarmmanager.mod.server.ServerDataProvider {
    @Override
    public List<PlayerInfo> players() {
        return List.of(new PlayerInfo("leivur", "minecraft:overworld", new net.mcfarmmanager.mod.config.Position(0, 70, 0), "survival"));
    }
    @Override
    public List<DimensionState> worldState() {
        return List.of(new DimensionState("minecraft:overworld", 13452, 47, false, false, "hard", 812));
    }
    @Override
    public PerformanceInfo performance() { return new PerformanceInfo(19.87, 47.3, 100); }
    @Override
    public StatusInfo status(int farmCount) { return new StatusInfo("1.0.0", "1.21.11", "1.4.194", 3600, farmCount); }
}
```
```java
package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.config.StorageConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MCFarmManagerHttpServerTest {
    private MCFarmManagerHttpServer server;
    private int port;
    private HttpClient client = HttpClient.newHttpClient();

    private List<FarmConfig> farms() {
        return List.of(new FarmConfig("iron", "Iron Farm", "minecraft:overworld",
            new Position(120, 80, -500), 32, "Worker-Iron",
            List.of(new StorageConfig("main-chest", "Main output", new Position(123, 79, -501)))));
    }

    @BeforeEach
    void start() throws IOException {
        server = new MCFarmManagerHttpServer(farms(), new FakeFarmDataProvider(), new FakeServerDataProvider(), 0, "127.0.0.1");
        server.start();
        port = server.boundPort();
    }

    @AfterEach
    void stop() { server.stop(); }

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void farmsListReturnsSummaries() throws Exception {
        HttpResponse<String> response = get("/farms");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"id\":\"iron\""));
        assertTrue(response.body().contains("\"entityCount\":1"));
        assertTrue(response.body().contains("\"storageItemCount\":1728"));
    }

    @Test
    void farmDetailReturnsFullShape() throws Exception {
        HttpResponse<String> response = get("/farms/iron");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"fakePlayer\""));
        assertTrue(response.body().contains("\"entities\""));
        assertTrue(response.body().contains("\"storage\""));
    }

    @Test
    void unknownFarmReturns404() throws Exception {
        HttpResponse<String> response = get("/farms/does-not-exist");
        assertEquals(404, response.statusCode());
        assertTrue(response.body().contains("unknown farm: does-not-exist"));
    }

    @Test
    void playersEndpoint() throws Exception {
        HttpResponse<String> response = get("/players");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"name\":\"leivur\""));
    }

    @Test
    void worldEndpoint() throws Exception {
        HttpResponse<String> response = get("/world");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"dimension\":\"minecraft:overworld\""));
    }

    @Test
    void performanceEndpoint() throws Exception {
        HttpResponse<String> response = get("/performance");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"tps\":19.87"));
    }

    @Test
    void statusEndpoint() throws Exception {
        HttpResponse<String> response = get("/status");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"farmCount\":1"));
    }
}
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.http.MCFarmManagerHttpServerTest"`
Expected: FAIL (compile error — `MCFarmManagerHttpServer` doesn't exist yet).

- [ ] **Step 6: Implement `MCFarmManagerHttpServer`**

Build on `com.sun.net.httpserver.HttpServer.create(new InetSocketAddress(bindAddress, port), 0)`.
Register one `HttpHandler` per route listed in `docs/SPEC.md`'s "HTTP API" section:
`/farms`, `/farms/{id}`, `/farms/{id}/history` (Task 8 fills this handler in — for this task,
route it but respond `501`/not-yet-implemented is NOT acceptable per "No Placeholders"; instead,
skip registering this specific route in this task and add it in Task 8 alongside its real
implementation), `/players`, `/world`, `/performance`, `/status`. Use Gson to serialize the
records from Global Constraints directly (field names already match `docs/SPEC.md`'s JSON via
Java record component names — no custom `@SerializedName` needed given the naming chosen).
`/farms/{id}` and its history sibling parse the id from the path; an id not present in the
`List<FarmConfig>` responds `404` with body `{"error": "unknown farm: <id>"}`. All other routes
return `application/json`. Add a `boundPort()` accessor (needed because tests bind to port `0` and
must discover the OS-assigned port) and `start()`/`stop()` lifecycle methods.

Wire this into `MCFarmManagerMod`: once config is loaded (Task 5) and a `MinecraftServer` handle
is available (confirm the right lifecycle hook — likely Carpet's/Fabric's server-started event),
construct `RealServerDataProvider`, then `MCFarmManagerHttpServer` bound to the
`mcfarmmanagerHttpPort`/`mcfarmmanagerHttpBindAddress` rule values, and call `start()`. Only start
if `mcfarmmanagerEnabled` is `true`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.http.MCFarmManagerHttpServerTest"`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add mod
git commit -m "Add embedded HTTP API for farms/players/world/performance/status"
```

---

## Task 7: Manual verification of HTTP endpoints against the real server

**Files:** none (verification only); may fix bugs found in `mod/src/main/java/net/mcfarmmanager/mod/http/` or `.../server/` if any surface.

**Interfaces:** none new.

- [ ] **Step 1: Remove the now-superseded debug command**

Delete `mod/src/main/java/net/mcfarmmanager/mod/DebugCommand.java` and its registration in
`MCFarmManagerMod` (Task 5's throwaway command — HTTP now covers the same checks with a real
network layer).

- [ ] **Step 2: Build, deploy, start**

Run: `cd mod && ./gradlew build`. Copy the jar to
`/home/leivur/projects/flattennermcbot/ServerModded/mods/` (overwrite). Re-place the test-rig
`farms.json` (Task 5's config) and re-run the test-rig **Setup** commands via `server_stdin`
(Task 5's cleanup already ran, so the rig no longer exists in the world — recreate it).

- [ ] **Step 3: curl every endpoint**

```bash
curl -s http://localhost:8642/farms
curl -s http://localhost:8642/farms/test-rig
curl -s http://localhost:8642/farms/does-not-exist
curl -s http://localhost:8642/players
curl -s http://localhost:8642/world
curl -s http://localhost:8642/performance
curl -s http://localhost:8642/status
```
Confirm each response's JSON shape matches `docs/SPEC.md` exactly (same field names/nesting), that
`/farms` and `/farms/test-rig` reflect the rig's actual entity/storage counts, and that
`/farms/does-not-exist` returns HTTP `404` with `{"error": "unknown farm: does-not-exist"}`. Fix
any mismatch in the implementation (not by editing the spec) and re-curl until all match.

- [ ] **Step 4: Cleanup**

Run the test-rig **Cleanup** commands via `server_stdin`, stop the server (`stop` via the pipe),
delete `server_stdin` and the verification log.

- [ ] **Step 5: Commit**

```bash
git add mod
git commit -m "Remove superseded debug command; HTTP endpoints verified against real server"
```

---

## Task 8: SQLite history (schema, sampler, pruning, history endpoint)

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/history/HistorySample.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/history/HistoryStore.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/history/SqliteHistoryStore.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/history/FarmSampler.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java` (add `/farms/{id}/history` route)
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerMod.java` (wire sampler + history store lifecycle)
- Test: `mod/src/test/java/net/mcfarmmanager/mod/history/SqliteHistoryStoreTest.java`

**Interfaces:**
- Consumes: `FarmDataProvider`/`FarmConfig` (Tasks 3-4) for the sampler; `MCFarmManagerHttpServer`
  (Task 6) for the new route.
- Produces: `HistoryStore` interface + `SqliteHistoryStore` implementation, consumed by the new
  HTTP route and by `FarmSampler`.

- [ ] **Step 1: New Carpet rules**

Register `mcfarmmanagerSampleIntervalMinutes` (int, default `5`) and
`mcfarmmanagerHistoryRetentionDays` (int, default `30`) alongside the existing rules.

- [ ] **Step 2: `HistorySample` record + `HistoryStore` interface**

```java
package net.mcfarmmanager.mod.history;

import java.util.Map;

public record HistorySample(long sampledAtMillis, Map<String, Integer> entityCounts, Map<String, Integer> storageCounts) {}
```
```java
package net.mcfarmmanager.mod.history;

import java.util.List;
import java.util.Map;

public interface HistoryStore {
    void recordSample(String farmId, long sampledAtMillis, Map<String, Integer> entityCounts, Map<String, Integer> storageCounts);
    List<HistorySample> query(String farmId, long sinceMillis);
    void pruneOlderThan(long cutoffMillis);
}
```

- [ ] **Step 3: Write the failing test**

```java
package net.mcfarmmanager.mod.history;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SqliteHistoryStoreTest {
    private Path dbFile;
    private SqliteHistoryStore store;

    @BeforeEach
    void setUp() throws IOException {
        dbFile = Files.createTempFile("history", ".sqlite");
        Files.delete(dbFile);
        store = new SqliteHistoryStore(dbFile);
    }

    @AfterEach
    void tearDown() throws IOException {
        store.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void recordsAndQueriesSamples() {
        store.recordSample("iron", 1000L, Map.of("minecraft:iron_golem", 4), Map.of("minecraft:iron_ingot", 1620));
        store.recordSample("iron", 2000L, Map.of("minecraft:iron_golem", 5), Map.of("minecraft:iron_ingot", 1700));
        store.recordSample("gold", 1500L, Map.of("minecraft:zombified_piglin", 2), Map.of("minecraft:gold_ingot", 40));

        List<HistorySample> ironSamples = store.query("iron", 0L);
        assertEquals(2, ironSamples.size());
        assertEquals(4, ironSamples.get(0).entityCounts().get("minecraft:iron_golem"));
        assertEquals(1700, ironSamples.get(1).storageCounts().get("minecraft:iron_ingot"));
    }

    @Test
    void queryFiltersBySinceMillis() {
        store.recordSample("iron", 1000L, Map.of(), Map.of());
        store.recordSample("iron", 5000L, Map.of(), Map.of());
        assertEquals(1, store.query("iron", 4000L).size());
    }

    @Test
    void pruneRemovesOldRowsOnly() {
        store.recordSample("iron", 1000L, Map.of(), Map.of());
        store.recordSample("iron", 9000L, Map.of(), Map.of());
        store.pruneOlderThan(5000L);
        assertEquals(1, store.query("iron", 0L).size());
        assertEquals(9000L, store.query("iron", 0L).get(0).sampledAtMillis());
    }

    @Test
    void schemaCreationIsIdempotent() {
        // Re-opening the same file must not fail even though the schema already exists.
        store.close();
        SqliteHistoryStore reopened = new SqliteHistoryStore(dbFile);
        reopened.recordSample("iron", 1000L, Map.of(), Map.of());
        assertEquals(1, reopened.query("iron", 0L).size());
        reopened.close();
    }
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.history.SqliteHistoryStoreTest"`
Expected: FAIL (compile error).

- [ ] **Step 5: Implement `SqliteHistoryStore`**

Use the exact schema from `docs/SPEC.md`:
```sql
CREATE TABLE IF NOT EXISTS farm_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id TEXT NOT NULL,
  sampled_at INTEGER NOT NULL,
  entity_counts_json TEXT NOT NULL,
  storage_counts_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_farm_samples_farm_time ON farm_samples (farm_id, sampled_at);
```
Open via JDBC URL `jdbc:sqlite:<path>`, run the schema DDL on construction (idempotent — `IF NOT
EXISTS` makes re-running safe across restarts). Serialize `entity_counts_json`/
`storage_counts_json` with Gson from `Map<String,Integer>`. `query(farmId, sinceMillis)` orders by
`sampled_at ASC`. `pruneOlderThan(cutoffMillis)` deletes rows with `sampled_at < cutoffMillis`.
Add a `close()` method that closes the JDBC connection (needed by the test's `@AfterEach` and by
clean mod shutdown).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.history.SqliteHistoryStoreTest"`
Expected: all PASS.

- [ ] **Step 7: `FarmSampler` (tick-driven, no test — needs a live server; covered by Task 9)**

Discovery required: confirm the exact Fabric API event for end-of-server-tick (`docs/SPEC.md`
names `ServerTickEvents.END_SERVER_TICK` — confirm this class/method still exists in Fabric API
`0.141.3+1.21.11`, adjust only if it has moved). Implement `FarmSampler` with a tick counter that
fires every `mcfarmmanagerSampleIntervalMinutes * 60 * 20` ticks: for each configured farm, call
the *same* `FarmDataProvider.entities`/`storage` methods `/farms/{id}` already uses (do not write
a second query path — aggregate the returned `EntityInfo`/`StorageInfo` lists into
`Map<String,Integer>` counts by type/item id), call `HistoryStore.recordSample(...)`, then call
`HistoryStore.pruneOlderThan(...)` using `mcfarmmanagerHistoryRetentionDays`. Wire it into the
tick event registration in `MCFarmManagerMod`, only when `mcfarmmanagerEnabled` is `true`. Store
history at `<world save dir>/mcfarmmanager/history.sqlite` via
`server.getSavePath(WorldSavePath.ROOT).resolve("mcfarmmanager/history.sqlite")` (confirm this
exact API against the real jars, per Global Constraints discipline), creating the parent
directory if absent.

- [ ] **Step 8: `/farms/{id}/history` endpoint**

Add the route to `MCFarmManagerHttpServer`: parse `range` query param (`1h`, `24h`, `7d`, `30d`,
`all`, default `24h`), convert to a `sinceMillis` cutoff from current time, call
`HistoryStore.query(farmId, sinceMillis)`, respond with the exact shape from `docs/SPEC.md`:
```json
{ "farmId": "iron", "range": "24h", "samples": [ { "sampledAt": "<ISO-8601>", "entityCounts": {}, "storageCounts": {} } ] }
```
(`sampledAt` is `sampledAtMillis` formatted as ISO-8601 UTC, e.g. via
`Instant.ofEpochMilli(millis).toString()`.) Unknown farm id: same `404` shape as other farm
routes.

- [ ] **Step 9: Build**

Run: `cd mod && ./gradlew build`
Expected: `BUILD SUCCESSFUL`, all existing tests still pass.

- [ ] **Step 10: Commit**

```bash
git add mod
git commit -m "Add SQLite-backed farm history: sampler, pruning, history endpoint"
```

---

## Task 9: Live verification of history sampling and pruning

**Files:** none (verification only); may fix bugs found in Task 8's implementation if any surface.

**Interfaces:** none new.

- [ ] **Step 1: Deploy with a fast sample interval**

Build and copy the jar as in prior tasks. Re-place the test-rig `farms.json` and re-run the
test-rig **Setup** commands. Start the server via the FIFO procedure. Once up, send through
`server_stdin`:
```
carpet mcfarmmanagerSampleIntervalMinutes 0
```
(If Carpet rejects `0` as below a validated minimum, use whatever the smallest accepted value is
— note it and adjust the wait time in Step 2 accordingly. The point is a short-enough interval to
observe multiple samples land within a couple of minutes of real wait time, not real 5-minute
cycles.)

- [ ] **Step 2: Confirm rows accumulate**

Wait for at least 2-3 sample cycles at the lowered interval. Inspect the SQLite file directly:
```bash
sqlite3 /home/leivur/projects/flattennermcbot/ServerModded/world/mcfarmmanager/history.sqlite \
  "SELECT farm_id, sampled_at, entity_counts_json, storage_counts_json FROM farm_samples ORDER BY sampled_at;"
```
Confirm rows exist for `test-rig` with plausible counts. Then `curl -s
"http://localhost:8642/farms/test-rig/history?range=all"` and confirm the same samples are
returned in the documented JSON shape.

- [ ] **Step 3: Confirm pruning**

Send through `server_stdin`: `carpet mcfarmmanagerHistoryRetentionDays 0`. Wait one more sample
cycle (pruning runs after each sample, per `docs/SPEC.md`). Re-run the `sqlite3` query from Step 2
and confirm only very recent rows (from the cycle that just ran) remain — older rows accumulated
in Step 2 are gone.

- [ ] **Step 4: Reset and clean up**

Send through `server_stdin`:
```
carpet mcfarmmanagerSampleIntervalMinutes 5
carpet mcfarmmanagerHistoryRetentionDays 30
```
Confirm neither `farms.example.json` nor any code default was ever changed (Steps 1-3 only ever
touched live Carpet rule values, not files) — this is a live-rule-only test by construction, so
there is nothing to revert in the repo. Run the test-rig **Cleanup** commands, stop the server,
delete `server_stdin`/log, and additionally delete the test `history.sqlite` file created under
that server's `world/mcfarmmanager/` directory (it's test data, not part of that project).

- [ ] **Step 5: Commit**

Only if Step 2/3 surfaced a bug fix in Task 8's code:
```bash
git add mod
git commit -m "Fix history sampler/pruning issue found during live verification"
```
If no code changed, there is nothing to commit for this task — note that in the task report.

---

## Task 10: Dashboard (static HTML/CSS/vanilla JS)

**Files:**
- Create: `dashboard/index.html`
- Create: `dashboard/style.css`
- Create: `dashboard/app.js`
- Create: `dashboard/chart.js` (the hand-rolled SVG line-chart function)
- Modify: `mod/build.gradle` (include `../dashboard` as a resource source, or copy it into
  `mod/src/main/resources/dashboard/` at build time — pick whichever the generated Gradle setup
  makes simpler; if copying, add a `processResources` task step, not a manual pre-build copy step
  a developer has to remember)
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java` (serve
  static files from the bundled `dashboard/` resources on `/` and its asset paths)

**Interfaces:**
- Consumes: the 6 JSON endpoints from Tasks 6 and 8, called from `app.js` via `fetch()`.
- Produces: a working dashboard, verified in Task 11.

- [ ] **Step 1: Static file serving**

Add a catch-all `HttpHandler` (registered last / as the context root `"/"`) to
`MCFarmManagerHttpServer` that maps a request path to a bundled classpath resource under
`/dashboard/...` (e.g. `/` → `/dashboard/index.html`, `/style.css` → `/dashboard/style.css`),
reads it via `getClass().getResourceAsStream(...)`, and writes it with the correct `Content-Type`
(`text/html`, `text/css`, `application/javascript` based on extension). Unknown paths under `/`
that don't match a known API route or a known asset: `404` plain response (not JSON — this is
the static-file path, not the API).

- [ ] **Step 2: `index.html` — three views in one page (client-side view switch, no router library)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MCFarmManager</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <nav>
    <button data-view="overview" class="active">Overview</button>
    <button data-view="server">Server</button>
  </nav>
  <main>
    <section id="view-overview"><div id="farm-cards"></div></section>
    <section id="view-farm-detail" hidden>
      <button id="back-to-overview">&larr; Back</button>
      <h2 id="detail-name"></h2>
      <div id="detail-body"></div>
    </section>
    <section id="view-server" hidden>
      <div id="server-body"></div>
    </section>
  </main>
  <script src="/chart.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: `chart.js` — hand-rolled inline SVG line chart**

```javascript
function renderLineChart(points, { width = 480, height = 160, padding = 24 } = {}) {
  if (points.length === 0) {
    return '<svg width="' + width + '" height="' + height + '"></svg>';
  }
  const xs = points.map(p => p.sampledAt);
  const ys = points.map(p => p.value);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  const scaleX = x => padding + (maxX === minX ? 0 : (x - minX) / (maxX - minX) * (width - 2 * padding));
  const scaleY = y => height - padding - (maxY === minY ? 0 : (y - minY) / (maxY - minY) * (height - 2 * padding));
  const pointsAttr = points.map(p => scaleX(p.sampledAt) + ',' + scaleY(p.value)).join(' ');
  return '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<polyline fill="none" stroke="currentColor" stroke-width="2" points="' + pointsAttr + '" /></svg>';
}
```

- [ ] **Step 4: `app.js` — views, polling, fetch calls**

Implement:
- View switching via the `nav` buttons and farm-card clicks (show/hide the three `<section>`s,
  no history/router library).
- Overview: `fetch('/farms')` every 10s (`setInterval`), render one card per farm into
  `#farm-cards` with name, entity count, storage total, chunk-loaded indicator, fake-player-online
  indicator; clicking a card loads farm detail.
- Farm detail: `fetch('/farms/' + id)` for entities/storage, `fetch('/farms/' + id +
  '/history?range=24h')` for the chart, rendered via `renderLineChart` from `chart.js` (map
  `samples[].sampledAt` (parse via `new Date(...).getTime()`) and a chosen numeric series — total
  entity count per sample, `Object.values(entityCounts).reduce((a,b)=>a+b,0)` — into
  `{sampledAt, value}` points). A `<select>` for range (`1h`/`24h`/`7d`/`30d`/`all`) re-fetches on
  change.
- Server panel: `fetch('/players')`, `fetch('/world')`, `fetch('/performance')`, `fetch('/status')`
  every 5s, rendered into `#server-body`.
- Stop all `setInterval` polling for a view when it's hidden (clear on view switch, re-start on
  view show) so hidden views don't keep fetching.

- [ ] **Step 5: `style.css`**

A small, plain stylesheet — card grid for the overview, readable typography, no framework, no
external font/CDN reference (system font stack only, per the "no CDN dependency" constraint).

- [ ] **Step 6: Build wiring**

Ensure `./gradlew build` produces a jar whose classpath contains `/dashboard/index.html` etc. at
the resource paths `MCFarmManagerHttpServer` reads from in Step 1. Run: `cd mod && ./gradlew
build` then `unzip -l build/libs/mcfarmmanager-1.0.0.jar | grep dashboard` to confirm the files
are actually bundled.
Expected: `BUILD SUCCESSFUL`, dashboard files listed in the jar.

- [ ] **Step 7: Commit**

```bash
git add dashboard mod
git commit -m "Add static dashboard (overview, farm detail, server panel) served by the mod"
```

---

## Task 11: Live verification of the dashboard in a real browser

**Files:** none (verification only); may fix bugs found in `dashboard/` or the static-file
handler in `mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java` if any
surface.

**Interfaces:** none new.

- [ ] **Step 1: Deploy and start**

Build and copy the jar as in prior tasks. Re-place the test-rig `farms.json`, re-run the test-rig
**Setup** commands, start the server via the FIFO procedure.

- [ ] **Step 2: Browser verification**

Using a browser automation tool, navigate to `http://localhost:8642/`. Confirm:
- The overview page loads and shows one card for `test-rig` with a non-zero entity count and
  storage total, and the chunk-loaded/fake-player indicators both showing "yes"/true-equivalent.
- Clicking the card navigates to the farm detail view, showing the 2 test entities and 2 storage
  containers with their item counts, and a rendered `<svg><polyline>` chart (confirm via a
  snapshot/DOM check that the `<svg>` has at least one point plotted — a fresh rig may only have
  1-2 history samples if Task 9's fast-interval verification wasn't run again here; that's
  expected and fine, an empty-but-present chart still confirms the rendering path works).
- The server panel shows the real `/players` (likely empty — no real player connected during this
  headless verification, which is correct behavior, not a bug), `/world`, `/performance`, and
  `/status` data, and updates on its own within 5-10 seconds (re-check after a short wait and
  confirm at least the values are being re-fetched, e.g. a changing `uptimeSeconds`).
- No JavaScript console errors.

Fix any bug found (dashboard JS/CSS or the static-file handler) and re-verify before proceeding.

- [ ] **Step 3: Cleanup**

Run the test-rig **Cleanup** commands via `server_stdin`, stop the server (`stop` via the pipe),
delete `server_stdin`/log and the test `history.sqlite` file under that server's
`world/mcfarmmanager/` directory.

- [ ] **Step 4: Commit**

Only if Step 2 surfaced a bug fix:
```bash
git add dashboard mod
git commit -m "Fix dashboard issue found during live browser verification"
```
If no code changed, there is nothing to commit for this task — note that in the task report.

---

## Task 12: Packaging, README, final regression, and deployment

**Files:**
- Modify: `README.md`
- No new source files expected (bugfixes only, if the final regression surfaces anything)

**Interfaces:** none new.

- [ ] **Step 1: Full regression**

Run: `cd mod && ./gradlew clean build`
Expected: `BUILD SUCCESSFUL`, all unit tests (Tasks 3, 6, 8) pass, final jar produced at
`mod/build/libs/mcfarmmanager-1.0.0.jar`.

- [ ] **Step 2: Write `README.md`**

Replace the current placeholder README with: what this is (one paragraph, from `docs/SPEC.md`'s
opening), requirements (Minecraft `1.21.11`, Fabric Loader `>=0.19.3`, Fabric API
`0.141.3+1.21.11`, fabric-carpet `1.21.11-1.4.194+v251223`, Java 21), install steps (drop
`mcfarmmanager-1.0.0.jar` into the server's `mods/` folder; create
`config/mcfarmmanager/farms.json` — point to `config/farms.example.json` as a starting template),
how to reach the dashboard (`http://<server-host>:<port>/`, default port `8642`), the Carpet
rules table (copy from `docs/SPEC.md`), and the same read-only guarantee stated plainly. Keep the
links to `docs/SPEC.md` and `docs/AGENT_BUILD_PROMPT.md`. Update the `**Status:**` line — this is
no longer "design complete, not yet implemented."

- [ ] **Step 3: Final deployment to the real server**

Copy `mod/build/libs/mcfarmmanager-1.0.0.jar` into
`/home/leivur/projects/flattennermcbot/ServerModded/mods/` (this is the real, ongoing deployment
target, not a disposable verification copy — leave it in place after this task). Write
`config/farms.example.json`'s content (the placeholder example, NOT the test-rig config) to
`/home/leivur/projects/flattennermcbot/ServerModded/config/mcfarmmanager/farms.json` — this
repo's user owns that server and needs to edit it with their own real farm coordinates before the
farms it lists mean anything; leaving the documented example in place (rather than the test rig)
is the correct handoff state. Start the server via the FIFO procedure one last time, confirm via
log that MCFarmManager loads cleanly with the example config (it will show zero real farms
matching, which is expected — the example `iron` farm's coordinates are almost certainly not real
positions in that world; confirm no crash, no error, just a normal `/farms` response listing the
example farm with whatever it actually reads at those coordinates). Stop the server cleanly.

- [ ] **Step 4: Final commit**

```bash
git add README.md
git commit -m "Add production README; final regression pass; deploy to real server"
```
