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
