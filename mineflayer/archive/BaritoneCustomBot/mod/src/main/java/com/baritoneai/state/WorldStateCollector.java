package com.baritoneai.state;

import com.baritoneai.baritone.BaritoneWrapper;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class WorldStateCollector {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-State");
    private static final int ENTITY_SCAN_RADIUS = 32;
    private static final int MAX_ENTITIES = 50;
    private static final int MAX_HOSTILES = 20;
    private static final int MAX_PLAYERS = 20;
    private static final int PORTAL_SCAN_RADIUS = 48;
    private static final int PORTAL_SCAN_Y_RANGE = 15;
    private static final int PORTAL_SCAN_INTERVAL = 200; // ~10 seconds
    private static final int CHEST_SCAN_RADIUS = 16;
    private static final int CHEST_SCAN_INTERVAL = 200; // ~10 seconds

    private final BaritoneWrapper baritoneWrapper;
    private int portalScanCounter = 0;
    private List<WorldStateSnapshot.PortalInfo> cachedPortals = new ArrayList<>();
    private int chestScanCounter = 0;
    private List<WorldStateSnapshot.ChestInfo> cachedChests = new ArrayList<>();

    public WorldStateCollector(BaritoneWrapper baritoneWrapper) {
        this.baritoneWrapper = baritoneWrapper;
    }

    /**
     * Collect a full world state snapshot. Must be called on the client thread.
     */
    public WorldStateSnapshot collect(String taskState, String taskType, String taskDescription) {
        Minecraft mc = Minecraft.getInstance();
        LocalPlayer player = mc.player;
        if (player == null || mc.level == null) return null;

        WorldStateSnapshot snapshot = new WorldStateSnapshot();

        try {
            collectPlayerState(player, snapshot);
            collectEnvironment(player, snapshot);
            collectInventory(player, snapshot);
            collectNearbyEntities(player, snapshot);
            collectCapabilities(player, snapshot);
            collectNearbyPortals(player, snapshot);
            collectNearbyChests(player, snapshot);
            collectSchematics(snapshot);

            snapshot.currentTaskState = taskState;
            snapshot.currentTaskType = taskType;
            snapshot.currentTaskDescription = taskDescription;
            snapshot.baritoneActive = baritoneWrapper.isInitialized()
                    && (baritoneWrapper.hasActiveProcess() || baritoneWrapper.isPathing());
        } catch (Exception e) {
            LOGGER.error("Error collecting world state", e);
        }

        return snapshot;
    }

    private void collectPlayerState(LocalPlayer player, WorldStateSnapshot snapshot) {
        snapshot.x = player.getX();
        snapshot.y = player.getY();
        snapshot.z = player.getZ();
        snapshot.yaw = player.getYRot();
        snapshot.pitch = player.getXRot();
        snapshot.health = player.getHealth();
        snapshot.food = player.getFoodData().getFoodLevel();
        snapshot.saturation = player.getFoodData().getSaturationLevel();
        snapshot.experienceLevel = player.experienceLevel;
        snapshot.isOnGround = player.onGround();
        snapshot.isInWater = player.isInWater();
        snapshot.isFallFlying = player.isFallFlying();
    }

    private void collectEnvironment(LocalPlayer player, WorldStateSnapshot snapshot) {
        snapshot.biome = player.level().getBiome(player.blockPosition())
                .unwrapKey()
                .map(k -> k.identifier().toString())
                .orElse("unknown");
        snapshot.dimension = player.level().dimension().identifier().toString();
        snapshot.timeOfDay = player.level().getDayTime() % 24000;
        snapshot.isRaining = player.level().isRaining();
    }

    private void collectInventory(LocalPlayer player, WorldStateSnapshot snapshot) {
        // Main inventory (slots 0-35)
        snapshot.inventory = new ArrayList<>();
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (!stack.isEmpty()) {
                String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                snapshot.inventory.add(new WorldStateSnapshot.ItemStackInfo(itemId, stack.getCount(), i));
            }
        }

        snapshot.usedInventorySlots = snapshot.inventory.size();

        // Armor (feet, legs, chest, head)
        snapshot.armor = new ArrayList<>();
        net.minecraft.world.entity.EquipmentSlot[] armorSlots = {
                net.minecraft.world.entity.EquipmentSlot.FEET,
                net.minecraft.world.entity.EquipmentSlot.LEGS,
                net.minecraft.world.entity.EquipmentSlot.CHEST,
                net.minecraft.world.entity.EquipmentSlot.HEAD
        };
        for (int i = 0; i < armorSlots.length; i++) {
            ItemStack stack = player.getItemBySlot(armorSlots[i]);
            if (!stack.isEmpty()) {
                String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                snapshot.armor.add(new WorldStateSnapshot.ItemStackInfo(itemId, stack.getCount(), i));
            }
        }

        // Main hand and off hand
        ItemStack mainHand = player.getMainHandItem();
        if (!mainHand.isEmpty()) {
            String itemId = mainHand.getItem().builtInRegistryHolder().key().identifier().toString();
            snapshot.mainHand = new WorldStateSnapshot.ItemStackInfo(itemId, mainHand.getCount(), -1);
        }

        ItemStack offHand = player.getOffhandItem();
        if (!offHand.isEmpty()) {
            String itemId = offHand.getItem().builtInRegistryHolder().key().identifier().toString();
            snapshot.offHand = new WorldStateSnapshot.ItemStackInfo(itemId, offHand.getCount(), -1);
        }
    }

    private void collectNearbyEntities(LocalPlayer player, WorldStateSnapshot snapshot) {
        AABB scanBox = player.getBoundingBox().inflate(ENTITY_SCAN_RADIUS);
        List<Entity> entities = player.level().getEntities(player, scanBox);

        snapshot.nearbyEntities = new ArrayList<>();
        snapshot.nearbyHostiles = new ArrayList<>();
        snapshot.nearbyPlayers = new ArrayList<>();

        // Sort by distance for relevance
        entities.sort(Comparator.comparingDouble(e -> e.distanceTo(player)));

        for (Entity entity : entities) {
            double dist = entity.distanceTo(player);

            // Hostile mobs
            if (entity instanceof Monster monster && snapshot.nearbyHostiles.size() < MAX_HOSTILES) {
                snapshot.nearbyHostiles.add(new WorldStateSnapshot.EntityInfo(
                        entity.getType().toShortString(),
                        entity.getName().getString(),
                        dist,
                        entity.getX(), entity.getY(), entity.getZ(),
                        monster.getHealth()
                ));
            }

            // Players
            if (entity instanceof Player p && p != player && snapshot.nearbyPlayers.size() < MAX_PLAYERS) {
                snapshot.nearbyPlayers.add(new WorldStateSnapshot.PlayerInfo(
                        p.getName().getString(),
                        dist,
                        p.getX(), p.getY(), p.getZ()
                ));
            }

            // All entities (capped)
            if (snapshot.nearbyEntities.size() < MAX_ENTITIES) {
                float entityHealth = entity instanceof LivingEntity le ? le.getHealth() : 0;
                snapshot.nearbyEntities.add(new WorldStateSnapshot.EntityInfo(
                        entity.getType().toShortString(),
                        entity.getName().getString(),
                        dist,
                        entity.getX(), entity.getY(), entity.getZ(),
                        entityHealth
                ));
            }
        }
    }

    private void collectCapabilities(LocalPlayer player, WorldStateSnapshot snapshot) {
        boolean hasElytra = false;
        ItemStack chestItem = player.getItemBySlot(EquipmentSlot.CHEST);
        boolean elytraEquipped = !chestItem.isEmpty() &&
                chestItem.getItem().builtInRegistryHolder().key().identifier().toString()
                        .equals("minecraft:elytra");
        int fireworkCount = 0;
        boolean hasBoat = false;

        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (stack.isEmpty()) continue;

            String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();
            if (itemId.equals("minecraft:elytra")) hasElytra = true;
            if (itemId.equals("minecraft:firework_rocket")) fireworkCount += stack.getCount();
            if (itemId.endsWith("_boat")) hasBoat = true;
        }

        // Also count elytra if equipped
        if (elytraEquipped) hasElytra = true;

        snapshot.hasElytra = hasElytra;
        snapshot.elytraEquipped = elytraEquipped;
        snapshot.fireworkCount = fireworkCount;
        snapshot.hasBoat = hasBoat;
        snapshot.isInBoat = player.isPassenger() && player.getVehicle() instanceof AbstractBoat;
    }

    private void collectNearbyPortals(LocalPlayer player, WorldStateSnapshot snapshot) {
        portalScanCounter++;
        if (portalScanCounter < PORTAL_SCAN_INTERVAL) {
            // Use cached results
            snapshot.nearbyPortals = new ArrayList<>(cachedPortals);
            return;
        }
        portalScanCounter = 0;

        List<WorldStateSnapshot.PortalInfo> portals = new ArrayList<>();
        Set<Long> seenFrames = new HashSet<>(); // Track portal frames to avoid duplicates

        BlockPos playerPos = player.blockPosition();
        int minY = Math.max(player.level().getMinY(), playerPos.getY() - PORTAL_SCAN_Y_RANGE);
        int maxY = Math.min(player.level().getMaxY(), playerPos.getY() + PORTAL_SCAN_Y_RANGE);

        for (int x = playerPos.getX() - PORTAL_SCAN_RADIUS; x <= playerPos.getX() + PORTAL_SCAN_RADIUS; x++) {
            for (int z = playerPos.getZ() - PORTAL_SCAN_RADIUS; z <= playerPos.getZ() + PORTAL_SCAN_RADIUS; z++) {
                for (int y = minY; y <= maxY; y++) {
                    BlockPos pos = new BlockPos(x, y, z);
                    if (player.level().getBlockState(pos).getBlock() == Blocks.NETHER_PORTAL) {
                        // Deduplicate: group portal blocks within 4 blocks as same frame
                        long frameKey = ((long) (x / 4)) << 32 | ((long) (z / 4)) & 0xFFFFFFFFL;
                        if (seenFrames.add(frameKey)) {
                            portals.add(new WorldStateSnapshot.PortalInfo(x, y, z));
                        }
                    }
                }
            }
        }

        cachedPortals = portals;
        snapshot.nearbyPortals = new ArrayList<>(portals);

        if (!portals.isEmpty()) {
            LOGGER.debug("Found {} nearby portal(s)", portals.size());
        }
    }

    private void collectNearbyChests(LocalPlayer player, WorldStateSnapshot snapshot) {
        chestScanCounter++;
        if (chestScanCounter < CHEST_SCAN_INTERVAL) {
            snapshot.nearbyChests = new ArrayList<>(cachedChests);
            return;
        }
        chestScanCounter = 0;

        List<WorldStateSnapshot.ChestInfo> chests = new ArrayList<>();
        BlockPos playerPos = player.blockPosition();

        for (int dx = -CHEST_SCAN_RADIUS; dx <= CHEST_SCAN_RADIUS; dx++) {
            for (int dy = -5; dy <= 5; dy++) {
                for (int dz = -CHEST_SCAN_RADIUS; dz <= CHEST_SCAN_RADIUS; dz++) {
                    BlockPos pos = playerPos.offset(dx, dy, dz);
                    if (player.level().getBlockState(pos).is(Blocks.CHEST)) {
                        double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        chests.add(new WorldStateSnapshot.ChestInfo(pos.getX(), pos.getY(), pos.getZ(), dist));
                    }
                }
            }
        }

        // Sort by distance
        chests.sort(Comparator.comparingDouble(c -> c.distance));

        cachedChests = chests;
        snapshot.nearbyChests = new ArrayList<>(chests);

        if (!chests.isEmpty()) {
            LOGGER.debug("Found {} nearby chest(s)", chests.size());
        }
    }

    private void collectSchematics(WorldStateSnapshot snapshot) {
        if (baritoneWrapper != null && baritoneWrapper.isInitialized()) {
            snapshot.availableSchematics = baritoneWrapper.getAvailableSchematics();
        }
    }
}
