package com.baritoneai.tasks;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.ItemStack;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class EatingHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Eating");
    private static final int LOW_HUNGER_THRESHOLD = 14;

    private boolean isEating = false;
    private int previousSlot = -1;
    private int eatingTimeout = 0;
    private int eatingStartupDelay = 0;
    private static final int MAX_EATING_TICKS = 60; // 3 seconds max
    private static final int EATING_STARTUP_GRACE = 5; // Wait 5 ticks before checking isUsingItem

    /**
     * Check if the bot should eat (hunger is low enough and player can eat).
     */
    public boolean shouldEat() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;
        return player.getFoodData().getFoodLevel() <= LOW_HUNGER_THRESHOLD &&
                player.getFoodData().needsFood() &&
                !isEating;
    }

    /**
     * Check if the player has any food in inventory.
     */
    public boolean hasFood() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;
        for (int i = 0; i < 36; i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (!stack.isEmpty() && stack.get(DataComponents.FOOD) != null) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find and eat the best food item in inventory.
     * Returns true if eating was started.
     */
    public boolean eatBestFood() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;

        int bestSlot = -1;
        int bestNutrition = 0;

        // Search inventory for the best food
        for (int i = 0; i < 36; i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (stack.isEmpty()) continue;

            FoodProperties food = stack.get(DataComponents.FOOD);
            if (food != null && food.nutrition() > bestNutrition) {
                bestNutrition = food.nutrition();
                bestSlot = i;
            }
        }

        if (bestSlot == -1) {
            LOGGER.warn("No food found in inventory");
            return false;
        }

        LOGGER.info("Eating food from slot {} (nutrition: {})", bestSlot, bestNutrition);

        // Save current slot
        previousSlot = player.getInventory().getSelectedSlot();

        // Move food to hotbar if needed
        if (bestSlot < 9) {
            // Already in hotbar, just select it
            player.getInventory().setSelectedSlot(bestSlot);
        } else {
            // Swap with current hotbar slot
            Minecraft mc = Minecraft.getInstance();
            if (mc.gameMode != null) {
                mc.gameMode.handleInventoryMouseClick(
                        player.containerMenu.containerId,
                        bestSlot,
                        player.getInventory().getSelectedSlot(),
                        net.minecraft.world.inventory.ClickType.SWAP,
                        player
                );
            }
        }

        // Start eating by holding right-click
        Minecraft.getInstance().options.keyUse.setDown(true);
        isEating = true;
        eatingTimeout = MAX_EATING_TICKS;
        eatingStartupDelay = EATING_STARTUP_GRACE;

        return true;
    }

    /**
     * Called every tick while eating to check for completion.
     */
    public void tick() {
        if (!isEating) return;

        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) {
            stopEating();
            return;
        }

        eatingTimeout--;

        // Grace period: the eat animation takes a couple ticks to start.
        // Don't check isUsingItem() yet — it will be false and we'd stop prematurely.
        if (eatingStartupDelay > 0) {
            eatingStartupDelay--;
            // Keep holding right-click
            Minecraft.getInstance().options.keyUse.setDown(true);
            return;
        }

        // Timeout — eating took too long
        if (eatingTimeout <= 0) {
            LOGGER.info("Eating timed out");
            stopEating();
            return;
        }

        // Player finished eating (item use completed naturally)
        if (!player.isUsingItem()) {
            LOGGER.info("Eating finished");
            stopEating();
        }
    }

    private void stopEating() {
        Minecraft.getInstance().options.keyUse.setDown(false);

        // Restore previous hotbar slot
        LocalPlayer player = Minecraft.getInstance().player;
        if (player != null && previousSlot >= 0 && previousSlot < 9) {
            player.getInventory().setSelectedSlot(previousSlot);
        }

        isEating = false;
        previousSlot = -1;
        eatingTimeout = 0;
        eatingStartupDelay = 0;
    }

    public boolean isEating() {
        return isEating;
    }
}
