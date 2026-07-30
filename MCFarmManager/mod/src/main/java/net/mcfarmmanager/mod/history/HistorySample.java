package net.mcfarmmanager.mod.history;

import java.util.Map;

public record HistorySample(long sampledAtMillis, Map<String, Integer> entityCounts, Map<String, Integer> storageCounts) {}
