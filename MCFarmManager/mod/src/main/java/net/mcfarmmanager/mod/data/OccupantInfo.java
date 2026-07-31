package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.Position;

public record OccupantInfo(String name, boolean isFakePlayer, Position position) {}
