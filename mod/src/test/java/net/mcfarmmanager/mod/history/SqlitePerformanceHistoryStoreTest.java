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
