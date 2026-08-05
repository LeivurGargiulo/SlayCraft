package net.mcfarmmanager.mod.http;

public record PerformanceSampleView(String sampledAt, double tps, double meanTickTimeMs) {}
