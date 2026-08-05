package net.mcfarmmanager.mod.http;

import java.util.List;

public record PerformanceHistoryResponse(String range, List<PerformanceSampleView> samples) {}
