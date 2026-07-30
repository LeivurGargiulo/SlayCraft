package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.history.HistorySample;
import net.mcfarmmanager.mod.history.HistoryStore;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

class FakeHistoryStore implements HistoryStore {
    private final Map<String, List<HistorySample>> samplesByFarm = new java.util.HashMap<>();

    @Override
    public void recordSample(String farmId, long sampledAtMillis, Map<String, Integer> entityCounts,
                              Map<String, Integer> storageCounts) {
        samplesByFarm.computeIfAbsent(farmId, id -> new ArrayList<>())
                .add(new HistorySample(sampledAtMillis, entityCounts, storageCounts));
    }

    @Override
    public List<HistorySample> query(String farmId, long sinceMillis) {
        return samplesByFarm.getOrDefault(farmId, List.of()).stream()
                .filter(s -> s.sampledAtMillis() >= sinceMillis)
                .sorted(java.util.Comparator.comparingLong(HistorySample::sampledAtMillis))
                .toList();
    }

    @Override
    public void pruneOlderThan(long cutoffMillis) {
        samplesByFarm.values().forEach(list -> list.removeIf(s -> s.sampledAtMillis() < cutoffMillis));
    }
}
