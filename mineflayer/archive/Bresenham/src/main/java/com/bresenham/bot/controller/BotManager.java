package com.bresenham.bot.controller;

import com.bresenham.bot.BresenhamMod;
import net.minecraft.server.network.ServerPlayerEntity;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Manages multiple bot controller instances.
 * Supports one bot per player for future multi-agent scenarios.
 */
public class BotManager {

    private final Map<UUID, BotController> controllers = new HashMap<>();
    private BotController primaryController;

    /**
     * Register a bot controller for a player.
     */
    public void registerController(ServerPlayerEntity player, BotController controller) {
        controllers.put(player.getUuid(), controller);
        controller.setPlayer(player);

        if (primaryController == null) {
            primaryController = controller;
        }

        BresenhamMod.LOGGER.info("[Bresenham] Bot controller registered for player: {}",
                player.getName().getString());
    }

    /**
     * Get the bot controller for a specific player.
     */
    public BotController getController(ServerPlayerEntity player) {
        return controllers.get(player.getUuid());
    }

    /**
     * Get the primary (first registered) bot controller.
     */
    public BotController getPrimaryController() {
        return primaryController;
    }

    /**
     * Tick all registered bot controllers.
     */
    public void tickAll() {
        for (BotController controller : controllers.values()) {
            controller.tick();
        }
    }

    /**
     * Remove a controller when a player disconnects.
     */
    public void removeController(UUID playerUuid) {
        BotController removed = controllers.remove(playerUuid);
        if (removed != null) {
            removed.setRunning(false);
            BresenhamMod.LOGGER.info("[Bresenham] Bot controller removed for player: {}", playerUuid);
        }
    }

    /**
     * Shut down all controllers.
     */
    public void shutdownAll() {
        for (BotController controller : controllers.values()) {
            controller.setRunning(false);
        }
        controllers.clear();
        primaryController = null;
    }

    public int getControllerCount() {
        return controllers.size();
    }
}
