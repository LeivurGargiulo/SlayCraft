package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.Position;

public record EntityInfo(String id, String type, String customName, Position position, double health) {}
