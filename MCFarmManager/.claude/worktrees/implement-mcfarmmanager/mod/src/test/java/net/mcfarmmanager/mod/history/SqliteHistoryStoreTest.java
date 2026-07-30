package net.mcfarmmanager.mod.history;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class SqliteHistoryStoreTest {
    private Path dbFile;
    private SqliteHistoryStore store;

    @BeforeEach
    void setUp() throws IOException {
        dbFile = Files.createTempFile("history", ".sqlite");
        Files.delete(dbFile);
        store = new SqliteHistoryStore(dbFile);
    }

    @AfterEach
    void tearDown() throws IOException {
        store.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void recordsAndQueriesSamples() {
        store.recordSample("iron", 1000L, Map.of("minecraft:iron_golem", 4), Map.of("minecraft:iron_ingot", 1620));
        store.recordSample("iron", 2000L, Map.of("minecraft:iron_golem", 5), Map.of("minecraft:iron_ingot", 1700));
        store.recordSample("gold", 1500L, Map.of("minecraft:zombified_piglin", 2), Map.of("minecraft:gold_ingot", 40));

        List<HistorySample> ironSamples = store.query("iron", 0L);
        assertEquals(2, ironSamples.size());
        assertEquals(4, ironSamples.get(0).entityCounts().get("minecraft:iron_golem"));
        assertEquals(1700, ironSamples.get(1).storageCounts().get("minecraft:iron_ingot"));
    }

    @Test
    void queryFiltersBySinceMillis() {
        store.recordSample("iron", 1000L, Map.of(), Map.of());
        store.recordSample("iron", 5000L, Map.of(), Map.of());
        assertEquals(1, store.query("iron", 4000L).size());
    }

    @Test
    void pruneRemovesOldRowsOnly() {
        store.recordSample("iron", 1000L, Map.of(), Map.of());
        store.recordSample("iron", 9000L, Map.of(), Map.of());
        store.pruneOlderThan(5000L);
        assertEquals(1, store.query("iron", 0L).size());
        assertEquals(9000L, store.query("iron", 0L).get(0).sampledAtMillis());
    }

    @Test
    void schemaCreationIsIdempotent() {
        // Re-opening the same file must not fail even though the schema already exists.
        store.close();
        SqliteHistoryStore reopened = new SqliteHistoryStore(dbFile);
        reopened.recordSample("iron", 1000L, Map.of(), Map.of());
        assertEquals(1, reopened.query("iron", 0L).size());
        reopened.close();
    }
}
