package net.mcfarmmanager.mod.alerts;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public final class SqliteAlertStore implements AlertStore {
    private final Connection connection;

    public SqliteAlertStore(Path dbFile) {
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + dbFile);
            try (Statement stmt = connection.createStatement()) {
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS alerts (
                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                      farm_id TEXT NOT NULL,
                      type TEXT NOT NULL,
                      message TEXT NOT NULL,
                      created_at INTEGER NOT NULL,
                      dismissed_at INTEGER
                    )""");
                stmt.execute(
                    "CREATE INDEX IF NOT EXISTS idx_alerts_farm_type_active ON alerts (farm_id, type, dismissed_at)");
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to open alert store at " + dbFile, e);
        }
    }

    @Override
    public void createIfNotActive(String farmId, String type, String message, long createdAtMillis) {
        String checkSql = "SELECT COUNT(*) FROM alerts WHERE farm_id = ? AND type = ? AND dismissed_at IS NULL";
        try (PreparedStatement check = connection.prepareStatement(checkSql)) {
            check.setString(1, farmId);
            check.setString(2, type);
            try (ResultSet rs = check.executeQuery()) {
                rs.next();
                if (rs.getInt(1) > 0) {
                    return;
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to check active alerts", e);
        }
        String insertSql = "INSERT INTO alerts (farm_id, type, message, created_at) VALUES (?, ?, ?, ?)";
        try (PreparedStatement stmt = connection.prepareStatement(insertSql)) {
            stmt.setString(1, farmId);
            stmt.setString(2, type);
            stmt.setString(3, message);
            stmt.setLong(4, createdAtMillis);
            stmt.executeUpdate();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to insert alert", e);
        }
    }

    @Override
    public List<Alert> listActive() {
        String sql = "SELECT id, farm_id, type, message, created_at, dismissed_at FROM alerts "
                + "WHERE dismissed_at IS NULL ORDER BY created_at DESC";
        List<Alert> results = new ArrayList<>();
        try (PreparedStatement stmt = connection.prepareStatement(sql); ResultSet rs = stmt.executeQuery()) {
            while (rs.next()) {
                results.add(new Alert(
                        rs.getLong("id"),
                        rs.getString("farm_id"),
                        rs.getString("type"),
                        rs.getString("message"),
                        rs.getLong("created_at"),
                        null));
            }
        } catch (SQLException e) {
            throw new RuntimeException("Failed to list active alerts", e);
        }
        return results;
    }

    @Override
    public boolean dismiss(long id, long dismissedAtMillis) {
        String sql = "UPDATE alerts SET dismissed_at = ? WHERE id = ? AND dismissed_at IS NULL";
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setLong(1, dismissedAtMillis);
            stmt.setLong(2, id);
            return stmt.executeUpdate() > 0;
        } catch (SQLException e) {
            throw new RuntimeException("Failed to dismiss alert", e);
        }
    }

    public void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to close alert store", e);
        }
    }
}
