package com.baritoneai.tasks;

import com.baritoneai.baritone.BaritoneWrapper;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.ContainerScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.inventory.ClickType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public class StorageHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Storage");
    private static final int SCAN_RADIUS = 10;
    private static final int TIMEOUT_TICKS = 200;  // 10 seconds per state
    private static final int APPROACH_DISTANCE = 4;
    private static final int MAX_FOOD_TO_KEEP = 64;

    // Item ID keywords — items matching any keyword are KEPT (never deposited)
    private static final Set<String> KEEP_KEYWORDS = Set.of(
            "sword", "pickaxe", "shovel", "hoe", "_axe",
            "crafting_table", "torch", "elytra", "firework_rocket",
            "bucket", "shield", "bow", "crossbow", "arrow",
            "helmet", "chestplate", "leggings", "boots"
    );

    private static final Set<String> FOOD_ITEMS = Set.of(
            "minecraft:cooked_beef", "minecraft:cooked_porkchop", "minecraft:cooked_mutton",
            "minecraft:cooked_chicken", "minecraft:cooked_salmon", "minecraft:cooked_cod",
            "minecraft:cooked_rabbit", "minecraft:bread", "minecraft:baked_potato",
            "minecraft:golden_carrot", "minecraft:golden_apple", "minecraft:enchanted_golden_apple",
            "minecraft:apple", "minecraft:melon_slice", "minecraft:sweet_berries",
            "minecraft:glow_berries", "minecraft:carrot", "minecraft:beetroot",
            "minecraft:dried_kelp", "minecraft:mushroom_stew", "minecraft:rabbit_stew",
            "minecraft:beetroot_soup", "minecraft:suspicious_stew", "minecraft:pumpkin_pie",
            "minecraft:cookie", "minecraft:cake"
    );

    public enum State {
        IDLE, NAVIGATING_TO_BASE, SCANNING_CHESTS, APPROACHING_CHEST,
        OPENING_CHEST, DEPOSITING, CLOSING_CHEST, DONE, FAILED
    }

    private final BaritoneWrapper baritone;

    private State state = State.IDLE;
    private int ticksInState = 0;
    private String failReason;
    private BlockPos baseLocation;
    private final List<BlockPos> chestPositions = new ArrayList<>();
    private int currentChestIndex = 0;
    private BlockPos currentChestPos;
    private int depositSlotIndex = 0;
    private int itemsDeposited = 0;

    public StorageHandler(BaritoneWrapper baritone) {
        this.baritone = baritone;
    }

    /**
     * Start storing items at the given base position.
     */
    public void storeItems(BlockPos basePos) {
        LOGGER.info("Starting item storage at base {}", basePos);
        this.baseLocation = basePos;
        this.failReason = null;
        this.chestPositions.clear();
        this.currentChestIndex = 0;
        this.currentChestPos = null;
        this.depositSlotIndex = 0;
        this.itemsDeposited = 0;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            fail("Player is null");
            return;
        }

        double distToBase = mc.player.position().distanceTo(
                new Vec3(basePos.getX() + 0.5, basePos.getY(), basePos.getZ() + 0.5)
        );

        if (distToBase <= SCAN_RADIUS) {
            transition(State.SCANNING_CHESTS);
        } else {
            baritone.gotoPosition(basePos.getX() + 0.5, basePos.getY(), basePos.getZ() + 0.5);
            transition(State.NAVIGATING_TO_BASE);
        }
    }

    /**
     * Called every tick from TaskStateMachine.
     */
    public void tick() {
        if (state == State.IDLE || state == State.DONE || state == State.FAILED) return;

        ticksInState++;
        if (ticksInState > TIMEOUT_TICKS) {
            fail("Timed out in state " + state.name());
            return;
        }

        Minecraft mc = Minecraft.getInstance();
        LocalPlayer player = mc.player;
        if (player == null) return;

        switch (state) {
            case NAVIGATING_TO_BASE -> handleNavigatingToBase(mc, player);
            case SCANNING_CHESTS -> handleScanningChests(mc, player);
            case APPROACHING_CHEST -> handleApproachingChest(mc, player);
            case OPENING_CHEST -> handleOpeningChest(mc, player);
            case DEPOSITING -> handleDepositing(mc, player);
            case CLOSING_CHEST -> handleClosingChest(mc, player);
            default -> {}
        }
    }

    // ========== State Handlers ==========

    private void handleNavigatingToBase(Minecraft mc, LocalPlayer player) {
        if (baseLocation == null) {
            fail("No base location");
            return;
        }

        double dist = player.position().distanceTo(
                new Vec3(baseLocation.getX() + 0.5, baseLocation.getY(), baseLocation.getZ() + 0.5)
        );

        if (dist <= SCAN_RADIUS) {
            baritone.stop();
            transition(State.SCANNING_CHESTS);
        }
    }

    private void handleScanningChests(Minecraft mc, LocalPlayer player) {
        if (ticksInState > 1) return;  // Only scan once

        BlockPos playerPos = player.blockPosition();
        chestPositions.clear();

        for (int dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx++) {
            for (int dy = -3; dy <= 3; dy++) {
                for (int dz = -SCAN_RADIUS; dz <= SCAN_RADIUS; dz++) {
                    BlockPos pos = playerPos.offset(dx, dy, dz);
                    if (mc.level != null && mc.level.getBlockState(pos).is(Blocks.CHEST)) {
                        chestPositions.add(pos);
                    }
                }
            }
        }

        if (chestPositions.isEmpty()) {
            fail("No chests found near base");
            return;
        }

        LOGGER.info("Found {} chest(s) near base", chestPositions.size());
        currentChestIndex = 0;
        approachNextChest(player);
    }

    private void handleApproachingChest(Minecraft mc, LocalPlayer player) {
        if (currentChestPos == null) {
            fail("Lost chest position");
            return;
        }

        double dist = player.position().distanceTo(
                new Vec3(currentChestPos.getX() + 0.5, currentChestPos.getY(), currentChestPos.getZ() + 0.5)
        );

        if (dist <= APPROACH_DISTANCE) {
            baritone.stop();
            transition(State.OPENING_CHEST);
        }
    }

    private void handleOpeningChest(Minecraft mc, LocalPlayer player) {
        if (ticksInState == 1) {
            if (currentChestPos != null && mc.gameMode != null && mc.level != null) {
                BlockHitResult hitResult = new BlockHitResult(
                        new Vec3(
                                currentChestPos.getX() + 0.5,
                                currentChestPos.getY() + 0.5,
                                currentChestPos.getZ() + 0.5
                        ),
                        Direction.UP,
                        currentChestPos,
                        false
                );
                mc.gameMode.useItemOn(player, InteractionHand.MAIN_HAND, hitResult);
            }
        }

        // Wait for container screen to open
        if (mc.screen instanceof ContainerScreen) {
            LOGGER.info("Chest opened");
            depositSlotIndex = 0;
            transition(State.DEPOSITING);
        }
    }

    private void handleDepositing(Minecraft mc, LocalPlayer player) {
        if (mc.gameMode == null) return;
        if (!(mc.screen instanceof ContainerScreen)) {
            fail("Chest screen closed unexpectedly");
            return;
        }

        int containerId = player.containerMenu.containerId;
        int totalContainerSlots = player.containerMenu.slots.size();

        // chestSlots = total - 36 (player inv = 27 main + 9 hotbar)
        int chestSlots = totalContainerSlots - 36;
        int playerInvStart = chestSlots;
        int playerInvEnd = totalContainerSlots;

        int foodKept = countFoodInInventory(player, playerInvStart, playerInvEnd);

        // Process one slot per tick for server sync reliability
        while (depositSlotIndex < 36) {
            int containerSlotIdx = playerInvStart + depositSlotIndex;
            depositSlotIndex++;

            if (containerSlotIdx >= playerInvEnd) break;

            ItemStack stack = player.containerMenu.getSlot(containerSlotIdx).getItem();
            if (stack.isEmpty()) continue;

            String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();

            // Keep essential items
            if (shouldKeepItem(itemId)) continue;

            // Keep some food
            if (FOOD_ITEMS.contains(itemId)) {
                if (foodKept < MAX_FOOD_TO_KEEP) {
                    foodKept += stack.getCount();
                    continue;
                }
            }

            // Check if chest has room
            boolean hasRoom = false;
            for (int i = 0; i < chestSlots; i++) {
                ItemStack chestStack = player.containerMenu.getSlot(i).getItem();
                if (chestStack.isEmpty() ||
                        (chestStack.getItem().builtInRegistryHolder().key().identifier().toString().equals(itemId)
                                && chestStack.getCount() < chestStack.getMaxStackSize())) {
                    hasRoom = true;
                    break;
                }
            }

            if (!hasRoom) {
                LOGGER.info("Chest full, trying next chest");
                mc.setScreen(null);
                currentChestIndex++;
                transition(State.CLOSING_CHEST);
                return;
            }

            // Shift-click to deposit
            mc.gameMode.handleInventoryMouseClick(
                    containerId, containerSlotIdx, 0, ClickType.QUICK_MOVE, player
            );
            itemsDeposited++;
            LOGGER.debug("Deposited {} (slot {})", itemId, containerSlotIdx);
            return;  // One item per tick
        }

        // Finished scanning all player slots for this chest
        LOGGER.info("Deposited {} items total so far", itemsDeposited);
        mc.setScreen(null);

        if (hasDepositableItems(player)) {
            currentChestIndex++;
            if (currentChestIndex < chestPositions.size()) {
                transition(State.CLOSING_CHEST);
            } else {
                LOGGER.info("All chests checked, finishing storage");
                state = State.DONE;
            }
        } else {
            state = State.DONE;
            LOGGER.info("All items stored successfully ({} total)", itemsDeposited);
        }
    }

    private void handleClosingChest(Minecraft mc, LocalPlayer player) {
        // Wait 5 ticks after closing screen for server sync
        if (ticksInState >= 5) {
            if (currentChestIndex < chestPositions.size()) {
                approachNextChest(player);
            } else {
                state = State.DONE;
            }
        }
    }

    // ========== Helpers ==========

    private void approachNextChest(LocalPlayer player) {
        currentChestPos = chestPositions.get(currentChestIndex);
        double dist = player.position().distanceTo(
                new Vec3(currentChestPos.getX() + 0.5, currentChestPos.getY(), currentChestPos.getZ() + 0.5)
        );

        if (dist <= APPROACH_DISTANCE) {
            transition(State.OPENING_CHEST);
        } else {
            baritone.gotoPosition(
                    currentChestPos.getX() + 0.5, currentChestPos.getY(), currentChestPos.getZ() + 0.5
            );
            transition(State.APPROACHING_CHEST);
        }
    }

    private boolean shouldKeepItem(String itemId) {
        for (String keyword : KEEP_KEYWORDS) {
            if (itemId.contains(keyword)) return true;
        }
        return false;
    }

    private int countFoodInInventory(LocalPlayer player, int slotStart, int slotEnd) {
        int total = 0;
        for (int i = slotStart; i < slotEnd; i++) {
            ItemStack stack = player.containerMenu.getSlot(i).getItem();
            if (!stack.isEmpty()) {
                String id = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                if (FOOD_ITEMS.contains(id)) {
                    total += stack.getCount();
                }
            }
        }
        return total;
    }

    private boolean hasDepositableItems(LocalPlayer player) {
        int foodCount = 0;
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (stack.isEmpty()) continue;
            String id = stack.getItem().builtInRegistryHolder().key().identifier().toString();
            if (shouldKeepItem(id)) continue;
            if (FOOD_ITEMS.contains(id)) {
                foodCount += stack.getCount();
                if (foodCount <= MAX_FOOD_TO_KEEP) continue;
            }
            return true;
        }
        return false;
    }

    private void transition(State newState) {
        LOGGER.debug("Storage state: {} -> {}", state, newState);
        state = newState;
        ticksInState = 0;
    }

    private void fail(String reason) {
        LOGGER.warn("Storage failed: {}", reason);
        this.failReason = reason;
        this.state = State.FAILED;
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen != null) mc.setScreen(null);
    }

    public void reset() {
        state = State.IDLE;
        ticksInState = 0;
        failReason = null;
        baseLocation = null;
        chestPositions.clear();
        currentChestIndex = 0;
        currentChestPos = null;
        depositSlotIndex = 0;
        itemsDeposited = 0;
    }

    public boolean isStoring() {
        return state != State.IDLE && state != State.DONE && state != State.FAILED;
    }

    public boolean isDone() {
        return state == State.DONE;
    }

    public boolean hasFailed() {
        return state == State.FAILED;
    }

    public String getFailReason() {
        return failReason;
    }

    public State getState() {
        return state;
    }
}
