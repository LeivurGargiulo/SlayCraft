package net.mcfarmmanager.mod.history;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;

import java.lang.reflect.Type;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class SqliteHistoryStore implements HistoryStore {
    private static final Type COUNTS_TYPE = new TypeToken<Map<String, Integer>>() {}.getType();

    private final Gson gson = new Gson();
    private final Connection connection;

    public SqliteHistoryStore(Path dbFile) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + dbFile);
            try (Statement stmt = connection.createStatement()) {
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS farm_samples (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      farm_id TEXT NOT NULL,
                      sampled_at INTEGER NOT NULL,
                      entity_counts_json TEXT NOT NULL,
                      storage_counts_json TEXT NOT NULL
                    )""");
                stmt.execute(
                    "CREATE INDEX IF NOT EXISTS idx_farm_samples_farm_time ON farm_samples (farm_id, sampled_at)");
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open history store at " + dbFile, e);
        }
    }

    @Override
    public void recordSample(String farmId, long sampledAtMillis, Map<String, Integer> entityCounts,
                              Map<String, Integer> storageCounts) {
        String sql = "INSERT INTO farm_samples (farm_id, sampled_at, entity_counts_json, storage_counts_json) "
                + "VALUES (?, ?, ?, ?)";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, farmId);
            stmt.setLong(2, sampledAtMillis);
            stmt.setString(3, gson.toJson(entityCounts));
            stmt.setString(4, gson.toJson(storageCounts));
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to record history sample", e);
        }
    }

    @Override
    public List<HistorySample> query(String farmId, long sinceMillis) {
        String sql = "SELECT sampled_at, entity_counts_json, storage_counts_json FROM farm_samples "
                + "WHERE farm_id = ? AND sampled_at >= ? ORDER BY sampled_at ASC";
        List<HistorySample> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, farmId);
            stmt.setLong(2, sinceMillis);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    Map<String, Integer> entityCounts = gson.fromJson(rs.getString("entity_counts_json"), COUNTS_TYPE);
                    Map<String, Integer> storageCounts = gson.fromJson(rs.getString("storage_counts_json"), COUNTS_TYPE);
                    results.add(new HistorySample(rs.getLong("sampled_at"), entityCounts, storageCounts));
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to query history samples", e);
        }
        return results;
    }

    @Override
    public void pruneOlderThan(long cutoffMillis) {
        try (PreparedStatement stmt = connection.prepareStatement("DELETE FROM farm_samples WHERE sampled_at < ?")) {
            stmt.setLong(1, cutoffMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to prune history samples", e);
        }
    }

    public void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close history store", e);
        }
    }
}
