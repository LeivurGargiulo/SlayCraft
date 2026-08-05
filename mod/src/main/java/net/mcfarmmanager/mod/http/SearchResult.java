package net.mcfarmmanager.mod.http;

public record SearchResult(String farmId, String farmName, String storageId, String storageLabel, String itemId, int count) {}
