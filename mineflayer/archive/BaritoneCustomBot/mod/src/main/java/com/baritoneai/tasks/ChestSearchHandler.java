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

public class ChestSearchHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-ChestSearch");
    private static final int SCAN_RADIUS = 16;
    private static final int TIMEOUT_TICKS = 200;  // 10 seconds per state
    private static final int APPROACH_DISTANCE = 4;

    public enum State {
        IDLE, SCANNING_CHESTS, APPROACHING_CHEST, OPENING_CHEST,
        SEARCHING, TAKING_ITEM, CLOSING_CHEST, DONE, FAILED
    }

    private final BaritoneWrapper baritone;

    private State state = State.IDLE;
    private int ticksInState = 0;
    private String failReason;

    // Search parameters
    private String targetItem;
    private int targetQuantity = 1;
    private int retrieved = 0;

    // Chest tracking
    private final List<BlockPos> chestPositions = new ArrayList<>();
    private int currentChestIndex = 0;
    private BlockPos currentChestPos;
    private int searchSlotIndex = 0;

    public ChestSearchHandler(BaritoneWrapper baritone) {
        this.baritone = baritone;
    }

    /**
     * Start searching nearby chests for a specific item.
     * @param item The item ID to search for (e.g., "minecraft:cooked_beef")
     * @param quantity How many to retrieve (0 = take all available)
     * @param specificChest If non-null, only search this chest
     */
    public void searchAndRetrieve(String item, int quantity, BlockPos specificChest) {
        LOGGER.info("Starting chest search for {} x{}", item, quantity);
        this.targetItem = item;
        this.targetQuantity = quantity > 0 ? quantity : 64;
        this.retrieved = 0;
        this.failReason = null;
        this.chestPositions.clear();
        this.currentChestIndex = 0;
        this.currentChestPos = null;
        this.searchSlotIndex = 0;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) {
            fail("Player is null");
            return;
        }

        if (specificChest != null) {
            chestPositions.add(specificChest);
            approachNextChest(mc.player);
        } else {
            transition(State.SCANNING_CHESTS);
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
            case SCANNING_CHESTS -> handleScanningChests(mc, player);
            case APPROACHING_CHEST -> handleApproachingChest(mc, player);
            case OPENING_CHEST -> handleOpeningChest(mc, player);
            case SEARCHING -> handleSearching(mc, player);
            case TAKING_ITEM -> handleTakingItem(mc, player);
            case CLOSING_CHEST -> handleClosingChest(mc, player);
            default -> {}
        }
    }

    // ========== State Handlers ==========

    private void handleScanningChests(Minecraft mc, LocalPlayer player) {
        if (ticksInState > 1) return;  // Only scan once

        BlockPos playerPos = player.blockPosition();
        chestPositions.clear();

        for (int dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx++) {
            for (int dy = -5; dy <= 5; dy++) {
                for (int dz = -SCAN_RADIUS; dz <= SCAN_RADIUS; dz++) {
                    BlockPos pos = playerPos.offset(dx, dy, dz);
                    if (mc.level != null && mc.level.getBlockState(pos).is(Blocks.CHEST)) {
                        chestPositions.add(pos);
                    }
                }
            }
        }

        if (chestPositions.isEmpty()) {
            fail("No chests found nearby");
            return;
        }

        // Sort by distance
        chestPositions.sort((a, b) -> {
            double distA = playerPos.distSqr(a);
            double distB = playerPos.distSqr(b);
            return Double.compare(distA, distB);
        });

        LOGGER.info("Found {} chest(s) to search", chestPositions.size());
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
            LOGGER.info("Chest opened, searching for {}", targetItem);
            searchSlotIndex = 0;
            transition(State.SEARCHING);
        }
    }

    private void handleSearching(Minecraft mc, LocalPlayer player) {
        if (mc.gameMode == null) return;
        if (!(mc.screen instanceof ContainerScreen)) {
            fail("Chest screen closed unexpectedly");
            return;
        }

        int totalContainerSlots = player.containerMenu.slots.size();
        int chestSlots = totalContainerSlots - 36;  // 36 = player inventory

        // Search through chest slots (not player inventory)
        while (searchSlotIndex < chestSlots) {
            int slotIdx = searchSlotIndex;
            searchSlotIndex++;

            ItemStack stack = player.containerMenu.getSlot(slotIdx).getItem();
            if (stack.isEmpty()) continue;

            String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();
            if (itemId.equals(targetItem)) {
                LOGGER.info("Found {} x{} in chest slot {}", itemId, stack.getCount(), slotIdx);
                // Shift-click to take item
                int containerId = player.containerMenu.containerId;
                mc.gameMode.handleInventoryMouseClick(
                        containerId, slotIdx, 0, ClickType.QUICK_MOVE, player
                );
                retrieved += stack.getCount();
                transition(State.TAKING_ITEM);
                return;
            }
        }

        // Finished searching this chest — no more matching items
        LOGGER.info("No more {} in this chest (retrieved {} so far)", targetItem, retrieved);
        mc.setScreen(null);

        if (retrieved >= targetQuantity) {
            LOGGER.info("Retrieved enough items ({}/{}), done", retrieved, targetQuantity);
            state = State.DONE;
        } else {
            // Try next chest
            currentChestIndex++;
            if (currentChestIndex < chestPositions.size()) {
                transition(State.CLOSING_CHEST);
            } else if (retrieved > 0) {
                LOGGER.info("Searched all chests, retrieved {} (wanted {})", retrieved, targetQuantity);
                state = State.DONE;
            } else {
                fail("Item " + targetItem + " not found in any nearby chest");
            }
        }
    }

    private void handleTakingItem(Minecraft mc, LocalPlayer player) {
        // Wait a few ticks for server sync after shift-click
        if (ticksInState >= 3) {
            if (retrieved >= targetQuantity) {
                LOGGER.info("Retrieved enough items ({}/{}), closing chest", retrieved, targetQuantity);
                mc.setScreen(null);
                state = State.DONE;
            } else {
                // Continue searching this chest for more
                transition(State.SEARCHING);
            }
        }
    }

    private void handleClosingChest(Minecraft mc, LocalPlayer player) {
        // Wait a few ticks after closing for server sync
        if (ticksInState >= 5) {
            if (currentChestIndex < chestPositions.size()) {
                approachNextChest(player);
            } else if (retrieved > 0) {
                state = State.DONE;
            } else {
                fail("Item " + targetItem + " not found in any nearby chest");
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

    private void transition(State newState) {
        LOGGER.debug("ChestSearch state: {} -> {}", state, newState);
        state = newState;
        ticksInState = 0;
    }

    private void fail(String reason) {
        LOGGER.warn("Chest search failed: {}", reason);
        this.failReason = reason;
        this.state = State.FAILED;
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen != null) mc.setScreen(null);
    }

    public void reset() {
        state = State.IDLE;
        ticksInState = 0;
        failReason = null;
        targetItem = null;
        targetQuantity = 1;
        retrieved = 0;
        chestPositions.clear();
        currentChestIndex = 0;
        currentChestPos = null;
        searchSlotIndex = 0;
    }

    public boolean isSearching() {
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
