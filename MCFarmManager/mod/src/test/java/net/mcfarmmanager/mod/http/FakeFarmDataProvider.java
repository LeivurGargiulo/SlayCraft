package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.config.StorageConfig;
import net.mcfarmmanager.mod.data.EntityInfo;
import net.mcfarmmanager.mod.data.ItemStackInfo;
import net.mcfarmmanager.mod.data.OccupantInfo;
import net.mcfarmmanager.mod.data.StorageInfo;

import java.util.List;
import java.util.Map;

class FakeFarmDataProvider implements net.mcfarmmanager.mod.data.FarmDataProvider {
    @Override
    public List<EntityInfo> entities(FarmConfig farm) {
        return List.of(new EntityInfo("uuid-1", "minecraft:iron_golem", null, new Position(121, 80, -499), 100.0));
    }
    @Override
    public List<StorageInfo> storage(FarmConfig farm) {
        return farm.storage().stream()
            .map(s -> new StorageInfo(s.id(), s.label(), s.position(), 27,
                List.of(new ItemStackInfo("minecraft:iron_ingot", 1728, null))))
            .toList();
    }
    @Override
    public boolean chunkLoaded(FarmConfig farm) { return true; }
    @Override
    public List<OccupantInfo> occupants(FarmConfig farm) {
        if (farm.fakePlayerName() == null) return List.of();
        return List.of(new OccupantInfo(farm.fakePlayerName(), true, new Position(118, 81, -498)));
    }
}
