package net.mcfarmmanager.mod.http;

import java.util.List;

public record PlayerSessionsResponse(String playerName, String range, List<PlayerSessionView> sessions) {}
