package net.mcfarmmanager.mod.server;

public record PerformanceInfo(double tps, double meanTickTimeMs, int sampledOverTicks) {}
