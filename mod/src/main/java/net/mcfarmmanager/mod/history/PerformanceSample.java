package net.mcfarmmanager.mod.history;

public record PerformanceSample(long sampledAtMillis, double tps, double meanTickTimeMs) {}
