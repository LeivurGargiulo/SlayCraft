package net.mcfarmmanager.mod.server;

public record DimensionState(String dimension, long timeOfDay, long dayCount, boolean raining, boolean thundering, String difficulty, int loadedChunkCount) {}
