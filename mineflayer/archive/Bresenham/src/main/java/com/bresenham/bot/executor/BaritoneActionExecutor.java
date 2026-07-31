package com.bresenham.bot.executor;

import com.bresenham.bot.BresenhamMod;
import net.minecraft.item.Item;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.BlockPos;

/**
 * Action executor backed by Baritone for pathfinding and movement.
 * Uses soft dependency pattern — gracefully degrades if Baritone is not available.
 *
 * In a full implementation with Baritone on the classpath, this would use:
 * - BaritoneAPI.getProvider().getBaritoneForPlayer(player)
 * - IBaritone.getCustomGoalProcess().setGoalAndPath(new GoalBlock(pos))
 * - IBaritone.getMineProcess().mine(block)
 */
public class BaritoneActionExecutor implements ActionExecutor {

    private ServerPlayerEntity player;
    private boolean busy = false;
    private boolean baritoneAvailable = false;

    public BaritoneActionExecutor(ServerPlayerEntity player) {
        this.player = player;
        checkBaritoneAvailability();
    }

    @Override
    public void setPlayer(ServerPlayerEntity player) {
        this.player = player;
    }

    private void checkBaritoneAvailability() {
        try {
            Class.forName("baritone.api.BaritoneAPI");
            baritoneAvailable = true;
            BresenhamMod.LOGGER.info("[Bresenham] Baritone detected, using Baritone for pathfinding.");
        } catch (ClassNotFoundException e) {
            baritoneAvailable = false;
            BresenhamMod.LOGGER.info("[Bresenham] Baritone not found, using vanilla fallback.");
        }
    }

    @Override
    public ActionResult moveTo(BlockPos target) {
        if (player == null) return ActionResult.FAILURE;

        if (baritoneAvailable) {
            return moveToBaritone(target);
        } else {
            return moveToVanilla(target);
        }
    }

    private ActionResult moveToBaritone(BlockPos target) {
        // Baritone integration would go here:
        // IBaritone baritone = BaritoneAPI.getProvider().getBaritoneForPlayer(player);
        // baritone.getCustomGoalProcess().setGoalAndPath(new GoalBlock(target));
        // return baritone.getPathingBehavior().isPathing() ? ActionResult.IN_PROGRESS : ActionResult.SUCCESS;

        BresenhamMod.LOGGER.debug("[Bresenham] Baritone moveTo: {}", target);
        busy = true;
        return ActionResult.IN_PROGRESS;
    }

    private ActionResult moveToVanilla(BlockPos target) {
        // Simple vanilla fallback: teleport or walk towards target
        double distance = player.getBlockPos().getSquaredDistance(target);
        if (distance < 4) {
            busy = false;
            return ActionResult.SUCCESS;
        }

        // In a real implementation, this would handle vanilla pathfinding
        BresenhamMod.LOGGER.debug("[Bresenham] Vanilla moveTo: {} (distance: {})", target, Math.sqrt(distance));
        busy = true;
        return ActionResult.IN_PROGRESS;
    }

    @Override
    public ActionResult mineBlock(BlockPos target) {
        if (player == null) return ActionResult.FAILURE;

        if (baritoneAvailable) {
            // Baritone: baritone.getMineProcess().mine(block)
            BresenhamMod.LOGGER.debug("[Bresenham] Baritone mineBlock: {}", target);
        } else {
            BresenhamMod.LOGGER.debug("[Bresenham] Vanilla mineBlock: {}", target);
        }

        busy = true;
        return ActionResult.IN_PROGRESS;
    }

    @Override
    public ActionResult craftItem(Item item, int count) {
        if (player == null) return ActionResult.FAILURE;

        BresenhamMod.LOGGER.debug("[Bresenham] Crafting {} x{}", item, count);
        // Crafting logic would interact with the crafting table screen handler
        busy = true;
        return ActionResult.IN_PROGRESS;
    }

    @Override
    public ActionResult interact(BlockPos target) {
        if (player == null) return ActionResult.FAILURE;

        BresenhamMod.LOGGER.debug("[Bresenham] Interacting with block at {}", target);
        busy = true;
        return ActionResult.IN_PROGRESS;
    }

    @Override
    public void stop() {
        if (baritoneAvailable) {
            // Baritone: baritone.getPathingBehavior().cancelEverything()
        }
        busy = false;
        BresenhamMod.LOGGER.debug("[Bresenham] Action executor stopped.");
    }

    @Override
    public boolean isBusy() {
        return busy;
    }

    public boolean isBaritoneAvailable() {
        return baritoneAvailable;
    }
}
