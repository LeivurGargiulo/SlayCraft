package net.mcfarmmanager.mod.alerts;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SqliteAlertStoreTest {
    private Path dbFile;
    private SqliteAlertStore store;

    @BeforeEach
    void setUp() throws IOException {
        dbFile = Files.createTempFile("alerts", ".sqlite");
        Files.delete(dbFile);
        store = new SqliteAlertStore(dbFile);
    }

    @AfterEach
    void tearDown() throws IOException {
        store.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void createsAndListsActiveAlerts() {
        store.createIfNotActive("iron", "storage_full", "Cofre principal al 95%", 1000L);
        List<Alert> active = store.listActive();
        assertEquals(1, active.size());
        assertEquals("iron", active.get(0).farmId());
        assertEquals("storage_full", active.get(0).type());
        assertNull(active.get(0).dismissedAtMillis());
    }

    @Test
    void dedupesSameFarmAndTypeWhileActive() {
        store.createIfNotActive("iron", "storage_full", "first", 1000L);
        store.createIfNotActive("iron", "storage_full", "second", 2000L);
        assertEquals(1, store.listActive().size());
        assertEquals("first", store.listActive().get(0).message());
    }

    @Test
    void reFiresAfterDismissal() {
        store.createIfNotActive("iron", "storage_full", "first", 1000L);
        long id = store.listActive().get(0).id();
        assertTrue(store.dismiss(id, 1500L));
        store.createIfNotActive("iron", "storage_full", "second", 2000L);
        assertEquals(1, store.listActive().size());
        assertEquals("second", store.listActive().get(0).message());
    }

    @Test
    void dismissUnknownIdReturnsFalse() {
        assertFalse(store.dismiss(999L, 1000L));
    }

    @Test
    void dismissAlreadyDismissedReturnsFalse() {
        store.createIfNotActive("iron", "storage_full", "m", 1000L);
        long id = store.listActive().get(0).id();
        assertTrue(store.dismiss(id, 1500L));
        assertFalse(store.dismiss(id, 1600L));
    }
}
