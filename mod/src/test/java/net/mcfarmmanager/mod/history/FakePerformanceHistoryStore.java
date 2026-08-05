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
