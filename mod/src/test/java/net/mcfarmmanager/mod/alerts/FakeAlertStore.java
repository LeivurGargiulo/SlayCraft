package net.mcfarmmanager.mod.alerts;

import java.util.ArrayList;
import java.util.List;

public final class FakeAlertStore implements AlertStore {
    private final List<Alert> alerts = new ArrayList<>();
    private long nextId = 1;

    @Override
    public void createIfNotActive(String farmId, String type, String message, long createdAtMillis) {
        boolean alreadyActive = alerts.stream()
                .anyMatch(a -> a.farmId().equals(farmId) && a.type().equals(type) && a.dismissedAtMillis() == null);
        if (alreadyActive) {
            return;
        }
        alerts.add(new Alert(nextId++, farmId, type, message, createdAtMillis, null));
    }

    @Override
    public List<Alert> listActive() {
        return alerts.stream().filter(a -> a.dismissedAtMillis() == null).toList();
    }

    @Override
    public boolean dismiss(long id, long dismissedAtMillis) {
        for (int i = 0; i < alerts.size(); i++) {
            Alert a = alerts.get(i);
            if (a.id() == id && a.dismissedAtMillis() == null) {
                alerts.set(i, new Alert(a.id(), a.farmId(), a.type(), a.message(), a.createdAtMillis(), dismissedAtMillis));
                return true;
            }
        }
        return false;
    }
}
