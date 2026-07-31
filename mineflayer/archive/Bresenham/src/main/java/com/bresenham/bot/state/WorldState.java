package com.bresenham.bot.state;

import net.minecraft.block.Block;
import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.BlockPos;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Central representation of the bot's environment and internal state.
 * Updated every tick and accessible by all subsystems.
 */
public class WorldState {

    private ServerPlayerEntity player;
    private final InventoryTracker inventoryTracker;
    private final EntityTracker entityTracker;
    private final Map<Block, List<BlockPos>> knownResources;

    // Cached state values (updated each tick)
    private float health;
    private int hunger;
    private BlockPos position;
    private ItemStack equippedTool;

    public WorldState() {
        this.inventoryTracker = new InventoryTracker();
        this.entityTracker = new EntityTracker();
        this.knownResources = new HashMap<>();
    }

    /**
     * Update all tracked state from the player entity.
     * Called every tick by BotController.
     */
    public void update(ServerPlayerEntity player) {
        this.player = player;
        if (player == null) return;

        this.health = player.getHealth();
        this.hunger = player.getHungerManager().getFoodLevel();
        this.position = player.getBlockPos();
        this.equippedTool = player.getMainHandStack();

        inventoryTracker.update(player.getInventory());
        entityTracker.update(player);
    }

    public ServerPlayerEntity getPlayer() {
        return player;
    }

    public float getHealth() {
        return health;
    }

    public int getHunger() {
        return hunger;
    }

    public BlockPos getPosition() {
        return position;
    }

    public ItemStack getEquippedTool() {
        return equippedTool;
    }

    public boolean hasItem(Item item) {
        return inventoryTracker.hasItem(item);
    }

    public int getItemCount(Item item) {
        return inventoryTracker.getItemCount(item);
    }

    public InventoryTracker getInventoryTracker() {
        return inventoryTracker;
    }

    public EntityTracker getEntityTracker() {
        return entityTracker;
    }

    public List<Entity> getNearbyHostiles(double radius) {
        return entityTracker.getHostilesInRange(radius);
    }

    private static final int MAX_KNOWN_RESOURCES_PER_TYPE = 64;

    /**
     * Register a known resource location for future reference.
     * Deduplicates and caps at MAX_KNOWN_RESOURCES_PER_TYPE per block type.
     */
    public void addKnownResource(Block block, BlockPos pos) {
        List<BlockPos> locations = knownResources.computeIfAbsent(block, k -> new ArrayList<>());
        if (!locations.contains(pos)) {
            if (locations.size() >= MAX_KNOWN_RESOURCES_PER_TYPE) {
                locations.remove(0); // Remove oldest
            }
            locations.add(pos);
        }
    }

    /**
     * Get all known locations of a resource type.
     */
    public List<BlockPos> getKnownResourceLocations(Block block) {
        return knownResources.getOrDefault(block, List.of());
    }

    public Map<Block, List<BlockPos>> getAllKnownResources() {
        return knownResources;
    }
}
