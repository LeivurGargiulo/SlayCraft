package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.Position;
import java.util.List;

public record StorageInfo(String id, String label, Position position, int capacity, List<ItemStackInfo> items) {}
