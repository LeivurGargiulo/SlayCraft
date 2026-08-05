package net.mcfarmmanager.mod.sessions;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public final class SqlitePlayerSessionStore implements PlayerSessionStore {
    private final Connection connection;

    public SqlitePlayerSessionStore(Path dbFile) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + dbFile);
            try (Statement stmt = connection.createStatement()) {
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS player_sessions (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      player_name TEXT NOT NULL,
                      joined_at INTEGER NOT NULL,
                      left_at INTEGER
                    )""");
                stmt.execute(
                    "CREATE INDEX IF NOT EXISTS idx_player_sessions_name_time ON player_sessions (player_name, joined_at)");
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS session_heartbeat (
                      id INTEGER PRIMARY KEY CHECK (id = 1),
                      last_tick_millis INTEGER NOT NULL
                    )""");
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open session store at " + dbFile, e);
        }
    }

    @Override
    public void openSession(String playerName, long joinedAtMillis) {
        String checkSql = "SELECT COUNT(*) FROM player_sessions WHERE player_name = ? AND left_at IS NULL";
        try (PreparedStatement check = connection.prepareStatement(checkSql)) {
            check.setString(1, playerName);
            try (ResultSet rs = check.executeQuery()) {
                rs.next();
                if (rs.getInt(1) > 0) {
                    return;
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to check open sessions", e);
        }
        try (PreparedStatement stmt = connection.prepareStatement(
                "INSERT INTO player_sessions (player_name, joined_at) VALUES (?, ?)")) {
            stmt.setString(1, playerName);
            stmt.setLong(2, joinedAtMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open session", e);
        }
    }

    @Override
    public void closeSession(String playerName, long leftAtMillis) {
        String sql = "UPDATE player_sessions SET left_at = ? WHERE id = ("
                + "SELECT id FROM player_sessions WHERE player_name = ? AND left_at IS NULL "
                + "ORDER BY joined_at DESC LIMIT 1)";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, leftAtMillis);
            stmt.setString(2, playerName);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close session", e);
        }
    }

    @Override
    public void closeDanglingSessions(long leftAtMillis) {
        try (PreparedStatement stmt = connection.prepareStatement(
                "UPDATE player_sessions SET left_at = ? WHERE left_at IS NULL")) {
            stmt.setLong(1, leftAtMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close dangling sessions", e);
        }
    }

    @Override
    public void recordHeartbeat(long millis) {
        String sql = "INSERT INTO session_heartbeat (id, last_tick_millis) VALUES (1, ?) "
                + "ON CONFLICT(id) DO UPDATE SET last_tick_millis = excluded.last_tick_millis";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, millis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to record heartbeat", e);
        }
    }

    @Override
    public Long lastHeartbeatMillis() {
        try (PreparedStatement stmt = connection.prepareStatement(
                "SELECT last_tick_millis FROM session_heartbeat WHERE id = 1");
             ResultSet rs = stmt.executeQuery()) {
            return rs.next() ? rs.getLong(1) : null;
        } catch (SQLException e) {
            throw new RuntimeException("Failed to read heartbeat", e);
        }
    }

    @Override
    public List<PlayerSession> query(String playerName, long sinceMillis) {
        String sql = "SELECT player_name, joined_at, left_at FROM player_sessions "
                + "WHERE player_name = ? AND (joined_at >= ? OR left_at IS NULL) ORDER BY joined_at ASC";
        List<PlayerSession> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, playerName);
            stmt.setLong(2, sinceMillis);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    long leftAt = rs.getLong("left_at");
                    results.add(new PlayerSession(rs.getString("player_name"), rs.getLong("joined_at"),
                            rs.wasNull() ? null : leftAt));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query sessions", e);
        }
        return results;
    }

    public void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close session store", e);
        }
    }
}
