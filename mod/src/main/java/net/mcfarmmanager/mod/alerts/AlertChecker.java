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
        // Bounded lookback instead of the full retained history - only the last STALL_SAMPLE_COUNT
        // samples matter here, and the +1 buffer absorbs sampler tick jitter.
        long sinceMillis = now - (STALL_SAMPLE_COUNT + 1) * sampleIntervalMinutes.getAsInt() * 60_000L;
        List<HistorySample> samples = historyStore.query(farm.id(), sinceMillis);
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
