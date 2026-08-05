package net.mcfarmmanager.mod.sessions;

import java.util.ArrayList;
import java.util.List;

public final class FakePlayerSessionStore implements PlayerSessionStore {
    private final List<PlayerSession> sessions = new ArrayList<>();
    private Long heartbeat;

    @Override
    public void openSession(String playerName, long joinedAtMillis) {
        boolean open = sessions.stream().anyMatch(s -> s.playerName().equals(playerName) && s.leftAtMillis() == null);
        if (!open) {
            sessions.add(new PlayerSession(playerName, joinedAtMillis, null));
        }
    }

    @Override
    public void closeSession(String playerName, long leftAtMillis) {
        for (int i = sessions.size() - 1; i >= 0; i--) {
            PlayerSession s = sessions.get(i);
            if (s.playerName().equals(playerName) && s.leftAtMillis() == null) {
                sessions.set(i, new PlayerSession(s.playerName(), s.joinedAtMillis(), leftAtMillis));
                return;
            }
        }
    }

    @Override
    public void closeDanglingSessions(long leftAtMillis) {
        for (int i = 0; i < sessions.size(); i++) {
            PlayerSession s = sessions.get(i);
            if (s.leftAtMillis() == null) {
                sessions.set(i, new PlayerSession(s.playerName(), s.joinedAtMillis(), leftAtMillis));
            }
        }
    }

    @Override
    public void recordHeartbeat(long millis) { heartbeat = millis; }
    @Override
    public Long lastHeartbeatMillis() { return heartbeat; }

    @Override
    public List<PlayerSession> query(String playerName, long sinceMillis) {
        return sessions.stream()
                .filter(s -> s.playerName().equals(playerName) && s.joinedAtMillis() >= sinceMillis)
                .toList();
    }
}
