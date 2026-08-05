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
