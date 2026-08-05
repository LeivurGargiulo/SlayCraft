package net.mcfarmmanager.mod.history;

import java.util.List;

public interface PerformanceHistoryStore {
    void recordSample(long sampledAtMillis, double tps, double meanTickTimeMs);
    List<PerformanceSample> query(long sinceMillis);
    void pruneOlderThan(long cutoffMillis);
}
