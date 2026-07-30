package net.mcfarmmanager.mod.config;

import java.util.List;

public record FarmConfig(
    String id,
    String name,
    String dimension,
    Position anchor,
    int entityScanRadius,
    String fakePlayerName,
    List<StorageConfig> storage
) {}
