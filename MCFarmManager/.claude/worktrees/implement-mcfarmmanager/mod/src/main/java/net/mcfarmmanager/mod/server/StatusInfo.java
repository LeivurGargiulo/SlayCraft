package net.mcfarmmanager.mod.server;

public record StatusInfo(String modVersion, String minecraftVersion, String carpetVersion, long uptimeSeconds, int farmCount) {}
