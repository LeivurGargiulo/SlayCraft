package net.mcfarmmanager.mod.alerts;

public record Alert(long id, String farmId, String type, String message, long createdAtMillis, Long dismissedAtMillis) {}
