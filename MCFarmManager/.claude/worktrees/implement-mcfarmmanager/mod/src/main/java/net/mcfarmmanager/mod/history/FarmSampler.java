package net.mcfarmmanager.mod.history;

import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.data.EntityInfo;
import net.mcfarmmanager.mod.data.FarmDataProvider;
import net.mcfarmmanager.mod.data.ItemStackInfo;

import java.util.List;
import java.util.Map;
import java.util.function.IntSupplier;
import java.util.stream.Collectors;

/**
 * Driven by {@code ServerTickEvents.END_SERVER_TICK}, which runs on the server's main thread -
 * {@link #onEndTick()} must only ever be called from there, since {@link FarmDataProvider} reads
 * live world state.
 */
public final class FarmSampler {
    private final List<FarmConfig> farms;
    private final FarmDataProvider farmData;
    private final HistoryStore historyStore;
    private final IntSupplier sampleIntervalMinutes;
    private final IntSupplier retentionDays;
    private long ticksSinceLastSample = 0;

    public FarmSampler(List<FarmConfig> farms, FarmDataProvider farmData, HistoryStore historyStore,
                        IntSupplier sampleIntervalMinutes, IntSupplier retentionDays) {
        this.farms = farms;
        this.farmData = farmData;
        this.historyStore = historyStore;
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
        for (FarmConfig farm : farms) {
            Map<String, Integer> entityCounts = farmData.entities(farm).stream()
                    .collect(Collectors.groupingBy(EntityInfo::type, Collectors.summingInt(e -> 1)));
            Map<String, Integer> storageCounts = farmData.storage(farm).stream()
                    .flatMap(s -> s.items().stream())
                    .collect(Collectors.groupingBy(ItemStackInfo::itemId, Collectors.summingInt(ItemStackInfo::count)));
            historyStore.recordSample(farm.id(), now, entityCounts, storageCounts);
        }
        long cutoffMillis = now - retentionDays.getAsInt() * 24L * 60L * 60L * 1000L;
        historyStore.pruneOlderThan(cutoffMillis);
    }
}
