package net.mcfarmmanager.mod.data;

import net.mcfarmmanager.mod.config.FarmConfig;
import java.util.List;

public interface FarmDataProvider {
    List<EntityInfo> entities(FarmConfig farm);
    List<StorageInfo> storage(FarmConfig farm);
    boolean chunkLoaded(FarmConfig farm);
    List<OccupantInfo> occupants(FarmConfig farm);
}
