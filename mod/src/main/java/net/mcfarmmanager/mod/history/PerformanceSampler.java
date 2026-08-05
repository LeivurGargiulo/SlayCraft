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
