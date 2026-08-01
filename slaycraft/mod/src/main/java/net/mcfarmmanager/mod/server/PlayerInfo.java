package net.mcfarmmanager.mod.server;

import net.mcfarmmanager.mod.config.Position;

public record PlayerInfo(String name, String dimension, Position position, String gamemode) {}
