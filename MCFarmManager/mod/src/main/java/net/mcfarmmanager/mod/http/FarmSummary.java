package net.mcfarmmanager.mod.http;

public record FarmSummary(String id, String name, String dimension, int entityCount, int storageItemCount, boolean chunkLoaded, int occupantCount) {}
