# Dashboard Alerts and Tracking Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six independent dashboard features from `docs/superpowers/specs/2026-08-05-dashboard-alerts-and-tracking-batch-design.md`: in-panel alerts, task↔farm linking UI (the "related tasks" card — pickers/chips already exist), player playtime log, server performance history, storage/shulker search, and an "off" reason with auto reminder task.

**Architecture:** Every sampling/alerting/search capability lives mod-side (Java) following the existing `FarmSampler`/`SqliteHistoryStore` pattern — a ticker hung off `ServerTickEvents.END_SERVER_TICK`, writing to its own SQLite file under `mcfarmmanager/` with the same create-table-if-not-exists + prune-on-interval approach. Each capability gets a mod HTTP endpoint on `MCFarmManagerHttpServer`, a dashboard server proxy route using the existing `mcfmFetch`/`proxy()` helpers, and a client React Query hook with a `refetchInterval` matching sibling hooks. Where a mod HTTP context path gains sub-paths (e.g. `/players` also serving `/players/{name}/sessions`), the existing fixed-lambda handler is converted to a router method following the `handleFarms` pattern, since `com.sun.net.httpserver.HttpServer` prefix-matches context paths.

**Tech Stack:** Java 21 (Fabric/Carpet mod, JUnit 5, sqlite-jdbc, Gson), Fastify + better-sqlite3 + zod (dashboard server, `node --test`), React + Vite + TanStack Query + Tailwind + Recharts (dashboard client).

## Global Constraints

- Mod-side stores follow `SqliteHistoryStore`'s exact shape: constructor opens `jdbc:sqlite:<dbFile>`, `CREATE TABLE IF NOT EXISTS` + index in the constructor, one `Connection` field, prepared statements per method, a `close()` method. Each new store gets its own SQLite file under `mcfarmmanager/` (e.g. `alerts.sqlite`, `sessions.sqlite`, `performance.sqlite`), mirroring `history.sqlite`.
- Mod-side tickers follow `FarmSampler`'s exact shape: `onEndTick()` counts ticks against `intervalMinutes.getAsInt() * 60L * 20L`, resets the counter, then does the real work. Registered once per JVM via a static `AtomicBoolean` guard + volatile "active" instance field, exactly like `MCFarmManagerExtension.TICK_LISTENER_REGISTERED`/`activeSampler`.
- Mod HTTP response shapes are dedicated `record`s, one per file, in `net.mcfarmmanager.mod.http`, converting epoch millis to `Instant.ofEpochMilli(...).toString()` at the boundary — exactly like `HistorySampleView`/`FarmHistoryResponse`.
- Dashboard server routes proxy via `mcfmFetch`/`McfmError` (`dashboard/server/src/mcfarmmanager.ts`), returning 502 on `McfmError` unless a more specific status applies, matching existing routes.
- Dashboard client hooks live in `dashboard/client/src/api/hooks.ts`, types in `dashboard/client/src/api/types.ts`, using `apiFetch` from `dashboard/client/src/api/client.ts`.
- All UI copy is Spanish, matching every existing page.
- No new dependencies (npm or Gradle) — every feature is buildable with what's already in `package.json` / `build.gradle`.
- Ambiguity resolutions made below (documented, not silently invented):
  - **Alerts "non-manual farm" exclusion**: `FarmConfig` (mod-side) has no `manual` flag — that concept only exists in the dashboard's `farm_metadata` table, which the mod has no access to. `AlertChecker` fires production-stall alerts for every farm it samples, with no manual-farm exclusion. This is a documented limitation, not a silent scope cut.
  - **"Production ~0 for 3 consecutive samples"**: interpreted as the 3 most-recent `HistorySample`s for a farm having an identical total item count (`sum(storageCounts.values())`) — i.e. zero net growth across all 3.
  - **"Storage >90% capacity"**: checked per storage row (`StorageInfo`), not aggregated per farm, using the same `capacity() * 64` denominator `MCFarmManagerHttpServer.summarize` already uses.
  - **Player-session "unclean shutdown" recovery**: the mod can't know how far into a session play was cut off after a crash, so `PlayerSessionTracker` persists a periodic heartbeat (same cadence as the sample interval) to a one-row table; on next startup, any session left with `left_at IS NULL` is closed using that last heartbeat (falling back to "now" if no heartbeat was ever recorded).

---

## Feature 1: In-panel alerts

### Task 1: Alert record, AlertStore interface, SqliteAlertStore

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/alerts/Alert.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/alerts/AlertStore.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/alerts/SqliteAlertStore.java`
- Test: `mod/src/test/java/net/mcfarmmanager/mod/alerts/SqliteAlertStoreTest.java`

**Interfaces:**
- Produces: `Alert(long id, String farmId, String type, String message, long createdAtMillis, Long dismissedAtMillis)`; `AlertStore.createIfNotActive(String farmId, String type, String message, long createdAtMillis)`, `AlertStore.listActive(): List<Alert>`, `AlertStore.dismiss(long id, long dismissedAtMillis): boolean`.

- [ ] **Step 1: Write the failing test**

```java
package net.mcfarmmanager.mod.alerts;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SqliteAlertStoreTest {
    private Path dbFile;
    private SqliteAlertStore store;

    @BeforeEach
    void setUp() throws IOException {
        dbFile = Files.createTempFile("alerts", ".sqlite");
        Files.delete(dbFile);
        store = new SqliteAlertStore(dbFile);
    }

    @AfterEach
    void tearDown() throws IOException {
        store.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void createsAndListsActiveAlerts() {
        store.createIfNotActive("iron", "storage_full", "Cofre principal al 95%", 1000L);
        List<Alert> active = store.listActive();
        assertEquals(1, active.size());
        assertEquals("iron", active.get(0).farmId());
        assertEquals("storage_full", active.get(0).type());
        assertNull(active.get(0).dismissedAtMillis());
    }

    @Test
    void dedupesSameFarmAndTypeWhileActive() {
        store.createIfNotActive("iron", "storage_full", "first", 1000L);
        store.createIfNotActive("iron", "storage_full", "second", 2000L);
        assertEquals(1, store.listActive().size());
        assertEquals("first", store.listActive().get(0).message());
    }

    @Test
    void reFiresAfterDismissal() {
        store.createIfNotActive("iron", "storage_full", "first", 1000L);
        long id = store.listActive().get(0).id();
        assertTrue(store.dismiss(id, 1500L));
        store.createIfNotActive("iron", "storage_full", "second", 2000L);
        assertEquals(1, store.listActive().size());
        assertEquals("second", store.listActive().get(0).message());
    }

    @Test
    void dismissUnknownIdReturnsFalse() {
        assertFalse(store.dismiss(999L, 1000L));
    }

    @Test
    void dismissAlreadyDismissedReturnsFalse() {
        store.createIfNotActive("iron", "storage_full", "m", 1000L);
        long id = store.listActive().get(0).id();
        assertTrue(store.dismiss(id, 1500L));
        assertFalse(store.dismiss(id, 1600L));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.alerts.SqliteAlertStoreTest"`
Expected: FAIL to compile — `Alert`, `AlertStore`, `SqliteAlertStore` don't exist yet.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.alerts;

public record Alert(long id, String farmId, String type, String message, long createdAtMillis, Long dismissedAtMillis) {}
```

```java
package net.mcfarmmanager.mod.alerts;

import java.util.List;

public interface AlertStore {
    void createIfNotActive(String farmId, String type, String message, long createdAtMillis);
    List<Alert> listActive();
    boolean dismiss(long id, long dismissedAtMillis);
}
```

```java
package net.mcfarmmanager.mod.alerts;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public final class SqliteAlertStore implements AlertStore {
    private final Connection connection;

    public SqliteAlertStore(Path dbFile) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + dbFile);
            try (Statement stmt = connection.createStatement()) {
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS alerts (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      farm_id TEXT NOT NULL,
                      type TEXT NOT NULL,
                      message TEXT NOT NULL,
                      created_at INTEGER NOT NULL,
                      dismissed_at INTEGER
                    )""");
                stmt.execute(
                    "CREATE INDEX IF NOT EXISTS idx_alerts_farm_type_active ON alerts (farm_id, type, dismissed_at)");
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open alert store at " + dbFile, e);
        }
    }

    @Override
    public void createIfNotActive(String farmId, String type, String message, long createdAtMillis) {
        String checkSql = "SELECT COUNT(*) FROM alerts WHERE farm_id = ? AND type = ? AND dismissed_at IS NULL";
        try (PreparedStatement check = connection.prepareStatement(checkSql)) {
            check.setString(1, farmId);
            check.setString(2, type);
            try (ResultSet rs = check.executeQuery()) {
                rs.next();
                if (rs.getInt(1) > 0) {
                    return;
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to check active alerts", e);
        }
        String insertSql = "INSERT INTO alerts (farm_id, type, message, created_at) VALUES (?, ?, ?, ?)";
        try (PreparedStatement stmt = connection.prepareStatement(insertSql)) {
            stmt.setString(1, farmId);
            stmt.setString(2, type);
            stmt.setString(3, message);
            stmt.setLong(4, createdAtMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to insert alert", e);
        }
    }

    @Override
    public List<Alert> listActive() {
        String sql = "SELECT id, farm_id, type, message, created_at, dismissed_at FROM alerts "
                + "WHERE dismissed_at IS NULL ORDER BY created_at DESC";
        List<Alert> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql); ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                results.add(new Alert(
                        rs.getLong("id"),
                        rs.getString("farm_id"),
                        rs.getString("type"),
                        rs.getString("message"),
                        rs.getLong("created_at"),
                        null));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list active alerts", e);
        }
        return results;
    }

    @Override
    public boolean dismiss(long id, long dismissedAtMillis) {
        String sql = "UPDATE alerts SET dismissed_at = ? WHERE id = ? AND dismissed_at IS NULL";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, dismissedAtMillis);
            stmt.setLong(2, id);
            return stmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("Failed to dismiss alert", e);
        }
    }

    public void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close alert store", e);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.alerts.SqliteAlertStoreTest"`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/alerts/Alert.java mod/src/main/java/net/mcfarmmanager/mod/alerts/AlertStore.java mod/src/main/java/net/mcfarmmanager/mod/alerts/SqliteAlertStore.java mod/src/test/java/net/mcfarmmanager/mod/alerts/SqliteAlertStoreTest.java
git commit -m "feat(mod): add Alert record and SqliteAlertStore"
```

### Task 2: FakeAlertStore + AlertChecker (storage/production rules, dedup)

**Files:**
- Create: `mod/src/test/java/net/mcfarmmanager/mod/alerts/FakeAlertStore.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/alerts/AlertChecker.java`
- Test: `mod/src/test/java/net/mcfarmmanager/mod/alerts/AlertCheckerTest.java`

**Interfaces:**
- Consumes: `AlertStore` (Task 1); `net.mcfarmmanager.mod.config.FarmConfig`, `net.mcfarmmanager.mod.data.FarmDataProvider` (`storage(FarmConfig)`), `net.mcfarmmanager.mod.data.StorageInfo`, `net.mcfarmmanager.mod.data.ItemStackInfo` (`selfAndContents()`, `count()`); `net.mcfarmmanager.mod.history.HistoryStore` (`query(String farmId, long sinceMillis)`), `net.mcfarmmanager.mod.history.HistorySample` (`storageCounts()`).
- Produces: `AlertChecker(Supplier<List<FarmConfig>>, FarmDataProvider, HistoryStore, AlertStore, IntSupplier sampleIntervalMinutes)` with `onEndTick()`. `FakeAlertStore` (public, in-memory `AlertStore`) for reuse by the HTTP test in Task 3.

- [ ] **Step 1: Write the failing test**

First, the fake (needed by the test file, written together since it has no independent behavior to test beyond what `AlertCheckerTest` exercises):

```java
package net.mcfarmmanager.mod.alerts;

import java.util.ArrayList;
import java.util.List;

public final class FakeAlertStore implements AlertStore {
    private final List<Alert> alerts = new ArrayList<>();
    private long nextId = 1;

    @Override
    public void createIfNotActive(String farmId, String type, String message, long createdAtMillis) {
        boolean alreadyActive = alerts.stream()
                .anyMatch(a -> a.farmId().equals(farmId) && a.type().equals(type) && a.dismissedAtMillis() == null);
        if (alreadyActive) {
            return;
        }
        alerts.add(new Alert(nextId++, farmId, type, message, createdAtMillis, null));
    }

    @Override
    public List<Alert> listActive() {
        return alerts.stream().filter(a -> a.dismissedAtMillis() == null).toList();
    }

    @Override
    public boolean dismiss(long id, long dismissedAtMillis) {
        for (int i = 0; i < alerts.size(); i++) {
            Alert a = alerts.get(i);
            if (a.id() == id && a.dismissedAtMillis() == null) {
                alerts.set(i, new Alert(a.id(), a.farmId(), a.type(), a.message(), a.createdAtMillis(), dismissedAtMillis));
                return true;
            }
        }
        return false;
    }
}
```

```java
package net.mcfarmmanager.mod.alerts;

import net.mcfarmmanager.mod.config.AfkSpot;
import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.config.StorageConfig;
import net.mcfarmmanager.mod.data.EntityInfo;
import net.mcfarmmanager.mod.data.FarmDataProvider;
import net.mcfarmmanager.mod.data.ItemStackInfo;
import net.mcfarmmanager.mod.data.OccupantInfo;
import net.mcfarmmanager.mod.data.StorageInfo;
import net.mcfarmmanager.mod.history.HistorySample;
import net.mcfarmmanager.mod.history.HistoryStore;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AlertCheckerTest {
    private static FarmConfig farm(String id) {
        return new FarmConfig(id, "Farm " + id, "minecraft:overworld", new Position(0, 64, 0), 16, null,
                List.of(new StorageConfig("chest-1", "Cofre principal", new Position(0, 64, 0))), (AfkSpot) null);
    }

    private static final class FixedFarmDataProvider implements FarmDataProvider {
        private final Map<String, List<StorageInfo>> storageByFarm = new HashMap<>();

        void setStorage(String farmId, int capacity, int itemCount) {
            storageByFarm.put(farmId, List.of(new StorageInfo("chest-1", "Cofre principal", new Position(0, 64, 0),
                    capacity, List.of(new ItemStackInfo("minecraft:iron_ingot", itemCount, null)))));
        }

        @Override
        public List<EntityInfo> entities(FarmConfig farm) { return List.of(); }
        @Override
        public List<StorageInfo> storage(FarmConfig farm) { return storageByFarm.getOrDefault(farm.id(), List.of()); }
        @Override
        public boolean chunkLoaded(FarmConfig farm) { return true; }
        @Override
        public List<OccupantInfo> occupants(FarmConfig farm) { return List.of(); }
    }

    private static final class FakeHistoryStoreForAlerts implements HistoryStore {
        private final Map<String, List<HistorySample>> samples = new HashMap<>();

        void add(String farmId, long at, int total) {
            samples.computeIfAbsent(farmId, k -> new ArrayList<>())
                    .add(new HistorySample(at, Map.of(), Map.of("minecraft:iron_ingot", total)));
        }

        @Override
        public void recordSample(String farmId, long sampledAtMillis, Map<String, Integer> entityCounts, Map<String, Integer> storageCounts) {}
        @Override
        public List<HistorySample> query(String farmId, long sinceMillis) {
            return samples.getOrDefault(farmId, List.of());
        }
        @Override
        public void pruneOlderThan(long cutoffMillis) {}
    }

    @Test
    void firesStorageFullAlertAboveNinetyPercent() {
        FixedFarmDataProvider farmData = new FixedFarmDataProvider();
        farmData.setStorage("iron", 27, 1600); // 27*64=1728 capacity, 1600/1728 ~ 92.6%
        FakeAlertStore alertStore = new FakeAlertStore();
        AlertChecker checker = new AlertChecker(() -> List.of(farm("iron")), farmData,
                new FakeHistoryStoreForAlerts(), alertStore, () -> 5);

        for (int i = 0; i < 6000; i++) checker.onEndTick(); // 5 min * 60 * 20 ticks

        assertEquals(1, alertStore.listActive().size());
        assertEquals("storage_full", alertStore.listActive().get(0).type());
    }

    @Test
    void doesNotFireStorageAlertBelowThreshold() {
        FixedFarmDataProvider farmData = new FixedFarmDataProvider();
        farmData.setStorage("iron", 27, 100);
        FakeAlertStore alertStore = new FakeAlertStore();
        AlertChecker checker = new AlertChecker(() -> List.of(farm("iron")), farmData,
                new FakeHistoryStoreForAlerts(), alertStore, () -> 5);

        for (int i = 0; i < 6000; i++) checker.onEndTick();

        assertTrue(alertStore.listActive().isEmpty());
    }

    @Test
    void firesProductionStalledAlertWhenLastThreeSamplesAreFlat() {
        FixedFarmDataProvider farmData = new FixedFarmDataProvider();
        farmData.setStorage("iron", 27, 0);
        FakeHistoryStoreForAlerts history = new FakeHistoryStoreForAlerts();
        history.add("iron", 1000L, 500);
        history.add("iron", 2000L, 500);
        history.add("iron", 3000L, 500);
        FakeAlertStore alertStore = new FakeAlertStore();
        AlertChecker checker = new AlertChecker(() -> List.of(farm("iron")), farmData, history, alertStore, () -> 5);

        for (int i = 0; i < 6000; i++) checker.onEndTick();

        assertTrue(alertStore.listActive().stream().anyMatch(a -> a.type().equals("production_stalled")));
    }

    @Test
    void doesNotFireProductionAlertWhenGrowing() {
        FixedFarmDataProvider farmData = new FixedFarmDataProvider();
        farmData.setStorage("iron", 27, 0);
        FakeHistoryStoreForAlerts history = new FakeHistoryStoreForAlerts();
        history.add("iron", 1000L, 100);
        history.add("iron", 2000L, 200);
        history.add("iron", 3000L, 300);
        FakeAlertStore alertStore = new FakeAlertStore();
        AlertChecker checker = new AlertChecker(() -> List.of(farm("iron")), farmData, history, alertStore, () -> 5);

        for (int i = 0; i < 6000; i++) checker.onEndTick();

        assertTrue(alertStore.listActive().stream().noneMatch(a -> a.type().equals("production_stalled")));
    }

    @Test
    void doesNotCheckBeforeIntervalElapses() {
        FixedFarmDataProvider farmData = new FixedFarmDataProvider();
        farmData.setStorage("iron", 27, 1700);
        FakeAlertStore alertStore = new FakeAlertStore();
        AlertChecker checker = new AlertChecker(() -> List.of(farm("iron")), farmData,
                new FakeHistoryStoreForAlerts(), alertStore, () -> 5);

        for (int i = 0; i < 100; i++) checker.onEndTick();

        assertTrue(alertStore.listActive().isEmpty());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.alerts.AlertCheckerTest"`
Expected: FAIL to compile — `AlertChecker` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.alerts;

import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.data.FarmDataProvider;
import net.mcfarmmanager.mod.data.ItemStackInfo;
import net.mcfarmmanager.mod.data.StorageInfo;
import net.mcfarmmanager.mod.history.HistorySample;
import net.mcfarmmanager.mod.history.HistoryStore;

import java.util.List;
import java.util.function.IntSupplier;
import java.util.function.Supplier;

/**
 * Driven by {@code ServerTickEvents.END_SERVER_TICK} on the same cadence as {@link
 * net.mcfarmmanager.mod.history.FarmSampler}. Has no concept of the dashboard's "manual farm"
 * flag (that only exists in the dashboard's own SQLite, not in {@link FarmConfig}), so
 * production-stall alerts fire for every farm this checks, manual or not - see the plan's
 * documented ambiguity resolution.
 */
public final class AlertChecker {
    private static final double STORAGE_FULL_THRESHOLD = 0.9;
    private static final int STALL_SAMPLE_COUNT = 3;

    private final Supplier<List<FarmConfig>> farmsSupplier;
    private final FarmDataProvider farmData;
    private final HistoryStore historyStore;
    private final AlertStore alertStore;
    private final IntSupplier sampleIntervalMinutes;
    private long ticksSinceLastCheck = 0;

    public AlertChecker(Supplier<List<FarmConfig>> farmsSupplier, FarmDataProvider farmData, HistoryStore historyStore,
                         AlertStore alertStore, IntSupplier sampleIntervalMinutes) {
        this.farmsSupplier = farmsSupplier;
        this.farmData = farmData;
        this.historyStore = historyStore;
        this.alertStore = alertStore;
        this.sampleIntervalMinutes = sampleIntervalMinutes;
    }

    public void onEndTick() {
        long intervalTicks = sampleIntervalMinutes.getAsInt() * 60L * 20L;
        if (++ticksSinceLastCheck < intervalTicks) {
            return;
        }
        ticksSinceLastCheck = 0;
        checkAll();
    }

    private void checkAll() {
        long now = System.currentTimeMillis();
        for (FarmConfig farm : farmsSupplier.get()) {
            checkStorage(farm, now);
            checkProduction(farm, now);
        }
    }

    private void checkStorage(FarmConfig farm, long now) {
        for (StorageInfo storage : farmData.storage(farm)) {
            int capacity = storage.capacity() * 64;
            if (capacity <= 0) {
                continue;
            }
            int count = storage.items().stream()
                    .flatMap(ItemStackInfo::selfAndContents)
                    .mapToInt(ItemStackInfo::count)
                    .sum();
            if (count >= STORAGE_FULL_THRESHOLD * capacity) {
                int percent = (int) Math.round(100.0 * count / capacity);
                alertStore.createIfNotActive(farm.id(), "storage_full",
                        storage.label() + " al " + percent + "% de capacidad", now);
            }
        }
    }

    private void checkProduction(FarmConfig farm, long now) {
        List<HistorySample> samples = historyStore.query(farm.id(), 0L);
        if (samples.size() < STALL_SAMPLE_COUNT) {
            return;
        }
        List<HistorySample> lastThree = samples.subList(samples.size() - STALL_SAMPLE_COUNT, samples.size());
        int firstTotal = totalItems(lastThree.get(0));
        boolean stalled = lastThree.stream().allMatch(s -> totalItems(s) == firstTotal);
        if (stalled) {
            alertStore.createIfNotActive(farm.id(), "production_stalled",
                    "Sin producción en las últimas " + STALL_SAMPLE_COUNT + " muestras", now);
        }
    }

    private static int totalItems(HistorySample sample) {
        return sample.storageCounts().values().stream().mapToInt(Integer::intValue).sum();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.alerts.AlertCheckerTest"`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/alerts/AlertChecker.java mod/src/test/java/net/mcfarmmanager/mod/alerts/FakeAlertStore.java mod/src/test/java/net/mcfarmmanager/mod/alerts/AlertCheckerTest.java
git commit -m "feat(mod): add AlertChecker for storage and production alerts"
```

### Task 3: Mod HTTP endpoints `/alerts` and `/alerts/{id}/dismiss`, wire AlertChecker into extension

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/AlertView.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`
- Modify: `mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java`

**Interfaces:**
- Consumes: `AlertStore`, `Alert` (Task 1), `FakeAlertStore` (Task 2), `AlertChecker` (Task 2).
- Produces: `MCFarmManagerHttpServer` constructor gains an `AlertStore alertStore` parameter (inserted right after `HistoryStore historyStore`); `GET /alerts` → `{"alerts": [AlertView...]}`; `POST /alerts/{id}/dismiss` → `{"ok": true}` (200) or `{"error": ...}` (404/400).

- [ ] **Step 1: Write the failing test**

Add to `mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java` (new field + constructor arg + new tests):

```java
    private net.mcfarmmanager.mod.alerts.FakeAlertStore alertStore;

    @BeforeEach
    void start() throws IOException {
        historyStore = new FakeHistoryStore();
        alertStore = new net.mcfarmmanager.mod.alerts.FakeAlertStore();
        server = new MCFarmManagerHttpServer(this::farms, new FakeFarmDataProvider(), new FakeServerDataProvider(),
                historyStore, alertStore, 0, "127.0.0.1");
        server.start();
        port = server.boundPort();
    }

    @Test
    void alertsEndpointListsActiveAlerts() throws Exception {
        alertStore.createIfNotActive("iron", "storage_full", "Cofre principal al 95%", System.currentTimeMillis());
        HttpResponse<String> response = get("/alerts");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"farmId\":\"iron\""));
        assertTrue(response.body().contains("\"type\":\"storage_full\""));
    }

    @Test
    void dismissAlertReturns200AndRemovesFromActiveList() throws Exception {
        alertStore.createIfNotActive("iron", "storage_full", "m", System.currentTimeMillis());
        long id = alertStore.listActive().get(0).id();
        HttpRequest post = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/alerts/" + id + "/dismiss"))
                .POST(HttpRequest.BodyPublishers.noBody()).build();
        HttpResponse<String> response = client.send(post, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        assertTrue(get("/alerts").body().contains("\"alerts\":[]"));
    }

    @Test
    void dismissUnknownAlertReturns404() throws Exception {
        HttpRequest post = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/alerts/999/dismiss"))
                .POST(HttpRequest.BodyPublishers.noBody()).build();
        assertEquals(404, client.send(post, HttpResponse.BodyHandlers.ofString()).statusCode());
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.http.MCFarmManagerHttpServerTest"`
Expected: FAIL to compile — constructor doesn't accept `alertStore` yet, `/alerts` context doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.http;

public record AlertView(long id, String farmId, String type, String message, String createdAt) {}
```

In `MCFarmManagerHttpServer.java`, add the field, constructor parameter, and import:

```java
import net.mcfarmmanager.mod.alerts.Alert;
import net.mcfarmmanager.mod.alerts.AlertStore;
```

```java
    private final HistoryStore historyStore;
    private final AlertStore alertStore;
    private final int port;
```

```java
    public MCFarmManagerHttpServer(java.util.function.Supplier<List<FarmConfig>> farmsSupplier, FarmDataProvider farmData,
                                    ServerDataProvider serverData, HistoryStore historyStore, AlertStore alertStore,
                                    int port, String bindAddress) {
        this.farmsSupplier = farmsSupplier;
        this.farmData = farmData;
        this.serverData = serverData;
        this.historyStore = historyStore;
        this.alertStore = alertStore;
        this.port = port;
        this.bindAddress = bindAddress;
    }
```

Register the new context in `start()`, right after the `/status` line:

```java
        addContext("/alerts", this::handleAlerts, hostFilter);
```

Add the handler and view mapper, near `handleFarmHistory`:

```java
    private void handleAlerts(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/alerts")) {
            List<AlertView> views = alertStore.listActive().stream().map(MCFarmManagerHttpServer::toAlertView).toList();
            respondJson(exchange, Map.of("alerts", views));
            return;
        }
        String remainder = path.substring("/alerts/".length());
        if (remainder.endsWith("/dismiss") && exchange.getRequestMethod().equals("POST")) {
            String idPart = remainder.substring(0, remainder.length() - "/dismiss".length());
            long id;
            try {
                id = Long.parseLong(idPart);
            } catch (NumberFormatException e) {
                respondJson(exchange, 400, Map.of("error", "invalid alert id: " + idPart));
                return;
            }
            boolean dismissed = alertStore.dismiss(id, System.currentTimeMillis());
            if (!dismissed) {
                respondJson(exchange, 404, Map.of("error", "unknown or already dismissed alert: " + id));
                return;
            }
            respondJson(exchange, Map.of("ok", true));
            return;
        }
        respondJson(exchange, 404, Map.of("error", "not found"));
    }

    private static AlertView toAlertView(Alert alert) {
        return new AlertView(alert.id(), alert.farmId(), alert.type(), alert.message(),
                Instant.ofEpochMilli(alert.createdAtMillis()).toString());
    }
```

Now wire `AlertChecker` and `SqliteAlertStore` into `MCFarmManagerExtension.java`. Add imports:

```java
import net.mcfarmmanager.mod.alerts.AlertChecker;
import net.mcfarmmanager.mod.alerts.SqliteAlertStore;
```

Add fields alongside the existing `TICK_LISTENER_REGISTERED`/`activeSampler` pair:

```java
    private static final AtomicBoolean ALERT_TICK_LISTENER_REGISTERED = new AtomicBoolean();
    private static volatile AlertChecker activeAlertChecker;

    private SqliteAlertStore alertStore;
```

In `onServerLoaded`, after `historyStore = new SqliteHistoryStore(dbFile);` and before `activeSampler = new FarmSampler(...)`, open the alert store and build the checker:

```java
        try {
            Path alertsDbFile = server.getWorldPath(LevelResource.ROOT).resolve("mcfarmmanager/alerts.sqlite");
            Files.createDirectories(alertsDbFile.getParent());
            alertStore = new SqliteAlertStore(alertsDbFile);
        } catch (IOException e) {
            MCFarmManagerMod.LOGGER.error("Failed to open MCFarmManager alert store: {}", e.getMessage());
            alertStore = null;
            return;
        }

        activeAlertChecker = new AlertChecker(MCFarmManagerMod::farms, farmData, historyStore, alertStore,
                () -> Settings.mcfarmmanagerSampleIntervalMinutes);
        if (ALERT_TICK_LISTENER_REGISTERED.compareAndSet(false, true)) {
            ServerTickEvents.END_SERVER_TICK.register(s -> {
                AlertChecker checker = activeAlertChecker;
                if (checker != null) {
                    checker.onEndTick();
                }
            });
        }
```

Update the `httpServer = new MCFarmManagerHttpServer(...)` call to pass `alertStore`:

```java
        httpServer = new MCFarmManagerHttpServer(
                MCFarmManagerMod::farms,
                farmData,
                new RealServerDataProvider(() -> CarpetServer.minecraft_server),
                historyStore,
                alertStore,
                Settings.mcfarmmanagerHttpPort,
                Settings.mcfarmmanagerHttpBindAddress);
```

Update `onServerClosed` to close the alert store:

```java
    @Override
    public void onServerClosed(MinecraftServer server) {
        activeSampler = null;
        activeAlertChecker = null;
        if (httpServer != null) {
            httpServer.stop();
            httpServer = null;
        }
        if (historyStore != null) {
            historyStore.close();
            historyStore = null;
        }
        if (alertStore != null) {
            alertStore.close();
            alertStore = null;
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test`
Expected: PASS, including all pre-existing tests (constructor call sites all updated).

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/http/AlertView.java mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java
git commit -m "feat(mod): expose /alerts and /alerts/{id}/dismiss, wire AlertChecker"
```

### Task 4: Dashboard server proxy routes `GET /api/alerts`, `POST /api/alerts/:id/dismiss`

**Files:**
- Modify: `dashboard/server/src/routes/misc.ts`
- Test: `dashboard/server/test/misc.test.ts` (new file)

**Interfaces:**
- Consumes: `mcfmFetch`, `McfmError` from `dashboard/server/src/mcfarmmanager.ts`.
- Produces: `GET /api/alerts` (proxies `/alerts`), `POST /api/alerts/:id/dismiss` (proxies `/alerts/:id/dismiss`).

- [ ] **Step 1: Write the failing test**

```typescript
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAndGetCookie } from './helpers.js';

test('GET /api/alerts proxies the active alert list', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ alerts: [{ id: 1, farmId: 'iron', type: 'storage_full', message: 'm', createdAt: '2026-01-01T00:00:00Z' }] }), { status: 200 })
  );
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/alerts', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().alerts[0].farmId, 'iron');
});

test('POST /api/alerts/:id/dismiss proxies the dismiss call', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(init.method, 'POST');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'POST', url: '/api/alerts/1/dismiss', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
});

test('POST /api/alerts/:id/dismiss returns 404 when MCFarmManager reports 404', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ error: 'unknown alert' }), { status: 404 })
  );
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'POST', url: '/api/alerts/999/dismiss', headers: { cookie } });
  assert.equal(res.statusCode, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test -- test/misc.test.ts`
Expected: FAIL — routes don't exist yet (404 from Fastify's default not-found handler).

- [ ] **Step 3: Write minimal implementation**

Replace the body of `dashboard/server/src/routes/misc.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { mcfmFetch, McfmError } from '../mcfarmmanager.js';

export function registerMiscRoutes(app: FastifyInstance) {
  const proxy = (path: string) => async (_req: unknown, reply: import('fastify').FastifyReply) => {
    try {
      return await mcfmFetch(path);
    } catch (err) {
      if (err instanceof McfmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  };

  app.get('/api/players/live', proxy('/players'));
  app.get('/api/world', proxy('/world'));
  app.get('/api/performance', proxy('/performance'));
  app.get('/api/status', proxy('/status'));

  app.get('/api/alerts', proxy('/alerts'));

  app.post('/api/alerts/:id/dismiss', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return await mcfmFetch(`/alerts/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
    } catch (err) {
      if (err instanceof McfmError) {
        const code = err.status === 404 ? 404 : 502;
        return reply.code(code).send({ error: err.message });
      }
      throw err;
    }
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test -- test/misc.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/misc.ts dashboard/server/test/misc.test.ts
git commit -m "feat(server): proxy /api/alerts and /api/alerts/:id/dismiss"
```

### Task 5: Client `useAlerts`/`useDismissAlert` hooks and `Alert` type

**Files:**
- Modify: `dashboard/client/src/api/types.ts`
- Modify: `dashboard/client/src/api/hooks.ts`

**Interfaces:**
- Consumes: `apiFetch` from `dashboard/client/src/api/client.ts`.
- Produces: `Alert { id: number; farmId: string; type: string; message: string; createdAt: string }`; `useAlerts()` (React Query, `refetchInterval: 30_000`); `useDismissAlert()` (mutation, invalidates `['alerts']`).

This is a client-side hook with no existing test harness for hooks in this repo (no React Testing Library setup) — verified manually via Task 6's UI, which is the smallest reasonable choice given no hook-test precedent exists elsewhere in `dashboard/client`.

- [ ] **Step 1: Add the type**

Append to `dashboard/client/src/api/types.ts`:

```typescript
export interface Alert {
  id: number;
  farmId: string;
  type: string;
  message: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add the hooks**

Append to `dashboard/client/src/api/hooks.ts`, and add `Alert` to the existing type import at the top of the file:

```typescript
// --- alerts ---
export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => apiFetch<{ alerts: Alert[] }>('/alerts'),
    refetchInterval: 30_000,
  });
}
export function useDismissAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: true }>(`/alerts/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts
git commit -m "feat(client): add useAlerts/useDismissAlert hooks"
```

### Task 6: Client bell icon with dropdown in Sidebar

**Files:**
- Create: `dashboard/client/src/components/AlertBell.tsx`
- Modify: `dashboard/client/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `useAlerts`, `useDismissAlert`, `useFarms` (Task 5, existing); `useDropdown` from `dashboard/client/src/components/useDropdown.ts`.
- Produces: `AlertBell` default export, a self-contained bell button + dropdown, dropped into `Sidebar`'s header row.

- [ ] **Step 1: Write the component**

```tsx
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAlerts, useDismissAlert, useFarms } from '../api/hooks';
import { useDropdown } from './useDropdown';

export default function AlertBell() {
  const alerts = useAlerts();
  const farms = useFarms();
  const dismissAlert = useDismissAlert();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>(buttonRef);

  const active = alerts.data?.alerts ?? [];
  const farmName = (farmId: string) => farms.data?.farms.find((f) => f.id === farmId)?.name ?? farmId;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded p-2 text-slate-300 hover:bg-base hover:text-gold"
        aria-label="Alertas"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-1.7 1.7a1 1 0 0 0 .7 1.71h16a1 1 0 0 0 .7-1.71L19 16Z" />
        </svg>
        {active.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-blocked px-1 text-[10px] font-bold text-white">
            {active.length}
          </span>
        )}
      </button>
      {open && (
        <div ref={ref} className="absolute left-0 z-40 mt-2 w-80 rounded-lg border border-border bg-panel p-2 shadow-lg">
          {active.length === 0 ? (
            <p className="p-2 text-sm text-slate-500">Sin alertas activas.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {active.map((a) => (
                <li key={a.id} className="rounded p-2 hover:bg-base">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={`/granjas/${a.farmId}`} className="block truncate text-sm font-medium text-cyan hover:underline">
                        {farmName(a.farmId)}
                      </Link>
                      <p className="text-xs text-slate-400">{a.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissAlert.mutate(a.id)}
                      className="shrink-0 text-xs text-slate-500 hover:text-status-blocked"
                    >
                      Descartar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into Sidebar**

In `dashboard/client/src/components/Sidebar.tsx`, add the import:

```tsx
import AlertBell from './AlertBell';
```

Replace the header line:

```tsx
      <div className="px-4 py-5 font-mono text-lg text-gold">SlayCraft</div>
```

with:

```tsx
      <div className="flex items-center justify-between px-4 py-5">
        <span className="font-mono text-lg text-gold">SlayCraft</span>
        <AlertBell />
      </div>
```

- [ ] **Step 3: Typecheck and manual verification**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no new errors. Use the `run` skill to launch the dashboard and confirm the bell renders, badge count matches seeded alerts, and dismiss removes a row.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/components/AlertBell.tsx dashboard/client/src/components/Sidebar.tsx
git commit -m "feat(client): add alert bell dropdown to sidebar"
```

## Feature 2: Task↔Farm linking ("Tareas relacionadas" card)

The farm picker in the task form and the farm chip on task cards/rows already exist in
`dashboard/client/src/pages/Tareas.tsx` (the `Select` bound to `form.farm_id` in the create/edit
modal, and the `Link`/chip rendered per task card) — verified by reading the file; no changes
needed there. The only remaining gap is the "Tareas relacionadas" card in `GranjaDetail.tsx`,
which needs `GET /api/tasks?farm_id=<id>` support.

### Task 7: Server `GET /api/tasks?farm_id=` filter

**Files:**
- Modify: `dashboard/server/src/routes/tasks.ts`
- Test: `dashboard/server/test/tasks.test.ts`

**Interfaces:**
- Produces: `GET /api/tasks?farm_id=<id>` returns only tasks with that `farm_id`; `GET /api/tasks` (no param) is unchanged.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/server/test/tasks.test.ts`:

```typescript
test('GET /api/tasks?farm_id filters to that farm only', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);

  await app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: { title: 'Reabastecer hierro', farm_id: 'iron' } });
  await app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: { title: 'Sin granja' } });
  await app.inject({ method: 'POST', url: '/api/tasks', headers: { cookie }, payload: { title: 'Reabastecer oro', farm_id: 'gold' } });

  const res = await app.inject({ method: 'GET', url: '/api/tasks?farm_id=iron', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const titles = res.json().tasks.map((t: { title: string }) => t.title);
  assert.deepEqual(titles, ['Reabastecer hierro']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test -- test/tasks.test.ts`
Expected: FAIL — `GET /api/tasks?farm_id=iron` currently returns all 3 tasks.

- [ ] **Step 3: Write minimal implementation**

In `dashboard/server/src/routes/tasks.ts`, replace the `GET /api/tasks` handler:

```typescript
  app.get('/api/tasks', async (req) => {
    db.prepare(
      `UPDATE tasks SET archived = 1
       WHERE status = 'done' AND archived = 0 AND completed_at IS NOT NULL
         AND completed_at <= datetime('now', '-3 days')`
    ).run();
    const { farm_id } = req.query as { farm_id?: string };
    const orderBy = `ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'med' THEN 1 WHEN 'low' THEN 2 END, (due_date IS NULL), due_date ASC`;
    const tasks = (
      farm_id
        ? db.prepare(`SELECT * FROM tasks WHERE archived = 0 AND farm_id = ? ${orderBy}`).all(farm_id)
        : db.prepare(`SELECT * FROM tasks WHERE archived = 0 ${orderBy}`).all()
    ) as TaskRow[];
    return { tasks: tasks.map((t) => hydrateTask(db, t)) };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test -- test/tasks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/tasks.ts dashboard/server/test/tasks.test.ts
git commit -m "feat(server): support farm_id filter on GET /api/tasks"
```

### Task 8: "Tareas relacionadas" card in GranjaDetail

**Files:**
- Modify: `dashboard/client/src/api/hooks.ts`
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx`

**Interfaces:**
- Consumes: `Task`, `StatusBadge` (existing), Task 7's `farm_id` query param.
- Produces: `useTasks(farmId?: string)` — existing signature extended with an optional param; unconditional call sites remain valid since the argument is optional.

- [ ] **Step 1: Extend `useTasks`**

In `dashboard/client/src/api/hooks.ts`, replace:

```typescript
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch<{ tasks: Task[] }>('/tasks'),
    refetchInterval: 15_000,
  });
}
```

with:

```typescript
export function useTasks(farmId?: string) {
  return useQuery({
    queryKey: ['tasks', farmId ?? 'all'],
    queryFn: () => apiFetch<{ tasks: Task[] }>(farmId ? `/tasks?farm_id=${encodeURIComponent(farmId)}` : '/tasks'),
    refetchInterval: 15_000,
  });
}
```

(`qc.invalidateQueries({ queryKey: ['tasks'] })` calls elsewhere in this file still invalidate every `['tasks', ...]` query — TanStack Query matches by array prefix by default, so no other hook needs updating.)

- [ ] **Step 2: Add the card**

In `dashboard/client/src/pages/GranjaDetail.tsx`, add to the import list:

```tsx
import { useTasks, /* ...existing imports... */ } from '../api/hooks';
import StatusBadge from '../components/StatusBadge';
```

Add the hook call alongside the other hooks near the top of the component body (after `const farm = useFarm(id!);`):

```tsx
  const relatedTasks = useTasks(id);
```

Add a new `<Card>` after the "Historial" card (after its closing `</Card>`, before the "Imágenes" card):

```tsx
      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Tareas relacionadas</h2>
        {(relatedTasks.data?.tasks.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">Sin tareas vinculadas a esta granja.</p>
        ) : (
          <div className="space-y-2">
            {relatedTasks.data!.tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <Link to="/tareas" className="text-cyan hover:underline">
                  {t.title}
                </Link>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
```

- [ ] **Step 3: Typecheck and manual verification**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no new errors. Use the `run` skill to open a farm detail page with a linked task and confirm it appears in the new card.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/api/hooks.ts dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "feat(client): add related-tasks card to GranjaDetail"
```

## Feature 3: Player playtime log

### Task 9: PlayerSession record, PlayerSessionStore interface, SqlitePlayerSessionStore

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/sessions/PlayerSession.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/sessions/PlayerSessionStore.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/sessions/SqlitePlayerSessionStore.java`
- Test: `mod/src/test/java/net/mcfarmmanager/mod/sessions/SqlitePlayerSessionStoreTest.java`

**Interfaces:**
- Produces: `PlayerSession(String playerName, long joinedAtMillis, Long leftAtMillis)`; `PlayerSessionStore.openSession(String playerName, long joinedAtMillis)`, `.closeSession(String playerName, long leftAtMillis)`, `.closeDanglingSessions(long leftAtMillis)`, `.recordHeartbeat(long millis)`, `.lastHeartbeatMillis(): Long`, `.query(String playerName, long sinceMillis): List<PlayerSession>`.

- [ ] **Step 1: Write the failing test**

```java
package net.mcfarmmanager.mod.sessions;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SqlitePlayerSessionStoreTest {
    private Path dbFile;
    private SqlitePlayerSessionStore store;

    @BeforeEach
    void setUp() throws IOException {
        dbFile = Files.createTempFile("sessions", ".sqlite");
        Files.delete(dbFile);
        store = new SqlitePlayerSessionStore(dbFile);
    }

    @AfterEach
    void tearDown() throws IOException {
        store.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void opensAndClosesASession() {
        store.openSession("leivur", 1000L);
        store.closeSession("leivur", 2000L);
        List<PlayerSession> sessions = store.query("leivur", 0L);
        assertEquals(1, sessions.size());
        assertEquals(1000L, sessions.get(0).joinedAtMillis());
        assertEquals(2000L, sessions.get(0).leftAtMillis());
    }

    @Test
    void openSessionDoesNotDuplicateWhileAlreadyOpen() {
        store.openSession("leivur", 1000L);
        store.openSession("leivur", 1500L);
        assertEquals(1, store.query("leivur", 0L).size());
    }

    @Test
    void closeSessionClosesTheMostRecentOpenOne() {
        store.openSession("leivur", 1000L);
        store.closeSession("leivur", 1200L);
        store.openSession("leivur", 2000L);
        store.closeSession("leivur", 2500L);
        List<PlayerSession> sessions = store.query("leivur", 0L);
        assertEquals(2, sessions.size());
        assertEquals(1200L, sessions.get(0).leftAtMillis());
        assertEquals(2500L, sessions.get(1).leftAtMillis());
    }

    @Test
    void queryFiltersBySinceMillis() {
        store.openSession("leivur", 1000L);
        store.closeSession("leivur", 1500L);
        store.openSession("leivur", 5000L);
        store.closeSession("leivur", 5500L);
        assertEquals(1, store.query("leivur", 4000L).size());
    }

    @Test
    void closeDanglingSessionsClosesOnlyOpenOnes() {
        store.openSession("leivur", 1000L);
        store.closeSession("leivur", 1500L);
        store.openSession("gustavo", 2000L);
        store.closeDanglingSessions(9000L);
        List<PlayerSession> gustavo = store.query("gustavo", 0L);
        assertEquals(9000L, gustavo.get(0).leftAtMillis());
        List<PlayerSession> leivur = store.query("leivur", 0L);
        assertEquals(1500L, leivur.get(0).leftAtMillis());
    }

    @Test
    void heartbeatRoundTripsAndUpserts() {
        assertNull(store.lastHeartbeatMillis());
        store.recordHeartbeat(1000L);
        assertEquals(1000L, store.lastHeartbeatMillis());
        store.recordHeartbeat(2000L);
        assertEquals(2000L, store.lastHeartbeatMillis());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.sessions.SqlitePlayerSessionStoreTest"`
Expected: FAIL to compile — classes don't exist yet.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.sessions;

public record PlayerSession(String playerName, long joinedAtMillis, Long leftAtMillis) {}
```

```java
package net.mcfarmmanager.mod.sessions;

import java.util.List;

public interface PlayerSessionStore {
    void openSession(String playerName, long joinedAtMillis);
    void closeSession(String playerName, long leftAtMillis);
    void closeDanglingSessions(long leftAtMillis);
    void recordHeartbeat(long millis);
    Long lastHeartbeatMillis();
    List<PlayerSession> query(String playerName, long sinceMillis);
}
```

```java
package net.mcfarmmanager.mod.sessions;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public final class SqlitePlayerSessionStore implements PlayerSessionStore {
    private final Connection connection;

    public SqlitePlayerSessionStore(Path dbFile) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + dbFile);
            try (Statement stmt = connection.createStatement()) {
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS player_sessions (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      player_name TEXT NOT NULL,
                      joined_at INTEGER NOT NULL,
                      left_at INTEGER
                    )""");
                stmt.execute(
                    "CREATE INDEX IF NOT EXISTS idx_player_sessions_name_time ON player_sessions (player_name, joined_at)");
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS session_heartbeat (
                      id INTEGER PRIMARY KEY CHECK (id = 1),
                      last_tick_millis INTEGER NOT NULL
                    )""");
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open session store at " + dbFile, e);
        }
    }

    @Override
    public void openSession(String playerName, long joinedAtMillis) {
        String checkSql = "SELECT COUNT(*) FROM player_sessions WHERE player_name = ? AND left_at IS NULL";
        try (PreparedStatement check = connection.prepareStatement(checkSql)) {
            check.setString(1, playerName);
            try (ResultSet rs = check.executeQuery()) {
                rs.next();
                if (rs.getInt(1) > 0) {
                    return;
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to check open sessions", e);
        }
        try (PreparedStatement stmt = connection.prepareStatement(
                "INSERT INTO player_sessions (player_name, joined_at) VALUES (?, ?)")) {
            stmt.setString(1, playerName);
            stmt.setLong(2, joinedAtMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open session", e);
        }
    }

    @Override
    public void closeSession(String playerName, long leftAtMillis) {
        String sql = "UPDATE player_sessions SET left_at = ? WHERE id = ("
                + "SELECT id FROM player_sessions WHERE player_name = ? AND left_at IS NULL "
                + "ORDER BY joined_at DESC LIMIT 1)";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, leftAtMillis);
            stmt.setString(2, playerName);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close session", e);
        }
    }

    @Override
    public void closeDanglingSessions(long leftAtMillis) {
        try (PreparedStatement stmt = connection.prepareStatement(
                "UPDATE player_sessions SET left_at = ? WHERE left_at IS NULL")) {
            stmt.setLong(1, leftAtMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close dangling sessions", e);
        }
    }

    @Override
    public void recordHeartbeat(long millis) {
        String sql = "INSERT INTO session_heartbeat (id, last_tick_millis) VALUES (1, ?) "
                + "ON CONFLICT(id) DO UPDATE SET last_tick_millis = excluded.last_tick_millis";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, millis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to record heartbeat", e);
        }
    }

    @Override
    public Long lastHeartbeatMillis() {
        try (PreparedStatement stmt = connection.prepareStatement(
                "SELECT last_tick_millis FROM session_heartbeat WHERE id = 1");
             ResultSet rs = stmt.executeQuery()) {
            return rs.next() ? rs.getLong(1) : null;
        } catch (SQLException e) {
            throw new RuntimeException("Failed to read heartbeat", e);
        }
    }

    @Override
    public List<PlayerSession> query(String playerName, long sinceMillis) {
        String sql = "SELECT player_name, joined_at, left_at FROM player_sessions "
                + "WHERE player_name = ? AND joined_at >= ? ORDER BY joined_at ASC";
        List<PlayerSession> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, playerName);
            stmt.setLong(2, sinceMillis);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    long leftAt = rs.getLong("left_at");
                    results.add(new PlayerSession(rs.getString("player_name"), rs.getLong("joined_at"),
                            rs.wasNull() ? null : leftAt));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query sessions", e);
        }
        return results;
    }

    public void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close session store", e);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.sessions.SqlitePlayerSessionStoreTest"`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/sessions/PlayerSession.java mod/src/main/java/net/mcfarmmanager/mod/sessions/PlayerSessionStore.java mod/src/main/java/net/mcfarmmanager/mod/sessions/SqlitePlayerSessionStore.java mod/src/test/java/net/mcfarmmanager/mod/sessions/SqlitePlayerSessionStoreTest.java
git commit -m "feat(mod): add PlayerSession record and SqlitePlayerSessionStore"
```

### Task 10: PlayerSessionTracker + wire join/leave events and heartbeat into extension

Confirmed via `javap -p` against the Loom-remapped `fabric-networking-api-v1` jar in this
project's build cache (`mod/.gradle/loom-cache/remapped_mods/remapped/net/fabricmc/fabric-api/
fabric-networking-api-v1-*/`), matching the same javap-first approach `RealServerDataProvider.java`
and `MCFarmManagerExtension.java` already document: under this project's official Mojang
mappings, `ServerPlayConnectionEvents.Join.onPlayReady` and `.Disconnect.onPlayDisconnect` take
a `net.minecraft.server.network.ServerGamePacketListenerImpl` (not `ServerPlayNetworkHandler`,
the Yarn name), which exposes `public ServerPlayer getPlayer()`.

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/sessions/PlayerSessionTracker.java`
- Create: `mod/src/test/java/net/mcfarmmanager/mod/sessions/FakePlayerSessionStore.java`
- Test: `mod/src/test/java/net/mcfarmmanager/mod/sessions/PlayerSessionTrackerTest.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java`

**Interfaces:**
- Consumes: `PlayerSessionStore` (Task 9).
- Produces: `PlayerSessionTracker(PlayerSessionStore, IntSupplier heartbeatIntervalMinutes)` with `onPlayerJoin(String playerName, boolean isFakePlayer, long atMillis)`, `onPlayerDisconnect(...)`, `onEndTick()`, `closeDanglingSessionsFromPreviousRun()`. Kept free of any Minecraft/Fabric types so it's unit-testable without a running server — the extension wiring layer is the only place that touches `ServerGamePacketListenerImpl`/`EntityPlayerMPFake`.

- [ ] **Step 1: Write the failing test**

```java
package net.mcfarmmanager.mod.sessions;

import java.util.ArrayList;
import java.util.List;

public final class FakePlayerSessionStore implements PlayerSessionStore {
    private final List<PlayerSession> sessions = new ArrayList<>();
    private Long heartbeat;

    @Override
    public void openSession(String playerName, long joinedAtMillis) {
        boolean open = sessions.stream().anyMatch(s -> s.playerName().equals(playerName) && s.leftAtMillis() == null);
        if (!open) {
            sessions.add(new PlayerSession(playerName, joinedAtMillis, null));
        }
    }

    @Override
    public void closeSession(String playerName, long leftAtMillis) {
        for (int i = sessions.size() - 1; i >= 0; i--) {
            PlayerSession s = sessions.get(i);
            if (s.playerName().equals(playerName) && s.leftAtMillis() == null) {
                sessions.set(i, new PlayerSession(s.playerName(), s.joinedAtMillis(), leftAtMillis));
                return;
            }
        }
    }

    @Override
    public void closeDanglingSessions(long leftAtMillis) {
        for (int i = 0; i < sessions.size(); i++) {
            PlayerSession s = sessions.get(i);
            if (s.leftAtMillis() == null) {
                sessions.set(i, new PlayerSession(s.playerName(), s.joinedAtMillis(), leftAtMillis));
            }
        }
    }

    @Override
    public void recordHeartbeat(long millis) { heartbeat = millis; }
    @Override
    public Long lastHeartbeatMillis() { return heartbeat; }

    @Override
    public List<PlayerSession> query(String playerName, long sinceMillis) {
        return sessions.stream()
                .filter(s -> s.playerName().equals(playerName) && s.joinedAtMillis() >= sinceMillis)
                .toList();
    }
}
```

```java
package net.mcfarmmanager.mod.sessions;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PlayerSessionTrackerTest {
    @Test
    void joinOpensASession() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        tracker.onPlayerJoin("leivur", false, 1000L);
        assertEquals(1, store.query("leivur", 0L).size());
        assertNull(store.query("leivur", 0L).get(0).leftAtMillis());
    }

    @Test
    void ignoresFakePlayers() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        tracker.onPlayerJoin("Worker-Iron", true, 1000L);
        assertEquals(0, store.query("Worker-Iron", 0L).size());
    }

    @Test
    void disconnectClosesTheSession() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        tracker.onPlayerJoin("leivur", false, 1000L);
        tracker.onPlayerDisconnect("leivur", false, 2000L);
        assertEquals(2000L, store.query("leivur", 0L).get(0).leftAtMillis());
    }

    @Test
    void heartbeatFiresAtInterval() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        for (int i = 0; i < 5999; i++) tracker.onEndTick();
        assertNull(store.lastHeartbeatMillis());
        tracker.onEndTick();
        assertNotNull(store.lastHeartbeatMillis());
    }

    @Test
    void closeDanglingSessionsFromPreviousRunUsesLastHeartbeat() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        store.openSession("leivur", 1000L);
        store.recordHeartbeat(5000L);
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        tracker.closeDanglingSessionsFromPreviousRun();
        assertEquals(5000L, store.query("leivur", 0L).get(0).leftAtMillis());
    }

    @Test
    void closeDanglingSessionsFallsBackToNowWithoutHeartbeat() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        store.openSession("leivur", 1000L);
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        long before = System.currentTimeMillis();
        tracker.closeDanglingSessionsFromPreviousRun();
        assertTrue(store.query("leivur", 0L).get(0).leftAtMillis() >= before);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.sessions.PlayerSessionTrackerTest"`
Expected: FAIL to compile — `PlayerSessionTracker` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.sessions;

import java.util.function.IntSupplier;

/**
 * Free of Minecraft/Fabric types so it's unit-testable without a running server - the
 * extension wiring layer translates {@code ServerPlayConnectionEvents.JOIN}/{@code DISCONNECT}
 * callbacks (which hand over a {@code ServerGamePacketListenerImpl}) into calls here.
 */
public final class PlayerSessionTracker {
    private final PlayerSessionStore store;
    private final IntSupplier heartbeatIntervalMinutes;
    private long ticksSinceHeartbeat = 0;

    public PlayerSessionTracker(PlayerSessionStore store, IntSupplier heartbeatIntervalMinutes) {
        this.store = store;
        this.heartbeatIntervalMinutes = heartbeatIntervalMinutes;
    }

    public void onPlayerJoin(String playerName, boolean isFakePlayer, long atMillis) {
        if (isFakePlayer) {
            return;
        }
        store.openSession(playerName, atMillis);
    }

    public void onPlayerDisconnect(String playerName, boolean isFakePlayer, long atMillis) {
        if (isFakePlayer) {
            return;
        }
        store.closeSession(playerName, atMillis);
    }

    public void onEndTick() {
        long intervalTicks = heartbeatIntervalMinutes.getAsInt() * 60L * 20L;
        if (++ticksSinceHeartbeat < intervalTicks) {
            return;
        }
        ticksSinceHeartbeat = 0;
        store.recordHeartbeat(System.currentTimeMillis());
    }

    /** Call once at startup, before registering join/disconnect listeners, to close any
     * session left open by an unclean shutdown. */
    public void closeDanglingSessionsFromPreviousRun() {
        Long lastHeartbeat = store.lastHeartbeatMillis();
        store.closeDanglingSessions(lastHeartbeat != null ? lastHeartbeat : System.currentTimeMillis());
    }
}
```

Now wire it into `MCFarmManagerExtension.java`. Add imports:

```java
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.mcfarmmanager.mod.sessions.PlayerSessionTracker;
import net.mcfarmmanager.mod.sessions.SqlitePlayerSessionStore;
import net.minecraft.server.level.ServerPlayer;
```

Add fields alongside `activeAlertChecker`:

```java
    private static final AtomicBoolean SESSION_LISTENERS_REGISTERED = new AtomicBoolean();
    private static volatile PlayerSessionTracker activeSessionTracker;

    private SqlitePlayerSessionStore sessionStore;
```

In `onServerLoaded`, after the alert store block and before `httpServer = new MCFarmManagerHttpServer(...)`:

```java
        try {
            Path sessionsDbFile = server.getWorldPath(LevelResource.ROOT).resolve("mcfarmmanager/sessions.sqlite");
            Files.createDirectories(sessionsDbFile.getParent());
            sessionStore = new SqlitePlayerSessionStore(sessionsDbFile);
        } catch (IOException e) {
            MCFarmManagerMod.LOGGER.error("Failed to open MCFarmManager session store: {}", e.getMessage());
            sessionStore = null;
            return;
        }

        PlayerSessionTracker sessionTracker = new PlayerSessionTracker(sessionStore,
                () -> Settings.mcfarmmanagerSampleIntervalMinutes);
        sessionTracker.closeDanglingSessionsFromPreviousRun();
        activeSessionTracker = sessionTracker;
        if (SESSION_LISTENERS_REGISTERED.compareAndSet(false, true)) {
            ServerTickEvents.END_SERVER_TICK.register(s -> {
                PlayerSessionTracker tracker = activeSessionTracker;
                if (tracker != null) {
                    tracker.onEndTick();
                }
            });
            ServerPlayConnectionEvents.JOIN.register((handler, sender, srv) -> {
                PlayerSessionTracker tracker = activeSessionTracker;
                if (tracker == null) {
                    return;
                }
                ServerPlayer player = handler.getPlayer();
                tracker.onPlayerJoin(player.getGameProfile().name(),
                        player instanceof carpet.patches.EntityPlayerMPFake, System.currentTimeMillis());
            });
            ServerPlayConnectionEvents.DISCONNECT.register((handler, srv) -> {
                PlayerSessionTracker tracker = activeSessionTracker;
                if (tracker == null) {
                    return;
                }
                ServerPlayer player = handler.getPlayer();
                tracker.onPlayerDisconnect(player.getGameProfile().name(),
                        player instanceof carpet.patches.EntityPlayerMPFake, System.currentTimeMillis());
            });
        }
```

Update `httpServer = new MCFarmManagerHttpServer(...)` to pass `sessionStore` (constructor signature finalized in Task 11):

```java
        httpServer = new MCFarmManagerHttpServer(
                MCFarmManagerMod::farms,
                farmData,
                new RealServerDataProvider(() -> CarpetServer.minecraft_server),
                historyStore,
                alertStore,
                sessionStore,
                Settings.mcfarmmanagerHttpPort,
                Settings.mcfarmmanagerHttpBindAddress);
```

Update `onServerClosed`:

```java
    @Override
    public void onServerClosed(MinecraftServer server) {
        activeSampler = null;
        activeAlertChecker = null;
        activeSessionTracker = null;
        if (httpServer != null) {
            httpServer.stop();
            httpServer = null;
        }
        if (historyStore != null) {
            historyStore.close();
            historyStore = null;
        }
        if (alertStore != null) {
            alertStore.close();
            alertStore = null;
        }
        if (sessionStore != null) {
            sessionStore.close();
            sessionStore = null;
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.sessions.PlayerSessionTrackerTest"`
Expected: PASS (6/6). Note: `./gradlew test` (full suite) won't compile again until Task 11 updates `MCFarmManagerHttpServer`'s constructor to accept `sessionStore` — that's expected at this point in the sequence; run the scoped test command above, not the full suite, until Task 11 lands.

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/sessions/PlayerSessionTracker.java mod/src/test/java/net/mcfarmmanager/mod/sessions/FakePlayerSessionStore.java mod/src/test/java/net/mcfarmmanager/mod/sessions/PlayerSessionTrackerTest.java mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java
git commit -m "feat(mod): track player join/leave sessions with heartbeat-based crash recovery"
```

### Task 11: Mod HTTP endpoint `GET /players/{name}/sessions`

`com.sun.net.httpserver.HttpServer` prefix-matches context paths, so the existing `/players`
context (currently a fixed lambda returning the live player list) must become a router, the
same way `/farms` already is via `handleFarms`.

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/PlayerSessionView.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/PlayerSessionsResponse.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`
- Modify: `mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java`

**Interfaces:**
- Consumes: `PlayerSessionStore`, `PlayerSession`, `FakePlayerSessionStore` (Tasks 9-10).
- Produces: `MCFarmManagerHttpServer` constructor gains a final `PlayerSessionStore sessionStore` parameter (after `AlertStore alertStore`); `GET /players/{name}/sessions?range=<duration>` → `{"playerName": ..., "range": ..., "sessions": [{"joinedAt": ..., "leftAt": ...|null}]}`; `GET /players` behavior unchanged.

- [ ] **Step 1: Write the failing test**

Update the `MCFarmManagerHttpServerTest` setup and add tests:

```java
    private net.mcfarmmanager.mod.sessions.FakePlayerSessionStore sessionStore;

    @BeforeEach
    void start() throws IOException {
        historyStore = new FakeHistoryStore();
        alertStore = new net.mcfarmmanager.mod.alerts.FakeAlertStore();
        sessionStore = new net.mcfarmmanager.mod.sessions.FakePlayerSessionStore();
        server = new MCFarmManagerHttpServer(this::farms, new FakeFarmDataProvider(), new FakeServerDataProvider(),
                historyStore, alertStore, sessionStore, 0, "127.0.0.1");
        server.start();
        port = server.boundPort();
    }

    @Test
    void playerSessionsEndpointReturnsClosedAndOpenSessions() throws Exception {
        sessionStore.openSession("leivur", System.currentTimeMillis() - 60_000);
        sessionStore.closeSession("leivur", System.currentTimeMillis());
        HttpResponse<String> response = get("/players/leivur/sessions");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"playerName\":\"leivur\""));
        assertTrue(response.body().contains("\"joinedAt\""));
    }

    @Test
    void playersListEndpointStillWorksAfterRouterConversion() throws Exception {
        HttpResponse<String> response = get("/players");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"name\":\"leivur\""));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.http.MCFarmManagerHttpServerTest"`
Expected: FAIL to compile — constructor doesn't accept `sessionStore` yet.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.http;

public record PlayerSessionView(String joinedAt, String leftAt) {}
```

```java
package net.mcfarmmanager.mod.http;

import java.util.List;

public record PlayerSessionsResponse(String playerName, String range, List<PlayerSessionView> sessions) {}
```

In `MCFarmManagerHttpServer.java`, add the import and field/constructor parameter:

```java
import net.mcfarmmanager.mod.sessions.PlayerSession;
import net.mcfarmmanager.mod.sessions.PlayerSessionStore;
```

```java
    private final AlertStore alertStore;
    private final PlayerSessionStore sessionStore;
    private final int port;
```

```java
    public MCFarmManagerHttpServer(java.util.function.Supplier<List<FarmConfig>> farmsSupplier, FarmDataProvider farmData,
                                    ServerDataProvider serverData, HistoryStore historyStore, AlertStore alertStore,
                                    PlayerSessionStore sessionStore, int port, String bindAddress) {
        this.farmsSupplier = farmsSupplier;
        this.farmData = farmData;
        this.serverData = serverData;
        this.historyStore = historyStore;
        this.alertStore = alertStore;
        this.sessionStore = sessionStore;
        this.port = port;
        this.bindAddress = bindAddress;
    }
```

Replace the `/players` line in `start()`:

```java
        addContext("/players", this::handlePlayers, hostFilter);
```

Add the router method near `handleFarms`:

```java
    private void handlePlayers(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/players")) {
            respondJson(exchange, Map.of("players", serverData.players()));
            return;
        }
        String remainder = path.substring("/players/".length());
        if (remainder.endsWith("/sessions")) {
            String name = remainder.substring(0, remainder.length() - "/sessions".length());
            String range = queryParam(exchange, "range", "24h");
            List<PlayerSessionView> views = sessionStore.query(name, rangeSinceMillis(range)).stream()
                    .map(MCFarmManagerHttpServer::toSessionView)
                    .toList();
            respondJson(exchange, new PlayerSessionsResponse(name, range, views));
            return;
        }
        respondJson(exchange, 404, Map.of("error", "not found"));
    }

    private static PlayerSessionView toSessionView(PlayerSession session) {
        Long leftAt = session.leftAtMillis();
        return new PlayerSessionView(
                Instant.ofEpochMilli(session.joinedAtMillis()).toString(),
                leftAt != null ? Instant.ofEpochMilli(leftAt).toString() : null);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.http.MCFarmManagerHttpServerTest"`
Expected: PASS. Then run `cd mod && ./gradlew test` for the full suite (this is the task where `MCFarmManagerExtension`'s call site from Task 10 finally compiles against the finished constructor).
Expected: PASS across the whole mod test suite.

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/http/PlayerSessionView.java mod/src/main/java/net/mcfarmmanager/mod/http/PlayerSessionsResponse.java mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java
git commit -m "feat(mod): expose GET /players/{name}/sessions"
```

### Task 12: Dashboard server proxy `GET /api/players/:name/sessions`

**Files:**
- Modify: `dashboard/server/src/routes/players.ts`
- Test: `dashboard/server/test/players.test.ts`

**Interfaces:**
- Produces: `GET /api/players/:name/sessions?range=<duration>` proxying `/players/:name/sessions?range=...`.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/server/test/players.test.ts`:

```typescript
test('GET /api/players/:name/sessions proxies to MCFarmManager', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.includes('/players/leivur/sessions'));
    assert.ok(url.includes('range=7d'));
    return new Response(JSON.stringify({ playerName: 'leivur', range: '7d', sessions: [] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/players/leivur/sessions?range=7d', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().playerName, 'leivur');
});
```

The file currently starts with `import { test } from 'node:test';` (no `mock`) — replace that line with:

```typescript
import { test, mock } from 'node:test';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test -- test/players.test.ts`
Expected: FAIL — route doesn't exist (404).

- [ ] **Step 3: Write minimal implementation**

In `dashboard/server/src/routes/players.ts`, add the import:

```typescript
import { mcfmFetch, McfmError } from '../mcfarmmanager.js';
```

Add the route inside `registerPlayerRoutes`:

```typescript
  app.get('/api/players/:name/sessions', async (req, reply) => {
    const { name } = req.params as { name: string };
    const { range } = req.query as { range?: string };
    try {
      return await mcfmFetch(`/players/${encodeURIComponent(name)}/sessions?range=${encodeURIComponent(range ?? '24h')}`);
    } catch (err) {
      if (err instanceof McfmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test -- test/players.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/players.ts dashboard/server/test/players.test.ts
git commit -m "feat(server): proxy GET /api/players/:name/sessions"
```

### Task 13: Client session hook, SessionChart, and Jugadores wiring

**Files:**
- Modify: `dashboard/client/src/api/types.ts`
- Modify: `dashboard/client/src/api/hooks.ts`
- Create: `dashboard/client/src/components/SessionChart.tsx`
- Modify: `dashboard/client/src/pages/Jugadores.tsx`

**Interfaces:**
- Produces: `PlayerSession { joinedAt: string; leftAt: string | null }`; `usePlayerSessions(name: string, range: string)` (`enabled: !!name`); `SessionChart({ sessions: PlayerSession[] })` default export.

- [ ] **Step 1: Add the type**

Append to `dashboard/client/src/api/types.ts`:

```typescript
export interface PlayerSession {
  joinedAt: string;
  leftAt: string | null;
}
```

- [ ] **Step 2: Add the hook**

Append to `dashboard/client/src/api/hooks.ts` (add `PlayerSession` to the type import at the top):

```typescript
export function usePlayerSessions(name: string, range: string) {
  return useQuery({
    queryKey: ['players', name, 'sessions', range],
    queryFn: () => apiFetch<{ playerName: string; range: string; sessions: PlayerSession[] }>(
      `/players/${encodeURIComponent(name)}/sessions?range=${range}`
    ),
    enabled: !!name,
  });
}
```

- [ ] **Step 3: Write SessionChart**

```tsx
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { PlayerSession } from '../api/types';

function formatDay(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function SessionChart({ sessions }: { sessions: PlayerSession[] }) {
  const closed = sessions.filter((s) => s.leftAt);
  if (closed.length === 0) {
    return <p className="text-sm text-slate-500">Sin sesiones registradas todavía.</p>;
  }
  const rows = closed.map((s) => ({
    joinedAt: s.joinedAt,
    minutes: Math.round((new Date(s.leftAt as string).getTime() - new Date(s.joinedAt).getTime()) / 60_000),
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
        <XAxis dataKey="joinedAt" tickFormatter={formatDay} stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} />
        <Tooltip
          labelFormatter={(v) => new Date(v as string).toLocaleString()}
          formatter={(value) => [`${value} min`, 'Duración']}
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#e2e8f0' }}
        />
        <Bar dataKey="minutes" fill="#60a5fa" />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Wire into Jugadores**

In `dashboard/client/src/pages/Jugadores.tsx`, update the hooks import:

```tsx
import { usePlayers, useCreatePlayer, useUpdatePlayer, useDeletePlayer, useLivePlayers, usePlayerSessions } from '../api/hooks';
import SessionChart from '../components/SessionChart';
```

Add state and the sessions query near the other hooks:

```tsx
  const [sessionPlayer, setSessionPlayer] = useState<string | null>(null);
  const sessions = usePlayerSessions(sessionPlayer ?? '', '7d');
```

Add a "Historial" button inside `renderPlayer`, after the delete button:

```tsx
        <button onClick={() => setSessionPlayer(p.minecraft_name)} className="text-sm text-cyan hover:underline">
          Historial
        </button>
```

Add a session card before the closing `<ConfirmModal .../>` at the end of the returned JSX:

```tsx
      {sessionPlayer && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-slate-200">Conexión de {sessionPlayer} (7 días)</h2>
            <button onClick={() => setSessionPlayer(null)} className="text-sm text-slate-400 hover:underline">
              Cerrar
            </button>
          </div>
          {sessions.data ? <SessionChart sessions={sessions.data.sessions} /> : <p className="text-sm text-slate-500">Cargando…</p>}
        </Card>
      )}
```

- [ ] **Step 5: Typecheck and manual verification**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no new errors. Use the `run` skill to open Jugadores, click "Historial" on a player with recorded sessions, and confirm the chart renders.

- [ ] **Step 6: Commit**

```bash
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts dashboard/client/src/components/SessionChart.tsx dashboard/client/src/pages/Jugadores.tsx
git commit -m "feat(client): show player session history chart in Jugadores"
```

## Feature 4: Server performance history

### Task 14: PerformanceSample record, PerformanceHistoryStore interface, SqlitePerformanceHistoryStore

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/history/PerformanceSample.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/history/PerformanceHistoryStore.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/history/SqlitePerformanceHistoryStore.java`
- Test: `mod/src/test/java/net/mcfarmmanager/mod/history/SqlitePerformanceHistoryStoreTest.java`

**Interfaces:**
- Produces: `PerformanceSample(long sampledAtMillis, double tps, double meanTickTimeMs)`; `PerformanceHistoryStore.recordSample(long sampledAtMillis, double tps, double meanTickTimeMs)`, `.query(long sinceMillis): List<PerformanceSample>`, `.pruneOlderThan(long cutoffMillis)`.

- [ ] **Step 1: Write the failing test**

```java
package net.mcfarmmanager.mod.history;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SqlitePerformanceHistoryStoreTest {
    private Path dbFile;
    private SqlitePerformanceHistoryStore store;

    @BeforeEach
    void setUp() throws IOException {
        dbFile = Files.createTempFile("performance", ".sqlite");
        Files.delete(dbFile);
        store = new SqlitePerformanceHistoryStore(dbFile);
    }

    @AfterEach
    void tearDown() throws IOException {
        store.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void recordsAndQueriesSamples() {
        store.recordSample(1000L, 19.9, 50.1);
        store.recordSample(2000L, 18.5, 54.0);
        List<PerformanceSample> samples = store.query(0L);
        assertEquals(2, samples.size());
        assertEquals(19.9, samples.get(0).tps());
        assertEquals(54.0, samples.get(1).meanTickTimeMs());
    }

    @Test
    void queryFiltersBySinceMillis() {
        store.recordSample(1000L, 20.0, 50.0);
        store.recordSample(5000L, 20.0, 50.0);
        assertEquals(1, store.query(4000L).size());
    }

    @Test
    void pruneRemovesOldRowsOnly() {
        store.recordSample(1000L, 20.0, 50.0);
        store.recordSample(9000L, 20.0, 50.0);
        store.pruneOlderThan(5000L);
        assertEquals(1, store.query(0L).size());
        assertEquals(9000L, store.query(0L).get(0).sampledAtMillis());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.history.SqlitePerformanceHistoryStoreTest"`
Expected: FAIL to compile — classes don't exist yet.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.history;

public record PerformanceSample(long sampledAtMillis, double tps, double meanTickTimeMs) {}
```

```java
package net.mcfarmmanager.mod.history;

import java.util.List;

public interface PerformanceHistoryStore {
    void recordSample(long sampledAtMillis, double tps, double meanTickTimeMs);
    List<PerformanceSample> query(long sinceMillis);
    void pruneOlderThan(long cutoffMillis);
}
```

```java
package net.mcfarmmanager.mod.history;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public final class SqlitePerformanceHistoryStore implements PerformanceHistoryStore {
    private final Connection connection;

    public SqlitePerformanceHistoryStore(Path dbFile) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + dbFile);
            try (Statement stmt = connection.createStatement()) {
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS performance_samples (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      sampled_at INTEGER NOT NULL,
                      tps REAL NOT NULL,
                      mean_tick_time_ms REAL NOT NULL
                    )""");
                stmt.execute(
                    "CREATE INDEX IF NOT EXISTS idx_performance_samples_time ON performance_samples (sampled_at)");
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open performance history store at " + dbFile, e);
        }
    }

    @Override
    public void recordSample(long sampledAtMillis, double tps, double meanTickTimeMs) {
        String sql = "INSERT INTO performance_samples (sampled_at, tps, mean_tick_time_ms) VALUES (?, ?, ?)";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, sampledAtMillis);
            stmt.setDouble(2, tps);
            stmt.setDouble(3, meanTickTimeMs);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to record performance sample", e);
        }
    }

    @Override
    public List<PerformanceSample> query(long sinceMillis) {
        String sql = "SELECT sampled_at, tps, mean_tick_time_ms FROM performance_samples "
                + "WHERE sampled_at >= ? ORDER BY sampled_at ASC";
        List<PerformanceSample> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, sinceMillis);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    results.add(new PerformanceSample(rs.getLong("sampled_at"), rs.getDouble("tps"),
                            rs.getDouble("mean_tick_time_ms")));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query performance samples", e);
        }
        return results;
    }

    @Override
    public void pruneOlderThan(long cutoffMillis) {
        try (PreparedStatement stmt = connection.prepareStatement(
                "DELETE FROM performance_samples WHERE sampled_at < ?")) {
            stmt.setLong(1, cutoffMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to prune performance samples", e);
        }
    }

    public void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close performance history store", e);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.history.SqlitePerformanceHistoryStoreTest"`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/history/PerformanceSample.java mod/src/main/java/net/mcfarmmanager/mod/history/PerformanceHistoryStore.java mod/src/main/java/net/mcfarmmanager/mod/history/SqlitePerformanceHistoryStore.java mod/src/test/java/net/mcfarmmanager/mod/history/SqlitePerformanceHistoryStoreTest.java
git commit -m "feat(mod): add PerformanceSample record and SqlitePerformanceHistoryStore"
```

### Task 15: PerformanceSampler ticker + wire into extension

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/history/PerformanceSampler.java`
- Create: `mod/src/test/java/net/mcfarmmanager/mod/history/FakePerformanceHistoryStore.java`
- Test: `mod/src/test/java/net/mcfarmmanager/mod/history/PerformanceSamplerTest.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java`

**Interfaces:**
- Consumes: `PerformanceHistoryStore` (Task 14); `net.mcfarmmanager.mod.server.PerformanceInfo` (`tps()`, `meanTickTimeMs()`).
- Produces: `PerformanceSampler(Supplier<PerformanceInfo>, PerformanceHistoryStore, IntSupplier sampleIntervalMinutes, IntSupplier retentionDays)` with `onEndTick()`.

- [ ] **Step 1: Write the failing test**

```java
package net.mcfarmmanager.mod.history;

import java.util.ArrayList;
import java.util.List;

public final class FakePerformanceHistoryStore implements PerformanceHistoryStore {
    private final List<PerformanceSample> samples = new ArrayList<>();

    @Override
    public void recordSample(long sampledAtMillis, double tps, double meanTickTimeMs) {
        samples.add(new PerformanceSample(sampledAtMillis, tps, meanTickTimeMs));
    }

    @Override
    public List<PerformanceSample> query(long sinceMillis) {
        return samples.stream().filter(s -> s.sampledAtMillis() >= sinceMillis)
                .sorted(java.util.Comparator.comparingLong(PerformanceSample::sampledAtMillis)).toList();
    }

    @Override
    public void pruneOlderThan(long cutoffMillis) {
        samples.removeIf(s -> s.sampledAtMillis() < cutoffMillis);
    }
}
```

```java
package net.mcfarmmanager.mod.history;

import net.mcfarmmanager.mod.server.PerformanceInfo;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PerformanceSamplerTest {
    @Test
    void samplesAtInterval() {
        FakePerformanceHistoryStore store = new FakePerformanceHistoryStore();
        PerformanceSampler sampler = new PerformanceSampler(() -> new PerformanceInfo(19.5, 51.2, 100),
                store, () -> 5, () -> 30);

        for (int i = 0; i < 5999; i++) sampler.onEndTick();
        assertTrue(store.query(0L).isEmpty());

        sampler.onEndTick();
        assertEquals(1, store.query(0L).size());
        assertEquals(19.5, store.query(0L).get(0).tps());
    }

    @Test
    void prunesSamplesOlderThanRetention() {
        FakePerformanceHistoryStore store = new FakePerformanceHistoryStore();
        store.recordSample(0L, 20.0, 50.0);
        PerformanceSampler sampler = new PerformanceSampler(() -> new PerformanceInfo(19.5, 51.2, 100),
                store, () -> 5, () -> 30);
        for (int i = 0; i < 6000; i++) sampler.onEndTick();
        assertTrue(store.query(0L).stream().noneMatch(s -> s.sampledAtMillis() == 0L));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.history.PerformanceSamplerTest"`
Expected: FAIL to compile — `PerformanceSampler` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.history;

import net.mcfarmmanager.mod.server.PerformanceInfo;

import java.util.function.IntSupplier;
import java.util.function.Supplier;

/** Sibling ticker to {@link FarmSampler}, same cadence, own SQLite table. */
public final class PerformanceSampler {
    private final Supplier<PerformanceInfo> performanceSupplier;
    private final PerformanceHistoryStore store;
    private final IntSupplier sampleIntervalMinutes;
    private final IntSupplier retentionDays;
    private long ticksSinceLastSample = 0;

    public PerformanceSampler(Supplier<PerformanceInfo> performanceSupplier, PerformanceHistoryStore store,
                               IntSupplier sampleIntervalMinutes, IntSupplier retentionDays) {
        this.performanceSupplier = performanceSupplier;
        this.store = store;
        this.sampleIntervalMinutes = sampleIntervalMinutes;
        this.retentionDays = retentionDays;
    }

    public void onEndTick() {
        long intervalTicks = sampleIntervalMinutes.getAsInt() * 60L * 20L;
        if (++ticksSinceLastSample < intervalTicks) {
            return;
        }
        ticksSinceLastSample = 0;
        sampleAndPrune();
    }

    private void sampleAndPrune() {
        long now = System.currentTimeMillis();
        PerformanceInfo info = performanceSupplier.get();
        store.recordSample(now, info.tps(), info.meanTickTimeMs());
        long cutoffMillis = now - retentionDays.getAsInt() * 24L * 60L * 60L * 1000L;
        store.pruneOlderThan(cutoffMillis);
    }
}
```

Wire it into `MCFarmManagerExtension.java`. Add imports:

```java
import net.mcfarmmanager.mod.history.PerformanceSampler;
import net.mcfarmmanager.mod.history.SqlitePerformanceHistoryStore;
```

Add fields alongside `activeSessionTracker`:

```java
    private static final AtomicBoolean PERFORMANCE_TICK_LISTENER_REGISTERED = new AtomicBoolean();
    private static volatile PerformanceSampler activePerformanceSampler;

    private SqlitePerformanceHistoryStore performanceHistoryStore;
```

In `onServerLoaded`, after the session store block and before `httpServer = new MCFarmManagerHttpServer(...)`:

```java
        try {
            Path performanceDbFile = server.getWorldPath(LevelResource.ROOT).resolve("mcfarmmanager/performance.sqlite");
            Files.createDirectories(performanceDbFile.getParent());
            performanceHistoryStore = new SqlitePerformanceHistoryStore(performanceDbFile);
        } catch (IOException e) {
            MCFarmManagerMod.LOGGER.error("Failed to open MCFarmManager performance history store: {}", e.getMessage());
            performanceHistoryStore = null;
            return;
        }

        RealServerDataProvider realServerData = new RealServerDataProvider(() -> CarpetServer.minecraft_server);
        activePerformanceSampler = new PerformanceSampler(realServerData::performance, performanceHistoryStore,
                () -> Settings.mcfarmmanagerSampleIntervalMinutes, () -> Settings.mcfarmmanagerHistoryRetentionDays);
        if (PERFORMANCE_TICK_LISTENER_REGISTERED.compareAndSet(false, true)) {
            ServerTickEvents.END_SERVER_TICK.register(s -> {
                PerformanceSampler sampler = activePerformanceSampler;
                if (sampler != null) {
                    sampler.onEndTick();
                }
            });
        }
```

Replace the existing `httpServer = new MCFarmManagerHttpServer(...)` block, reusing the `realServerData` instance just created instead of constructing a second `RealServerDataProvider`, and passing `performanceHistoryStore` (constructor signature finalized in Task 16):

```java
        httpServer = new MCFarmManagerHttpServer(
                MCFarmManagerMod::farms,
                farmData,
                realServerData,
                historyStore,
                alertStore,
                sessionStore,
                performanceHistoryStore,
                Settings.mcfarmmanagerHttpPort,
                Settings.mcfarmmanagerHttpBindAddress);
```

Update `onServerClosed`:

```java
    @Override
    public void onServerClosed(MinecraftServer server) {
        activeSampler = null;
        activeAlertChecker = null;
        activeSessionTracker = null;
        activePerformanceSampler = null;
        if (httpServer != null) {
            httpServer.stop();
            httpServer = null;
        }
        if (historyStore != null) {
            historyStore.close();
            historyStore = null;
        }
        if (alertStore != null) {
            alertStore.close();
            alertStore = null;
        }
        if (sessionStore != null) {
            sessionStore.close();
            sessionStore = null;
        }
        if (performanceHistoryStore != null) {
            performanceHistoryStore.close();
            performanceHistoryStore = null;
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.history.PerformanceSamplerTest"`
Expected: PASS (2/2). As in Task 10, the full `./gradlew test` suite won't compile until Task 16 finishes `MCFarmManagerHttpServer`'s constructor — run the scoped command until then.

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/history/PerformanceSampler.java mod/src/test/java/net/mcfarmmanager/mod/history/FakePerformanceHistoryStore.java mod/src/test/java/net/mcfarmmanager/mod/history/PerformanceSamplerTest.java mod/src/main/java/net/mcfarmmanager/mod/MCFarmManagerExtension.java
git commit -m "feat(mod): sample TPS/tick-time history alongside farm history"
```

### Task 16: Mod HTTP endpoint `GET /performance/history`

Same prefix-matching issue as Task 11: `/performance` is currently a fixed lambda and must
become a router.

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/PerformanceSampleView.java`
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/PerformanceHistoryResponse.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`
- Modify: `mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java`

**Interfaces:**
- Consumes: `PerformanceHistoryStore`, `PerformanceSample`, `FakePerformanceHistoryStore` (Tasks 14-15).
- Produces: `MCFarmManagerHttpServer` constructor gains a final `PerformanceHistoryStore performanceHistoryStore` parameter (after `PlayerSessionStore sessionStore`) — this is the constructor's final shape, matching what Tasks 10 and 15's extension wiring already call; `GET /performance/history?range=<duration>` → `{"range": ..., "samples": [{"sampledAt": ..., "tps": ..., "meanTickTimeMs": ...}]}`; `GET /performance` behavior unchanged.

- [ ] **Step 1: Write the failing test**

Update the `MCFarmManagerHttpServerTest` setup and add tests:

```java
    private net.mcfarmmanager.mod.history.FakePerformanceHistoryStore performanceHistoryStore;

    @BeforeEach
    void start() throws IOException {
        historyStore = new FakeHistoryStore();
        alertStore = new net.mcfarmmanager.mod.alerts.FakeAlertStore();
        sessionStore = new net.mcfarmmanager.mod.sessions.FakePlayerSessionStore();
        performanceHistoryStore = new net.mcfarmmanager.mod.history.FakePerformanceHistoryStore();
        server = new MCFarmManagerHttpServer(this::farms, new FakeFarmDataProvider(), new FakeServerDataProvider(),
                historyStore, alertStore, sessionStore, performanceHistoryStore, 0, "127.0.0.1");
        server.start();
        port = server.boundPort();
    }

    @Test
    void performanceHistoryEndpointReturnsSamples() throws Exception {
        performanceHistoryStore.recordSample(System.currentTimeMillis(), 19.5, 51.2);
        HttpResponse<String> response = get("/performance/history");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"tps\":19.5"));
        assertTrue(response.body().contains("\"range\":\"24h\""));
    }

    @Test
    void performanceEndpointStillWorksAfterRouterConversion() throws Exception {
        HttpResponse<String> response = get("/performance");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"tps\":19.87"));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.http.MCFarmManagerHttpServerTest"`
Expected: FAIL to compile — constructor doesn't accept `performanceHistoryStore` yet.

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.http;

public record PerformanceSampleView(String sampledAt, double tps, double meanTickTimeMs) {}
```

```java
package net.mcfarmmanager.mod.http;

import java.util.List;

public record PerformanceHistoryResponse(String range, List<PerformanceSampleView> samples) {}
```

In `MCFarmManagerHttpServer.java`, add the import and field/constructor parameter:

```java
import net.mcfarmmanager.mod.history.PerformanceHistoryStore;
import net.mcfarmmanager.mod.history.PerformanceSample;
```

```java
    private final PlayerSessionStore sessionStore;
    private final PerformanceHistoryStore performanceHistoryStore;
    private final int port;
```

```java
    public MCFarmManagerHttpServer(java.util.function.Supplier<List<FarmConfig>> farmsSupplier, FarmDataProvider farmData,
                                    ServerDataProvider serverData, HistoryStore historyStore, AlertStore alertStore,
                                    PlayerSessionStore sessionStore, PerformanceHistoryStore performanceHistoryStore,
                                    int port, String bindAddress) {
        this.farmsSupplier = farmsSupplier;
        this.farmData = farmData;
        this.serverData = serverData;
        this.historyStore = historyStore;
        this.alertStore = alertStore;
        this.sessionStore = sessionStore;
        this.performanceHistoryStore = performanceHistoryStore;
        this.port = port;
        this.bindAddress = bindAddress;
    }
```

Replace the `/performance` line in `start()`:

```java
        addContext("/performance", this::handlePerformance, hostFilter);
```

Add the router method near `handlePlayers`:

```java
    private void handlePerformance(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/performance")) {
            respondJson(exchange, serverData.performance());
            return;
        }
        if (path.equals("/performance/history")) {
            String range = queryParam(exchange, "range", "24h");
            List<PerformanceSampleView> views = performanceHistoryStore.query(rangeSinceMillis(range)).stream()
                    .map(MCFarmManagerHttpServer::toPerformanceView)
                    .toList();
            respondJson(exchange, new PerformanceHistoryResponse(range, views));
            return;
        }
        respondJson(exchange, 404, Map.of("error", "not found"));
    }

    private static PerformanceSampleView toPerformanceView(PerformanceSample sample) {
        return new PerformanceSampleView(Instant.ofEpochMilli(sample.sampledAtMillis()).toString(),
                sample.tps(), sample.meanTickTimeMs());
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test`
Expected: PASS across the full mod test suite (this is the task where `MCFarmManagerExtension`'s call site from Task 15 finally compiles against the finished constructor).

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/http/PerformanceSampleView.java mod/src/main/java/net/mcfarmmanager/mod/http/PerformanceHistoryResponse.java mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java
git commit -m "feat(mod): expose GET /performance/history"
```

### Task 17: Dashboard server proxy `GET /api/performance/history`

**Files:**
- Modify: `dashboard/server/src/routes/misc.ts`
- Modify: `dashboard/server/test/misc.test.ts`

**Interfaces:**
- Produces: `GET /api/performance/history?range=<duration>` proxying `/performance/history?range=...`.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/server/test/misc.test.ts`:

```typescript
test('GET /api/performance/history proxies range param', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.includes('/performance/history'));
    assert.ok(url.includes('range=7d'));
    return new Response(JSON.stringify({ range: '7d', samples: [] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/performance/history?range=7d', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().range, '7d');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test -- test/misc.test.ts`
Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Add to `registerMiscRoutes` in `dashboard/server/src/routes/misc.ts`, after the `/api/status` line:

```typescript
  app.get('/api/performance/history', async (req, reply) => {
    const { range } = req.query as { range?: string };
    try {
      return await mcfmFetch(`/performance/history?range=${encodeURIComponent(range ?? '24h')}`);
    } catch (err) {
      if (err instanceof McfmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test -- test/misc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/misc.ts dashboard/server/test/misc.test.ts
git commit -m "feat(server): proxy GET /api/performance/history"
```

### Task 18: Client performance history hook, PerformanceChart, and Overview wiring

**Files:**
- Modify: `dashboard/client/src/api/types.ts`
- Modify: `dashboard/client/src/api/hooks.ts`
- Create: `dashboard/client/src/components/PerformanceChart.tsx`
- Modify: `dashboard/client/src/pages/Overview.tsx`

**Interfaces:**
- Produces: `PerformanceHistorySample { sampledAt: string; tps: number; meanTickTimeMs: number }`; `usePerformanceHistory(range: string)` (`refetchInterval: 30_000`); `PerformanceChart({ samples: PerformanceHistorySample[] })` default export.

- [ ] **Step 1: Add the type**

Append to `dashboard/client/src/api/types.ts`:

```typescript
export interface PerformanceHistorySample {
  sampledAt: string;
  tps: number;
  meanTickTimeMs: number;
}
```

- [ ] **Step 2: Add the hook**

Append to `dashboard/client/src/api/hooks.ts` (add `PerformanceHistorySample` to the type import at the top):

```typescript
export function usePerformanceHistory(range: string) {
  return useQuery({
    queryKey: ['performance', 'history', range],
    queryFn: () => apiFetch<{ range: string; samples: PerformanceHistorySample[] }>(`/performance/history?range=${range}`),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 3: Write PerformanceChart**

```tsx
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { PerformanceHistorySample } from '../api/types';

function formatTick(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function PerformanceChart({ samples }: { samples: PerformanceHistorySample[] }) {
  if (samples.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos históricos todavía.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={samples} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
        <XAxis dataKey="sampledAt" tickFormatter={formatTick} stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 20]} />
        <Tooltip
          labelFormatter={(v) => new Date(v as string).toLocaleString()}
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#e2e8f0' }}
        />
        <Legend />
        <Line type="monotone" dataKey="tps" name="TPS" stroke="#4ade80" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Wire into Overview**

In `dashboard/client/src/pages/Overview.tsx`, update the imports:

```tsx
import { useTasks, useUpdateTask, useFarms, useLivePlayers, usePerformance, usePerformanceHistory } from '../api/hooks';
import PerformanceChart from '../components/PerformanceChart';
```

Add the hook call alongside the others:

```tsx
  const performanceHistory = usePerformanceHistory('24h');
```

Add a new section after the closing `</motion.div>` of the stat-tile grid, before the "Tareas que necesitan atención" section:

```tsx
      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">TPS del servidor (24h)</h2>
        <Card>
          {performanceHistory.data ? (
            <PerformanceChart samples={performanceHistory.data.samples} />
          ) : (
            <p className="text-sm text-slate-500">Cargando…</p>
          )}
        </Card>
      </section>
```

- [ ] **Step 5: Typecheck and manual verification**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no new errors. Use the `run` skill to confirm the chart renders on Overview alongside the existing TPS stat tile.

- [ ] **Step 6: Commit**

```bash
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts dashboard/client/src/components/PerformanceChart.tsx dashboard/client/src/pages/Overview.tsx
git commit -m "feat(client): add server performance history chart to Overview"
```

## Feature 5: Storage/shulker search

### Task 19: Mod HTTP endpoint `GET /search?item=`

No new store is needed — `farmsSupplier` and `farmData` (both already constructor fields) are
enough, reusing `ItemStackInfo.selfAndContents()` exactly like `FarmSampler`'s per-item
aggregation. No constructor changes in this task.

**Files:**
- Create: `mod/src/main/java/net/mcfarmmanager/mod/http/SearchResult.java`
- Modify: `mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java`
- Modify: `mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java`

**Interfaces:**
- Produces: `GET /search?item=<substring>` → `{"results": [{"farmId", "farmName", "storageId", "storageLabel", "itemId", "count"}]}`, case-insensitive substring match, counts aggregated per `(storage, itemId)`. Empty or missing `item` param returns `{"results": []}`.

- [ ] **Step 1: Write the failing test**

Add to `MCFarmManagerHttpServerTest.java` (uses the existing `FakeFarmDataProvider`, whose `storage()` returns one `iron_ingot` stack of 1728 plus a shulker box containing 1000 more `iron_ingot`, per `farms()`'s single `main-chest` storage config):

```java
    @Test
    void searchEndpointFindsMatchingItemsAcrossFarms() throws Exception {
        HttpResponse<String> response = get("/search?item=iron_ingot");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"farmId\":\"iron\""));
        assertTrue(response.body().contains("\"storageId\":\"main-chest\""));
        // 1728 loose + 1000 inside the shulker box, aggregated into one row for this storage+item
        assertTrue(response.body().contains("\"count\":2728"));
    }

    @Test
    void searchEndpointIsCaseInsensitive() throws Exception {
        HttpResponse<String> response = get("/search?item=IRON_INGOT");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"itemId\":\"minecraft:iron_ingot\""));
    }

    @Test
    void searchEndpointReturnsEmptyResultsForNoMatch() throws Exception {
        HttpResponse<String> response = get("/search?item=diamond");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"results\":[]"));
    }

    @Test
    void searchEndpointReturnsEmptyResultsWithoutItemParam() throws Exception {
        HttpResponse<String> response = get("/search");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"results\":[]"));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mod && ./gradlew test --tests "net.mcfarmmanager.mod.http.MCFarmManagerHttpServerTest"`
Expected: FAIL — `/search` context doesn't exist yet (404).

- [ ] **Step 3: Write minimal implementation**

```java
package net.mcfarmmanager.mod.http;

public record SearchResult(String farmId, String farmName, String storageId, String storageLabel, String itemId, int count) {}
```

Add to `start()`, after the `/search`-adjacent `/status` line:

```java
        addContext("/search", this::handleSearch, hostFilter);
```

Add the handler near `handleFarmHistory`:

```java
    private void handleSearch(HttpExchange exchange) throws IOException {
        String itemQuery = queryParam(exchange, "item", "").toLowerCase(Locale.ROOT);
        List<SearchResult> results = new java.util.ArrayList<>();
        if (!itemQuery.isBlank()) {
            for (FarmConfig farm : farmsSupplier.get()) {
                for (net.mcfarmmanager.mod.data.StorageInfo storage : farmData.storage(farm)) {
                    Map<String, Integer> counts = storage.items().stream()
                            .flatMap(net.mcfarmmanager.mod.data.ItemStackInfo::selfAndContents)
                            .filter(item -> item.itemId().toLowerCase(Locale.ROOT).contains(itemQuery))
                            .collect(java.util.stream.Collectors.groupingBy(
                                    net.mcfarmmanager.mod.data.ItemStackInfo::itemId,
                                    java.util.stream.Collectors.summingInt(net.mcfarmmanager.mod.data.ItemStackInfo::count)));
                    counts.forEach((itemId, count) ->
                            results.add(new SearchResult(farm.id(), farm.name(), storage.id(), storage.label(), itemId, count)));
                }
            }
        }
        respondJson(exchange, Map.of("results", results));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mod && ./gradlew test`
Expected: PASS across the full mod test suite.

- [ ] **Step 5: Commit**

```bash
git add mod/src/main/java/net/mcfarmmanager/mod/http/SearchResult.java mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java mod/src/test/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServerTest.java
git commit -m "feat(mod): expose GET /search for storage item lookup"
```

### Task 20: Dashboard server proxy `GET /api/search`

**Files:**
- Modify: `dashboard/server/src/routes/misc.ts`
- Modify: `dashboard/server/test/misc.test.ts`

**Interfaces:**
- Produces: `GET /api/search?item=<substring>` proxying `/search?item=...`.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/server/test/misc.test.ts`:

```typescript
test('GET /api/search proxies the item query', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.includes('/search?item=diamond'));
    return new Response(JSON.stringify({ results: [{ farmId: 'iron', farmName: 'Iron Farm', storageId: 'main-chest', storageLabel: 'Cofre principal', itemId: 'minecraft:diamond', count: 12 }] }), { status: 200 });
  });
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({ method: 'GET', url: '/api/search?item=diamond', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().results[0].itemId, 'minecraft:diamond');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test -- test/misc.test.ts`
Expected: FAIL — route doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Add to `registerMiscRoutes` in `dashboard/server/src/routes/misc.ts`, after the `/api/performance/history` block:

```typescript
  app.get('/api/search', async (req, reply) => {
    const { item } = req.query as { item?: string };
    try {
      return await mcfmFetch(`/search?item=${encodeURIComponent(item ?? '')}`);
    } catch (err) {
      if (err instanceof McfmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test -- test/misc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/misc.ts dashboard/server/test/misc.test.ts
git commit -m "feat(server): proxy GET /api/search"
```

### Task 21: Client search hook and search box on Granjas

**Files:**
- Modify: `dashboard/client/src/api/types.ts`
- Modify: `dashboard/client/src/api/hooks.ts`
- Modify: `dashboard/client/src/pages/Granjas.tsx`

**Interfaces:**
- Produces: `SearchResult { farmId: string; farmName: string; storageId: string; storageLabel: string; itemId: string; count: number }`; `useSearch(item: string)` (`enabled: item.trim().length > 0`).

- [ ] **Step 1: Add the type**

Append to `dashboard/client/src/api/types.ts`:

```typescript
export interface SearchResult {
  farmId: string;
  farmName: string;
  storageId: string;
  storageLabel: string;
  itemId: string;
  count: number;
}
```

- [ ] **Step 2: Add the hook**

Append to `dashboard/client/src/api/hooks.ts` (add `SearchResult` to the type import at the top):

```typescript
export function useSearch(item: string) {
  return useQuery({
    queryKey: ['search', item],
    queryFn: () => apiFetch<{ results: SearchResult[] }>(`/search?item=${encodeURIComponent(item)}`),
    enabled: item.trim().length > 0,
  });
}
```

- [ ] **Step 3: Add the search box**

In `dashboard/client/src/pages/Granjas.tsx`, update the hooks import:

```tsx
import { useFarms, useCreateFarm, useUpdateFarmMetadata, useSearch } from '../api/hooks';
```

Add state and the query near the other `useState` calls:

```tsx
  const [searchTerm, setSearchTerm] = useState('');
  const search = useSearch(searchTerm);
```

Add a search `<Card>` right after the header `<div className="flex flex-wrap items-center justify-between gap-3">...</div>` block, before the category loop:

```tsx
      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Buscar en almacenamiento</h2>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar ítem (ej. diamond)"
          className="w-full rounded border border-border bg-base px-3 py-2"
        />
        {searchTerm.trim() && (
          <div className="mt-3 space-y-1">
            {(search.data?.results.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">Sin resultados.</p>
            ) : (
              search.data!.results.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <Link to={`/granjas/${r.farmId}`} className="text-cyan hover:underline">
                    {r.farmName} · {r.storageLabel}
                  </Link>
                  <span className="font-mono text-slate-400">
                    {r.itemId.replace(/^minecraft:/, '')} × {r.count}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </Card>
```

- [ ] **Step 4: Typecheck and manual verification**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no new errors. Use the `run` skill to search for a known stored item and confirm the result list links to the right farm.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts dashboard/client/src/pages/Granjas.tsx
git commit -m "feat(client): add storage search box to Granjas"
```

## Feature 6: Granja "off" reason + auto re-check reminder

### Task 22: `off_reason` column migration

**Files:**
- Modify: `dashboard/server/src/schema.sql`
- Modify: `dashboard/server/src/db.ts`
- Test: `dashboard/server/test/db.test.ts`

**Interfaces:**
- Produces: `farm_metadata.off_reason TEXT` (nullable), present on both fresh databases (via `schema.sql`) and existing ones (via the `ALTER TABLE` migration in `openDb`).

- [ ] **Step 1: Write the failing test**

Append to `dashboard/server/test/db.test.ts`:

```typescript
test('openDb adds off_reason column to farm_metadata if missing', () => {
  const db = openDb(':memory:');
  const columns = db.prepare('PRAGMA table_info(farm_metadata)').all() as Array<{ name: string }>;
  assert.ok(columns.some((c) => c.name === 'off_reason'));
});
```

(Check `dashboard/server/test/db.test.ts`'s existing imports first — if `openDb` and `assert` aren't already imported at the top, add `import { openDb } from '../src/db.js';` and `import assert from 'node:assert/strict';`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test -- test/db.test.ts`
Expected: FAIL — `off_reason` isn't a column yet.

- [ ] **Step 3: Write minimal implementation**

In `dashboard/server/src/schema.sql`, add `off_reason TEXT,` to the `farm_metadata` table, right after `off INTEGER NOT NULL DEFAULT 0,`:

```sql
CREATE TABLE IF NOT EXISTS farm_metadata (
  farm_id TEXT PRIMARY KEY,
  notes TEXT,
  tags TEXT,
  coordinates TEXT,
  manual INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  off INTEGER NOT NULL DEFAULT 0,
  off_reason TEXT
);
```

In `dashboard/server/src/db.ts`, add the migration right after the existing `off` column migration block:

```typescript
  if (!farmMetadataColumns.some((c) => c.name === 'off')) {
    db.exec('ALTER TABLE farm_metadata ADD COLUMN off INTEGER NOT NULL DEFAULT 0');
  }
  if (!farmMetadataColumns.some((c) => c.name === 'off_reason')) {
    db.exec('ALTER TABLE farm_metadata ADD COLUMN off_reason TEXT');
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test -- test/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/schema.sql dashboard/server/src/db.ts dashboard/server/test/db.test.ts
git commit -m "feat(server): add off_reason column to farm_metadata"
```

### Task 23: Persist `off_reason` and auto-insert reminder task on off transition

**Files:**
- Modify: `dashboard/server/src/routes/tasks.ts`
- Modify: `dashboard/server/src/routes/farms.ts`
- Test: `dashboard/server/test/farms.test.ts`

**Interfaces:**
- Consumes: Task 22's `off_reason` column.
- Produces: `tasks.ts` exports `insertTask(db, input: unknown): Task`, factored out of the `POST /api/tasks` handler body so `farms.ts` can call the exact same insert logic directly (not via HTTP), per the design spec. `PATCH /api/farms/:id/metadata` persists `off_reason` and, when `off` transitions `false → true` in that same request, calls `insertTask` with title `"Revisar granja apagada: {farm name}"`, `due_date` = now + 7 days, `farm_id` = the farm's id, `status = 'todo'`, `priority = 'med'`. No task is created when `off` was already `true` or is being cleared.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/server/test/farms.test.ts`:

```typescript
test('PATCH /api/farms/:id/metadata round-trips off_reason', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { off: true, off_reason: 'Sin hierro cerca, reubicar' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().metadata.off_reason, 'Sin hierro cerca, reubicar');
});

test('turning a farm off auto-creates a 7-day reminder task linked to that farm', async (t) => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ id: 'iron', name: 'Iron Farm' }), { status: 200 })
  );
  t.after(() => fetchMock.mock.restore());

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/farms/iron/metadata',
    headers: { cookie },
    payload: { off: true },
  });
  assert.equal(res.statusCode, 200);

  const tasks = db.prepare('SELECT * FROM tasks WHERE farm_id = ?').all('iron') as Array<{ title: string; priority: string; status: string; due_date: string }>;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, 'Revisar granja apagada: Iron Farm');
  assert.equal(tasks[0].priority, 'med');
  assert.equal(tasks[0].status, 'todo');
  assert.ok(tasks[0].due_date);
});

test('turning an already-off farm off again does not create a duplicate reminder task', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  db.prepare('INSERT INTO farm_metadata (farm_id, off) VALUES (?, 1)').run('iron');

  await app.inject({ method: 'PATCH', url: '/api/farms/iron/metadata', headers: { cookie }, payload: { off: true } });

  const tasks = db.prepare('SELECT * FROM tasks WHERE farm_id = ?').all('iron');
  assert.equal(tasks.length, 0);
});

test('turning a farm back on does not create a reminder task', async () => {
  const { app, db } = makeApp();
  const cookie = await loginAndGetCookie(app, db);
  db.prepare('INSERT INTO farm_metadata (farm_id, off) VALUES (?, 1)').run('iron');

  await app.inject({ method: 'PATCH', url: '/api/farms/iron/metadata', headers: { cookie }, payload: { off: false } });

  const tasks = db.prepare('SELECT * FROM tasks WHERE farm_id = ?').all('iron');
  assert.equal(tasks.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard/server && npm test -- test/farms.test.ts`
Expected: FAIL — `off_reason` isn't persisted, and no reminder task is created.

- [ ] **Step 3: Write minimal implementation**

In `dashboard/server/src/routes/tasks.ts`, factor the insert out of the `POST /api/tasks` handler into an exported function, placed right before `registerTaskRoutes`:

```typescript
export function insertTask(db: Database.Database, input: unknown) {
  const body = taskInput.parse(input);
  const completed_at = body.status === 'done' ? sqlNow(db) : null;
  const info = db
    .prepare(
      `INSERT INTO tasks (title, description, status, priority, due_date, farm_id, project_id, completed_at, archived)
       VALUES (@title, @description, @status, @priority, @due_date, @farm_id, @project_id, @completed_at, @archived)`
    )
    .run({
      title: body.title,
      description: body.description ?? null,
      status: body.status,
      priority: body.priority,
      due_date: body.due_date ?? null,
      farm_id: body.farm_id ?? null,
      project_id: body.project_id ?? null,
      completed_at,
      archived: 0,
    });
  setAssignees(db, Number(info.lastInsertRowid), body.assignee_ids);
  return hydrateTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) as TaskRow);
}
```

Replace the `POST /api/tasks` handler body to call it:

```typescript
  app.post('/api/tasks', async (req, reply) => {
    const task = insertTask(db, req.body);
    reply.code(201);
    return task;
  });
```

In `dashboard/server/src/routes/farms.ts`, add the import:

```typescript
import { insertTask } from './tasks.js';
```

Update `FarmMetadataRow`, `getMetadata`, and `metadataSchema` to include `off_reason`:

```typescript
interface FarmMetadataRow {
  farm_id: string;
  notes: string | null;
  tags: string | null;
  coordinates: string | null;
  expected_rates: string | null;
  manual: number;
  hidden: number;
  off: number;
  off_reason: string | null;
}
```

```typescript
function getMetadata(db: Database.Database, farmId: string) {
  const row = db.prepare('SELECT notes, tags, coordinates, expected_rates, manual, hidden, off, off_reason FROM farm_metadata WHERE farm_id = ?').get(farmId) as
    | FarmMetadataRow
    | undefined;
  return {
    notes: row?.notes ?? null,
    tags: row?.tags ? row.tags.split(',').filter(Boolean) : [],
    coordinates: row?.coordinates ?? null,
    expected_rates: row?.expected_rates ? JSON.parse(row.expected_rates) : {},
    manual: !!row?.manual,
    hidden: !!row?.hidden,
    off: !!row?.off,
    off_reason: row?.off_reason ?? null,
  };
}
```

```typescript
const metadataSchema = z.object({
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  coordinates: z.string().nullable().optional(),
  expected_rates: z.record(z.string(), z.number()).optional(),
  manual: z.boolean().optional(),
  hidden: z.boolean().optional(),
  off: z.boolean().optional(),
  off_reason: z.string().nullable().optional(),
});
```

Replace the `PATCH /api/farms/:id/metadata` handler:

```typescript
  app.patch('/api/farms/:id/metadata', async (req) => {
    const { id } = req.params as { id: string };
    const body = metadataSchema.parse(req.body);
    const wasOff = getMetadata(db, id).off;
    db.prepare(
      `INSERT INTO farm_metadata (farm_id, notes, tags, coordinates, expected_rates, manual, hidden, off, off_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, tags = excluded.tags, coordinates = excluded.coordinates, expected_rates = excluded.expected_rates, manual = excluded.manual, hidden = excluded.hidden, off = excluded.off, off_reason = excluded.off_reason`
    ).run(
      id,
      body.notes ?? null,
      body.tags ? body.tags.join(',') : null,
      body.coordinates ?? null,
      body.expected_rates ? JSON.stringify(body.expected_rates) : null,
      body.manual ? 1 : 0,
      body.hidden ? 1 : 0,
      body.off ? 1 : 0,
      body.off_reason ?? null
    );
    if (body.off === true && !wasOff) {
      let farmName = id;
      try {
        const farm = (await mcfmFetch(`/farms/${encodeURIComponent(id)}`)) as { name?: string };
        farmName = farm.name ?? id;
      } catch {
        // MCFarmManager unreachable - still create the reminder with the farm id as its name.
      }
      const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      insertTask(db, {
        title: `Revisar granja apagada: ${farmName}`,
        due_date: dueDate,
        farm_id: id,
        status: 'todo',
        priority: 'med',
      });
    }
    return { ok: true, metadata: getMetadata(db, id) };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard/server && npm test -- test/farms.test.ts test/tasks.test.ts`
Expected: PASS across both files (the `insertTask` refactor must not break existing task tests).

- [ ] **Step 5: Commit**

```bash
git add dashboard/server/src/routes/tasks.ts dashboard/server/src/routes/farms.ts dashboard/server/test/farms.test.ts
git commit -m "feat(server): persist off_reason and auto-create reminder task when a farm is turned off"
```

### Task 24: `off_reason` field in GranjaDetail edit mode

**Files:**
- Modify: `dashboard/client/src/api/types.ts`
- Modify: `dashboard/client/src/api/hooks.ts`
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx`

**Interfaces:**
- Consumes: Task 22/23's `off_reason` field on the metadata payload.
- Produces: `FarmSummary.metadata` gains `off_reason: string | null`; `useUpdateFarmMetadata`'s mutation input gains an optional `off_reason?: string | null`.

- [ ] **Step 1: Extend the FarmSummary type**

In `dashboard/client/src/api/types.ts`, replace the `FarmSummary.metadata` field:

```typescript
  metadata: { notes: string | null; tags: string[]; coordinates: string | null; expected_rates: Record<string, number>; manual: boolean; hidden: boolean; off: boolean; off_reason: string | null };
```

- [ ] **Step 2: Extend useUpdateFarmMetadata**

In `dashboard/client/src/api/hooks.ts`, replace the `useUpdateFarmMetadata` function:

```typescript
export function useUpdateFarmMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      notes,
      tags,
      coordinates,
      expected_rates,
      manual,
      hidden,
      off,
      off_reason,
    }: {
      id: string;
      notes?: string | null;
      tags?: string[];
      coordinates?: string | null;
      expected_rates?: Record<string, number>;
      manual?: boolean;
      hidden?: boolean;
      off?: boolean;
      off_reason?: string | null;
    }) => apiFetch(`/farms/${id}/metadata`, { method: 'PATCH', body: JSON.stringify({ notes, tags, coordinates, expected_rates, manual, hidden, off, off_reason }) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['farms'] });
      qc.invalidateQueries({ queryKey: ['farms', vars.id] });
    },
  });
}
```

(`Granjas.tsx`'s quick off/hidden toggle buttons spread `...f.metadata` into this mutation already, so `off_reason` passes through unchanged there with no further edit needed.)

- [ ] **Step 3: Add the field to GranjaDetail's edit form**

In `dashboard/client/src/pages/GranjaDetail.tsx`, add state alongside the other metadata edit state:

```tsx
  const [offReason, setOffReason] = useState('');
```

In `startEdit`, alongside the other `set*` calls:

```tsx
    setOffReason(f.metadata.off_reason ?? '');
```

In `saveMeta`, add `off_reason` to the `updateMetadata.mutateAsync` call:

```tsx
    await updateMetadata.mutateAsync({
      id: f.id,
      notes: notes || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      coordinates: coordinates || null,
      expected_rates,
      manual,
      hidden,
      off,
      off_reason: offReason || null,
    });
```

Add the input right after the `off` `Checkbox` in the edit form:

```tsx
              <Checkbox
                checked={off}
                onChange={setOff}
                label="Granja apagada"
              />
              {off && (
                <input
                  value={offReason}
                  onChange={(e) => setOffReason(e.target.value)}
                  placeholder="Motivo (opcional)"
                  className="w-full rounded border border-border bg-base px-2 py-1 text-sm"
                />
              )}
```

- [ ] **Step 4: Typecheck and manual verification**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no new errors. Use the `run` skill to check the "Granja apagada" box in edit mode, type a reason, save, re-open edit mode, and confirm the reason persisted.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/api/types.ts dashboard/client/src/api/hooks.ts dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "feat(client): add off_reason field to GranjaDetail edit mode"
```

---

## Self-Review

**1. Spec coverage:**
- Feature 1 (in-panel alerts): storage>90% + production-stall rules (Task 2), dedup via `createIfNotActive` (Task 1), `/alerts` + `/alerts/{id}/dismiss` mod endpoints (Task 3), server proxy (Task 4), bell icon + badge + dropdown + dismiss, 30s poll (Tasks 5-6). Covered.
- Feature 2 (task↔farm linking): farm picker and chip verified already present in `Tareas.tsx`; "Tareas relacionadas" card added with `farm_id` query support (Tasks 7-8). Covered.
- Feature 3 (player playtime log): join/leave session tracking with dedup and crash recovery (Tasks 9-10), `/players/{name}/sessions` endpoint (Task 11), server proxy (Task 12), client chart in Jugadores (Task 13). Covered.
- Feature 4 (server performance history): sibling sampler to `FarmSampler` (Tasks 14-15), `/performance/history` endpoint (Task 16), server proxy (Task 17), Overview chart (Task 18). Covered.
- Feature 5 (storage/shulker search): `/search?item=` reusing `selfAndContents()` (Task 19), server proxy (Task 20), Granjas search box (Task 21). Covered.
- Feature 6 (off reason + auto reminder): schema migration (Task 22), persistence + auto-task-on-0→1-transition using the exact `POST /api/tasks` insert logic via the new `insertTask` export (Task 23), client field (Task 24). Covered.
- Out-of-scope items from the spec (position picker, production chart, squaremap click-to-pick, auto-deriving `actividad`, non-in-panel alert channels) — none of them appear in this plan's tasks, confirming no scope crept back in.

**2. Placeholder scan:** Every step above contains complete, compilable code — no `TBD`, no "add appropriate error handling" prose, no "similar to Task N" cross-references without the actual code repeated in place. Checked and none found.

**3. Type consistency, checked across tasks:**
- `AlertStore`/`Alert`: `createIfNotActive`, `listActive`, `dismiss` signatures match between `AlertStore` (Task 1), `SqliteAlertStore` (Task 1), `FakeAlertStore` (Task 2), and their use in `AlertChecker` (Task 2) and `MCFarmManagerHttpServer.handleAlerts` (Task 3).
- `MCFarmManagerHttpServer`'s constructor grows once per task that needs a new store (Task 3 adds `alertStore`, Task 11 adds `sessionStore`, Task 16 adds `performanceHistoryStore` — its final 9-arg shape), and every test/wiring call site (`MCFarmManagerHttpServerTest`, `MCFarmManagerExtension.onServerLoaded`) is updated in the same task or the immediately following task that finishes the signature (Tasks 10→11 for sessions, 15→16 for performance) — flagged explicitly in each task's "Run test" step so the plan doesn't silently claim a green full-suite run mid-sequence.
- `PlayerSessionStore`/`PlayerSession`: `openSession`, `closeSession`, `closeDanglingSessions`, `recordHeartbeat`, `lastHeartbeatMillis`, `query` match across `PlayerSessionStore` (Task 9), `SqlitePlayerSessionStore` (Task 9), `FakePlayerSessionStore` (Task 10), and their use in `PlayerSessionTracker` (Task 10) and `MCFarmManagerHttpServer.handlePlayers` (Task 11).
- `PerformanceHistoryStore`/`PerformanceSample`: `recordSample`, `query`, `pruneOlderThan` match across `PerformanceHistoryStore` (Task 14), `SqlitePerformanceHistoryStore` (Task 14), `FakePerformanceHistoryStore` (Task 15), and their use in `PerformanceSampler` (Task 15) and `MCFarmManagerHttpServer.handlePerformance` (Task 16).
- Client `useTasks(farmId?: string)` (Task 8) is called both with no argument (`Tareas.tsx`, `Overview.tsx`, unchanged) and with `id` (`GranjaDetail.tsx`, Task 8) — same function, optional param, no signature drift.
- `insertTask(db, input: unknown)` (Task 23) is called from both the refactored `POST /api/tasks` handler (raw `req.body`) and the farms.ts auto-reminder path (a typed object literal) — both go through `taskInput.parse` internally, so both call sites are valid regardless of input shape.
- Client `FarmSummary.metadata.off_reason` (Task 24) matches the server's `getMetadata` return shape (Task 23) and the mod has no `off`/`off_reason` concept at all (confirmed: this is dashboard-only metadata, never touches `FarmConfig` or any mod HTTP response) — no mismatch introduced.
















