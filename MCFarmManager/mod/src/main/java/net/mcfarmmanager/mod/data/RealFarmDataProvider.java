// Confirmed via javap -p against the Loom-remapped minecraft-merged-*-1.21.11-loom.mappings...jar and the remapped
// fabric-carpet-1.21.11-1.4.194+v251223 jar (official Mojang mappings rename ResourceLocation -> Identifier in this
// version): MinecraftServer.getLevel(ResourceKey<Level>) with the key built from Registries.DIMENSION + Identifier.parse;
// EntityGetter.getEntitiesOfClass(Class, AABB) (inherited by ServerLevel via Level) for the bounding-box entity scan;
// Level.getBlockEntity(BlockPos) + "instanceof Container" for direct inventory reads (ChestBlockEntity,
// TrappedChestBlockEntity, BarrelBlockEntity, ShulkerBoxBlockEntity, HopperBlockEntity, DispenserBlockEntity and
// DropperBlockEntity all ultimately implement net.minecraft.world.Container); Level.isLoaded(BlockPos) for chunk-loaded
// checks; and carpet.patches.EntityPlayerMPFake (extends ServerPlayer) located via
// MinecraftServer.getPlayerList().getPlayerByName(name) for fake-player status.
//
// Task 7 live verification found that Level.getBlockEntity(BlockPos) (unlike getEntitiesOfClass/isLoaded) has
// vanilla's own thread-ownership guard and silently returns null when called off the server's main thread -
// confirmed via javap on BlockableEventLoop (MinecraftServer's superclass): isSameThread()/submit(Supplier) exist
// specifically for this. Since HTTP requests run on the server's own thread pool, every method here now hops onto
// the main thread via MinecraftServer.submit(...).join() before touching ServerLevel/Entity/BlockEntity state.
package net.mcfarmmanager.mod.data;

import carpet.patches.EntityPlayerMPFake;
import net.mcfarmmanager.mod.MCFarmManagerMod;
import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.config.StorageConfig;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.phys.AABB;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * Read-only. Every method below only calls getters on Minecraft/Carpet types - no mutation of
 * world, entity, or inventory state anywhere in this class.
 */
public final class RealFarmDataProvider implements FarmDataProvider {
    private final Supplier<MinecraftServer> serverSupplier;

    public RealFarmDataProvider(Supplier<MinecraftServer> serverSupplier) {
        this.serverSupplier = serverSupplier;
    }

    private static <T> T onMainThread(MinecraftServer server, Supplier<T> action, T fallback) {
        if (server.isSameThread()) {
            return action.get();
        }
        try {
            return server.submit(action).join();
        } catch (RuntimeException e) {
            MCFarmManagerMod.LOGGER.error("Failed to read world state on main thread: {}", e.getMessage());
            return fallback;
        }
    }

    private static ServerLevel level(FarmConfig farm, MinecraftServer server) {
        ResourceKey<Level> dimensionKey = ResourceKey.create(Registries.DIMENSION, Identifier.parse(farm.dimension()));
        return server.getLevel(dimensionKey);
    }

    @Override
    public List<EntityInfo> entities(FarmConfig farm) {
        MinecraftServer server = serverSupplier.get();
        if (server == null) {
            return List.of();
        }
        return onMainThread(server, () -> {
            ServerLevel level = level(farm, server);
            if (level == null) {
                return List.<EntityInfo>of();
            }
            Position anchor = farm.anchor();
            double radius = farm.entityScanRadius();
            AABB box = new AABB(
                    anchor.x() - radius, anchor.y() - radius, anchor.z() - radius,
                    anchor.x() + radius, anchor.y() + radius, anchor.z() + radius);

            List<EntityInfo> result = new ArrayList<>();
            for (Entity entity : level.getEntitiesOfClass(Entity.class, box, e -> !(e instanceof ServerPlayer))) {
                double health = entity instanceof LivingEntity living ? living.getHealth() : 0.0;
                String customName = entity.hasCustomName() ? entity.getCustomName().getString() : null;
                BlockPos pos = entity.blockPosition();
                result.add(new EntityInfo(
                        entity.getStringUUID(),
                        EntityType.getKey(entity.getType()).toString(),
                        customName,
                        new Position(pos.getX(), pos.getY(), pos.getZ()),
                        health));
            }
            return result;
        }, List.of());
    }

    @Override
    public List<StorageInfo> storage(FarmConfig farm) {
        MinecraftServer server = serverSupplier.get();
        if (server == null) {
            return List.of();
        }
        return onMainThread(server, () -> {
            ServerLevel level = level(farm, server);
            if (level == null) {
                return List.<StorageInfo>of();
            }

            List<StorageInfo> result = new ArrayList<>();
            for (StorageConfig storageConfig : farm.storage()) {
                Position pos = storageConfig.position();
                BlockEntity blockEntity = level.getBlockEntity(new BlockPos(pos.x(), pos.y(), pos.z()));

                int capacity = 0;
                List<ItemStackInfo> items = List.of();
                if (blockEntity instanceof Container container) {
                    capacity = container.getContainerSize();
                    List<ItemStackInfo> slotItems = new ArrayList<>();
                    for (int slot = 0; slot < capacity; slot++) {
                        ItemStack stack = container.getItem(slot);
                        if (!stack.isEmpty()) {
                            slotItems.add(new ItemStackInfo(
                                    BuiltInRegistries.ITEM.getKey(stack.getItem()).toString(),
                                    stack.getCount(),
                                    shulkerContentsOf(stack)));
                        }
                    }
                    items = slotItems;
                }
                result.add(new StorageInfo(storageConfig.id(), storageConfig.label(), pos, capacity, items));
            }
            return result;
        }, List.of());
    }

    private static List<ItemStackInfo> shulkerContentsOf(ItemStack stack) {
        ItemContainerContents contents = stack.get(DataComponents.CONTAINER);
        if (contents == null) {
            return null;
        }
        List<ItemStackInfo> result = new ArrayList<>();
        for (ItemStack inner : contents.nonEmptyItems()) {
            result.add(new ItemStackInfo(BuiltInRegistries.ITEM.getKey(inner.getItem()).toString(), inner.getCount(), null));
        }
        return result.isEmpty() ? null : result;
    }

    @Override
    public boolean chunkLoaded(FarmConfig farm) {
        MinecraftServer server = serverSupplier.get();
        if (server == null) {
            return false;
        }
        return onMainThread(server, () -> {
            ServerLevel level = level(farm, server);
            if (level == null) {
                return false;
            }
            Position anchor = farm.anchor();
            return level.isLoaded(new BlockPos(anchor.x(), anchor.y(), anchor.z()));
        }, false);
    }

    @Override
    public List<OccupantInfo> occupants(FarmConfig farm) {
        if (farm.afkSpot() == null) {
            return List.of();
        }
        MinecraftServer server = serverSupplier.get();
        if (server == null) {
            return List.of();
        }
        return onMainThread(server, () -> {
            Position center = farm.afkSpot().position();
            double radius = farm.afkSpot().radius();
            List<OccupantInfo> result = new ArrayList<>();
            for (ServerPlayer player : server.getPlayerList().getPlayers()) {
                BlockPos pos = player.blockPosition();
                double dx = pos.getX() - center.x();
                double dy = pos.getY() - center.y();
                double dz = pos.getZ() - center.z();
                if (dx * dx + dy * dy + dz * dz <= radius * radius) {
                    result.add(new OccupantInfo(
                            player.getGameProfile().name(),
                            player instanceof EntityPlayerMPFake,
                            new Position(pos.getX(), pos.getY(), pos.getZ())));
                }
            }
            return result;
        }, List.of());
    }
}
