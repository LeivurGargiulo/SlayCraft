package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.data.EntityInfo;
import net.mcfarmmanager.mod.data.OccupantInfo;
import net.mcfarmmanager.mod.data.StorageInfo;

import java.util.List;

public record FarmDetail(String id, String name, String dimension, Position anchor, boolean chunkLoaded, List<OccupantInfo> occupants, List<EntityInfo> entities, List<StorageInfo> storage) {}
