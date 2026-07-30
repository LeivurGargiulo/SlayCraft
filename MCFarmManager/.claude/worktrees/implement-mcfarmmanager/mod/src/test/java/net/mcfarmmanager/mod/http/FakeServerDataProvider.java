package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.server.DimensionState;
import net.mcfarmmanager.mod.server.PerformanceInfo;
import net.mcfarmmanager.mod.server.PlayerInfo;
import net.mcfarmmanager.mod.server.StatusInfo;

import java.util.List;

class FakeServerDataProvider implements net.mcfarmmanager.mod.server.ServerDataProvider {
    @Override
    public List<PlayerInfo> players() {
        return List.of(new PlayerInfo("leivur", "minecraft:overworld", new net.mcfarmmanager.mod.config.Position(0, 70, 0), "survival"));
    }
    @Override
    public List<DimensionState> worldState() {
        return List.of(new DimensionState("minecraft:overworld", 13452, 47, false, false, "hard", 812));
    }
    @Override
    public PerformanceInfo performance() { return new PerformanceInfo(19.87, 47.3, 100); }
    @Override
    public StatusInfo status(int farmCount) { return new StatusInfo("1.0.0", "1.21.11", "1.4.194", 3600, farmCount); }
}
