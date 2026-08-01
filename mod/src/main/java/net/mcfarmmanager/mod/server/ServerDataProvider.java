package net.mcfarmmanager.mod.server;

import java.util.List;

public interface ServerDataProvider {
    List<PlayerInfo> players();
    List<DimensionState> worldState();
    PerformanceInfo performance();
    StatusInfo status(int farmCount);
}
