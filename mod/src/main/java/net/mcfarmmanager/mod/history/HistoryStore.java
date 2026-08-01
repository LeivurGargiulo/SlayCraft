package net.mcfarmmanager.mod.history;

import java.util.List;
import java.util.Map;

public interface HistoryStore {
    void recordSample(String farmId, long sampledAtMillis, Map<String, Integer> entityCounts, Map<String, Integer> storageCounts);
    List<HistorySample> query(String farmId, long sinceMillis);
    void pruneOlderThan(long cutoffMillis);
}
