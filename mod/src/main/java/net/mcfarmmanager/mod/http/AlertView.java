package net.mcfarmmanager.mod.http;

public record AlertView(long id, String farmId, String type, String message, String createdAt) {}
