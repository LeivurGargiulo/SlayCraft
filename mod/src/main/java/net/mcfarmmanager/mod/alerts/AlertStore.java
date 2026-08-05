package net.mcfarmmanager.mod.alerts;

import java.util.List;

public interface AlertStore {
    void createIfNotActive(String farmId, String type, String message, long createdAtMillis);
    List<Alert> listActive();
    boolean dismiss(long id, long dismissedAtMillis);
}
