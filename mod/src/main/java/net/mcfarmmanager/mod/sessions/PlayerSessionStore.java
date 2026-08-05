package net.mcfarmmanager.mod.sessions;

import java.util.List;

public interface PlayerSessionStore {
    void openSession(String playerName, long joinedAtMillis);
    void closeSession(String playerName, long leftAtMillis);
    void closeDanglingSessions(long leftAtMillis);
    void recordHeartbeat(long millis);
    Long lastHeartbeatMillis();
    List<PlayerSession> query(String playerName, long sinceMillis);
}
