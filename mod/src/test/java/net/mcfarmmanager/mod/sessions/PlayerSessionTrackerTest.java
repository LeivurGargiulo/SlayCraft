package net.mcfarmmanager.mod.sessions;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PlayerSessionTrackerTest {
    @Test
    void joinOpensASession() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        tracker.onPlayerJoin("leivur", false, 1000L);
        assertEquals(1, store.query("leivur", 0L).size());
        assertNull(store.query("leivur", 0L).get(0).leftAtMillis());
    }

    @Test
    void ignoresFakePlayers() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        tracker.onPlayerJoin("Worker-Iron", true, 1000L);
        assertEquals(0, store.query("Worker-Iron", 0L).size());
    }

    @Test
    void disconnectClosesTheSession() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        tracker.onPlayerJoin("leivur", false, 1000L);
        tracker.onPlayerDisconnect("leivur", false, 2000L);
        assertEquals(2000L, store.query("leivur", 0L).get(0).leftAtMillis());
    }

    @Test
    void heartbeatFiresAtInterval() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        for (int i = 0; i < 5999; i++) tracker.onEndTick();
        assertNull(store.lastHeartbeatMillis());
        tracker.onEndTick();
        assertNotNull(store.lastHeartbeatMillis());
    }

    @Test
    void closeDanglingSessionsFromPreviousRunUsesLastHeartbeat() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        store.openSession("leivur", 1000L);
        store.recordHeartbeat(5000L);
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        tracker.closeDanglingSessionsFromPreviousRun();
        assertEquals(5000L, store.query("leivur", 0L).get(0).leftAtMillis());
    }

    @Test
    void closeDanglingSessionsFallsBackToNowWithoutHeartbeat() {
        FakePlayerSessionStore store = new FakePlayerSessionStore();
        store.openSession("leivur", 1000L);
        PlayerSessionTracker tracker = new PlayerSessionTracker(store, () -> 5);
        long before = System.currentTimeMillis();
        tracker.closeDanglingSessionsFromPreviousRun();
        assertTrue(store.query("leivur", 0L).get(0).leftAtMillis() >= before);
    }
}
