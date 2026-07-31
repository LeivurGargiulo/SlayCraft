package com.bresenham.bot.executor;

import net.minecraft.item.Item;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.BlockPos;

/**
 * Abstraction layer for all in-game actions.
 * Decoupled from task logic to allow different backends (Baritone, vanilla, etc.).
 */
public interface ActionExecutor {

    /**
     * Set the player entity this executor controls.
     */
    void setPlayer(ServerPlayerEntity player);

    /**
     * Navigate the bot to the target position.
     */
    ActionResult moveTo(BlockPos target);

    /**
     * Mine the block at the given position.
     * May involve moving to the block first.
     */
    ActionResult mineBlock(BlockPos target);

    /**
     * Craft the specified item.
     * @param item the item to craft
     * @param count how many to craft
     */
    ActionResult craftItem(Item item, int count);

    /**
     * Interact with a block or entity at the given position.
     */
    ActionResult interact(BlockPos target);

    /**
     * Stop all current actions immediately.
     */
    void stop();

    /**
     * @return true if the executor is currently performing an action
     */
    boolean isBusy();
}
