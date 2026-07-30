package net.mcfarmmanager.mod.http;

import java.util.List;

public record FarmHistoryResponse(String farmId, String range, List<HistorySampleView> samples) {}
