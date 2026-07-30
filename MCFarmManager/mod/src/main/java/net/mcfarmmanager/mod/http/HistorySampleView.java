package net.mcfarmmanager.mod.http;

import java.util.Map;

public record HistorySampleView(String sampledAt, Map<String, Integer> entityCounts, Map<String, Integer> storageCounts) {}
