package net.mcfarmmanager.mod.sessions;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SqlitePlayerSessionStoreTest {
    private Path dbFile;
    private SqlitePlayerSessionStore store;

    @BeforeEach
    void setUp() throws IOException {
        dbFile = Files.createTempFile("sessions", ".sqlite");
        Files.delete(dbFile);
        store = new SqlitePlayerSessionStore(dbFile);
    }

    @AfterEach
    void tearDown() throws IOException {
        store.close();
        Files.deleteIfExists(dbFile);
    }

    @Test
    void opensAndClosesASession() {
        store.openSession("leivur", 1000L);
        store.closeSession("leivur", 2000L);
        List<PlayerSession> sessions = store.query("leivur", 0L);
        assertEquals(1, sessions.size());
        assertEquals(1000L, sessions.get(0).joinedAtMillis());
        assertEquals(2000L, sessions.get(0).leftAtMillis());
    }

    @Test
    void openSessionDoesNotDuplicateWhileAlreadyOpen() {
        store.openSession("leivur", 1000L);
        store.openSession("leivur", 1500L);
        assertEquals(1, store.query("leivur", 0L).size());
    }

    @Test
    void closeSessionClosesTheMostRecentOpenOne() {
        store.openSession("leivur", 1000L);
        store.closeSession("leivur", 1200L);
        store.openSession("leivur", 2000L);
        store.closeSession("leivur", 2500L);
        List<PlayerSession> sessions = store.query("leivur", 0L);
        assertEquals(2, sessions.size());
        assertEquals(1200L, sessions.get(0).leftAtMillis());
        assertEquals(2500L, sessions.get(1).leftAtMillis());
    }

    @Test
    void queryFiltersBySinceMillis() {
        store.openSession("leivur", 1000L);
        store.closeSession("leivur", 1500L);
        store.openSession("leivur", 5000L);
        store.closeSession("leivur", 5500L);
        assertEquals(1, store.query("leivur", 4000L).size());
    }

    @Test
    void closeDanglingSessionsClosesOnlyOpenOnes() {
        store.openSession("leivur", 1000L);
        store.closeSession("leivur", 1500L);
        store.openSession("gustavo", 2000L);
        store.closeDanglingSessions(9000L);
        List<PlayerSession> gustavo = store.query("gustavo", 0L);
        assertEquals(9000L, gustavo.get(0).leftAtMillis());
        List<PlayerSession> leivur = store.query("leivur", 0L);
        assertEquals(1500L, leivur.get(0).leftAtMillis());
    }

    @Test
    void heartbeatRoundTripsAndUpserts() {
        assertNull(store.lastHeartbeatMillis());
        store.recordHeartbeat(1000L);
        assertEquals(1000L, store.lastHeartbeatMillis());
        store.recordHeartbeat(2000L);
        assertEquals(2000L, store.lastHeartbeatMillis());
    }
}
