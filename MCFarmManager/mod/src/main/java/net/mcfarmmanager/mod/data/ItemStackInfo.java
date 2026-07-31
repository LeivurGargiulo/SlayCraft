package net.mcfarmmanager.mod.data;

import java.util.List;

public record ItemStackInfo(String itemId, int count, List<ItemStackInfo> shulkerContents) {}
