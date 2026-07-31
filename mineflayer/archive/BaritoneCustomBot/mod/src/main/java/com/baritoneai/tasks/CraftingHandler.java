package com.baritoneai.tasks;

import com.baritoneai.baritone.BaritoneWrapper;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.CraftingScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.inventory.ClickType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Blocks;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class CraftingHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Crafting");
    private static final int SEARCH_RADIUS = 5;
    private static final int TIMEOUT_TICKS = 200; // 10 seconds max per state

    public enum State {
        IDLE, FINDING_TABLE, APPROACHING_TABLE, OPENING_TABLE,
        OPENING_INVENTORY, PLACING_ITEMS, WAITING_RESULT, TAKING_RESULT,
        DONE, FAILED
    }

    private final BaritoneWrapper baritone;

    private State state = State.IDLE;
    private String targetItem;
    private int targetCount;
    private JsonArray grid;
    private boolean needsTable;
    private int ticksInState = 0;
    private int craftsMade = 0;
    private BlockPos craftingTablePos;
    private String failReason;

    public CraftingHandler(BaritoneWrapper baritone) {
        this.baritone = baritone;
    }

    /**
     * Start a crafting task.
     * @param item Target item ID (e.g., "minecraft:diamond_pickaxe")
     * @param count Number of crafting operations
     * @param grid Recipe grid as JSON 2D array
     * @param needsTable Whether a 3x3 crafting table is required
     */
    public void craft(String item, int count, JsonArray grid, boolean needsTable) {
        LOGGER.info("Starting craft: {} x{} (needsTable={})", item, count, needsTable);
        this.targetItem = item;
        this.targetCount = count;
        this.grid = grid;
        this.needsTable = needsTable;
        this.craftsMade = 0;
        this.failReason = null;
        this.craftingTablePos = null;

        if (needsTable) {
            this.state = State.FINDING_TABLE;
        } else {
            this.state = State.OPENING_INVENTORY;
        }
        this.ticksInState = 0;
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
            case FINDING_TABLE -> handleFindingTable(mc, player);
            case APPROACHING_TABLE -> handleApproachingTable(mc, player);
            case OPENING_TABLE -> handleOpeningTable(mc, player);
            case OPENING_INVENTORY -> handleOpeningInventory(mc, player);
            case PLACING_ITEMS -> handlePlacingItems(mc, player);
            case WAITING_RESULT -> handleWaitingResult(mc, player);
            case TAKING_RESULT -> handleTakingResult(mc, player);
            default -> {}
        }
    }

    // ========== State Handlers ==========

    private void handleFindingTable(Minecraft mc, LocalPlayer player) {
        // Only search once when entering this state
        if (ticksInState > 1) return;

        // Search for nearby crafting table
        BlockPos playerPos = player.blockPosition();
        for (int dx = -SEARCH_RADIUS; dx <= SEARCH_RADIUS; dx++) {
            for (int dy = -2; dy <= 2; dy++) {
                for (int dz = -SEARCH_RADIUS; dz <= SEARCH_RADIUS; dz++) {
                    BlockPos pos = playerPos.offset(dx, dy, dz);
                    if (mc.level != null && mc.level.getBlockState(pos).is(Blocks.CRAFTING_TABLE)) {
                        craftingTablePos = pos;
                        LOGGER.info("Found crafting table at {}", pos);
                        if (player.blockPosition().distManhattan(pos) <= 4) {
                            // Already close enough, open it
                            transition(State.OPENING_TABLE);
                        } else {
                            // Need to walk to it
                            baritone.gotoPosition(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5);
                            transition(State.APPROACHING_TABLE);
                        }
                        return;
                    }
                }
            }
        }

        // No table found — check if we have one in inventory to place
        int tableSlot = findItemInInventory(player, "minecraft:crafting_table");
        if (tableSlot >= 0) {
            LOGGER.info("Placing crafting table from inventory");
            placeCraftingTable(mc, player, tableSlot);
            return;
        }

        // No table available
        fail("No crafting table found nearby and none in inventory");
    }

    private void handleApproachingTable(Minecraft mc, LocalPlayer player) {
        if (craftingTablePos == null) {
            fail("Lost crafting table position");
            return;
        }

        // Check if we're close enough
        double dist = player.position().distanceTo(
                new net.minecraft.world.phys.Vec3(
                        craftingTablePos.getX() + 0.5,
                        craftingTablePos.getY(),
                        craftingTablePos.getZ() + 0.5
                )
        );

        if (dist <= 4.0) {
            baritone.stop();
            transition(State.OPENING_TABLE);
        }
        // Otherwise keep waiting for Baritone to reach it
    }

    private void handleOpeningTable(Minecraft mc, LocalPlayer player) {
        if (ticksInState == 1) {
            // Right-click the crafting table
            if (craftingTablePos != null && mc.gameMode != null && mc.level != null) {
                net.minecraft.world.phys.BlockHitResult hitResult = new net.minecraft.world.phys.BlockHitResult(
                        new net.minecraft.world.phys.Vec3(
                                craftingTablePos.getX() + 0.5,
                                craftingTablePos.getY() + 0.5,
                                craftingTablePos.getZ() + 0.5
                        ),
                        net.minecraft.core.Direction.UP,
                        craftingTablePos,
                        false
                );
                mc.gameMode.useItemOn(player, net.minecraft.world.InteractionHand.MAIN_HAND, hitResult);
            }
        }

        // Wait for crafting screen to open
        if (mc.screen instanceof CraftingScreen) {
            LOGGER.info("Crafting table opened");
            transition(State.PLACING_ITEMS);
        }
    }

    private void handleOpeningInventory(Minecraft mc, LocalPlayer player) {
        if (ticksInState == 1) {
            // Open player inventory
            mc.setScreen(new InventoryScreen(player));
        }

        // Wait for inventory to open
        if (mc.screen instanceof InventoryScreen) {
            LOGGER.info("Inventory opened for 2x2 crafting");
            transition(State.PLACING_ITEMS);
        }
    }

    private void handlePlacingItems(Minecraft mc, LocalPlayer player) {
        // Only place items on the first tick in this state
        if (ticksInState > 1) {
            transition(State.WAITING_RESULT);
            return;
        }

        if (grid == null || grid.isEmpty()) {
            fail("No grid pattern provided");
            return;
        }

        if (mc.gameMode == null) return;

        boolean isCraftingTable = mc.screen instanceof CraftingScreen;
        int containerId = player.containerMenu.containerId;

        // Grid slot offset: crafting table slots 1-9, inventory crafting slots 1-4
        int gridSlot = 1;

        for (int row = 0; row < grid.size(); row++) {
            JsonArray rowArray = grid.get(row).getAsJsonArray();
            for (int col = 0; col < rowArray.size(); col++) {
                JsonElement cell = rowArray.get(col);
                if (cell.isJsonNull() || cell.getAsString().isEmpty()) {
                    gridSlot++;
                    continue;
                }

                String ingredientId = cell.getAsString();

                // Find this ingredient in the player's inventory portion of the container
                int invSlotStart = isCraftingTable ? 10 : 9;
                int invSlotEnd = isCraftingTable ? 46 : 45;
                int sourceSlot = -1;

                for (int i = invSlotStart; i < invSlotEnd; i++) {
                    ItemStack stack = player.containerMenu.getSlot(i).getItem();
                    if (!stack.isEmpty()) {
                        String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                        if (itemId.equals(ingredientId)) {
                            sourceSlot = i;
                            break;
                        }
                    }
                }

                if (sourceSlot == -1) {
                    // Try matching any planks variant if ingredient is a planks type
                    if (ingredientId.contains("planks")) {
                        for (int i = invSlotStart; i < invSlotEnd; i++) {
                            ItemStack stack = player.containerMenu.getSlot(i).getItem();
                            if (!stack.isEmpty()) {
                                String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                                if (itemId.contains("planks")) {
                                    sourceSlot = i;
                                    break;
                                }
                            }
                        }
                    }
                    // Try matching any log variant
                    if (sourceSlot == -1 && ingredientId.contains("log")) {
                        for (int i = invSlotStart; i < invSlotEnd; i++) {
                            ItemStack stack = player.containerMenu.getSlot(i).getItem();
                            if (!stack.isEmpty()) {
                                String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                                if (itemId.contains("log")) {
                                    sourceSlot = i;
                                    break;
                                }
                            }
                        }
                    }
                }

                if (sourceSlot == -1) {
                    fail("Missing ingredient: " + ingredientId);
                    return;
                }

                // Pick up one item from source slot (right-click = pick up 1)
                mc.gameMode.handleInventoryMouseClick(
                        containerId, sourceSlot, 1, ClickType.PICKUP, player
                );
                // Place it in the grid slot (left-click)
                mc.gameMode.handleInventoryMouseClick(
                        containerId, gridSlot, 0, ClickType.PICKUP, player
                );

                gridSlot++;
            }
        }

        LOGGER.info("Placed all ingredients in crafting grid");
    }

    private void handleWaitingResult(Minecraft mc, LocalPlayer player) {
        // Wait 2 ticks for the server to compute the result
        if (ticksInState < 2) return;

        // Check if output slot (slot 0) has an item
        ItemStack output = player.containerMenu.getSlot(0).getItem();
        if (!output.isEmpty()) {
            transition(State.TAKING_RESULT);
        } else if (ticksInState > 10) {
            fail("No crafting result appeared");
        }
    }

    private void handleTakingResult(Minecraft mc, LocalPlayer player) {
        if (ticksInState > 1) return;

        if (mc.gameMode == null) return;

        // Shift-click the output slot to take the result
        int containerId = player.containerMenu.containerId;
        mc.gameMode.handleInventoryMouseClick(
                containerId, 0, 0, ClickType.QUICK_MOVE, player
        );

        craftsMade++;
        LOGGER.info("Crafted {} ({}/{})", targetItem, craftsMade, targetCount);

        if (craftsMade < targetCount) {
            // Need to craft more — go back to placing items
            transition(State.PLACING_ITEMS);
        } else {
            // Done crafting — close screen
            mc.setScreen(null);
            state = State.DONE;
            LOGGER.info("Crafting complete: {} x{}", targetItem, craftsMade);
        }
    }

    // ========== Helpers ==========

    private void placeCraftingTable(Minecraft mc, LocalPlayer player, int inventorySlot) {
        // Select the crafting table in hotbar
        if (inventorySlot < 9) {
            player.getInventory().setSelectedSlot(inventorySlot);
        } else {
            // Swap to hotbar
            int hotbarSlot = player.getInventory().getSelectedSlot();
            if (mc.gameMode != null) {
                mc.gameMode.handleInventoryMouseClick(
                        player.inventoryMenu.containerId,
                        inventorySlot,
                        hotbarSlot,
                        ClickType.SWAP,
                        player
                );
            }
        }

        // Place it in front of the player
        BlockPos placePos = player.blockPosition().relative(player.getDirection());
        if (mc.gameMode != null && mc.level != null) {
            net.minecraft.world.phys.BlockHitResult hitResult = new net.minecraft.world.phys.BlockHitResult(
                    new net.minecraft.world.phys.Vec3(
                            placePos.getX() + 0.5,
                            placePos.getY() + 0.5,
                            placePos.getZ() + 0.5
                    ),
                    net.minecraft.core.Direction.UP,
                    placePos.below(),
                    false
            );
            mc.gameMode.useItemOn(player, net.minecraft.world.InteractionHand.MAIN_HAND, hitResult);
            craftingTablePos = placePos;

            // Wait a moment, then open the table
            transition(State.OPENING_TABLE);
        }
    }

    private int findItemInInventory(LocalPlayer player, String itemId) {
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (!stack.isEmpty()) {
                String id = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                if (id.equals(itemId)) return i;
            }
        }
        return -1;
    }

    private void transition(State newState) {
        LOGGER.debug("Crafting state: {} -> {}", state, newState);
        state = newState;
        ticksInState = 0;
    }

    private void fail(String reason) {
        LOGGER.warn("Crafting failed: {}", reason);
        this.failReason = reason;
        this.state = State.FAILED;

        // Close any open screen
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen != null) {
            mc.setScreen(null);
        }
    }

    public void reset() {
        state = State.IDLE;
        targetItem = null;
        targetCount = 0;
        grid = null;
        needsTable = false;
        ticksInState = 0;
        craftsMade = 0;
        craftingTablePos = null;
        failReason = null;
    }

    public boolean isCrafting() {
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
