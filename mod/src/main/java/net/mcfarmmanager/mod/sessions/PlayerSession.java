package net.mcfarmmanager.mod.sessions;

public record PlayerSession(String playerName, long joinedAtMillis, Long leftAtMillis) {}
