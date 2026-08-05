package net.mcfarmmanager.mod.history;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public final class SqlitePerformanceHistoryStore implements PerformanceHistoryStore {
    private final Connection connection;

    public SqlitePerformanceHistoryStore(Path dbFile) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + dbFile);
            try (Statement stmt = connection.createStatement()) {
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS performance_samples (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      sampled_at INTEGER NOT NULL,
                      tps REAL NOT NULL,
                      mean_tick_time_ms REAL NOT NULL
                    )""");
                stmt.execute(
                    "CREATE INDEX IF NOT EXISTS idx_performance_samples_time ON performance_samples (sampled_at)");
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open performance history store at " + dbFile, e);
        }
    }

    @Override
    public void recordSample(long sampledAtMillis, double tps, double meanTickTimeMs) {
        String sql = "INSERT INTO performance_samples (sampled_at, tps, mean_tick_time_ms) VALUES (?, ?, ?)";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, sampledAtMillis);
            stmt.setDouble(2, tps);
            stmt.setDouble(3, meanTickTimeMs);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to record performance sample", e);
        }
    }

    @Override
    public List<PerformanceSample> query(long sinceMillis) {
        String sql = "SELECT sampled_at, tps, mean_tick_time_ms FROM performance_samples "
                + "WHERE sampled_at >= ? ORDER BY sampled_at ASC";
        List<PerformanceSample> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, sinceMillis);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    results.add(new PerformanceSample(rs.getLong("sampled_at"), rs.getDouble("tps"),
                            rs.getDouble("mean_tick_time_ms")));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query performance samples", e);
        }
        return results;
    }

    @Override
    public void pruneOlderThan(long cutoffMillis) {
        try (PreparedStatement stmt = connection.prepareStatement(
                "DELETE FROM performance_samples WHERE sampled_at < ?")) {
            stmt.setLong(1, cutoffMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to prune performance samples", e);
        }
    }

    public void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close performance history store", e);
        }
    }
}
