package com.bresenham.bot.reactive.rules;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.reactive.ReactiveRule;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.AbstractTask;
import com.bresenham.bot.task.Task;
import com.bresenham.bot.task.TaskPriority;
import com.bresenham.bot.task.AbstractStep;
import com.bresenham.bot.controller.BotController;
import net.minecraft.item.ItemStack;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.Hand;

/**
 * Triggers when the bot's health drops below a threshold.
 * Creates a task to find and eat food.
 */
public class LowHealthRule implements ReactiveRule {

    private static final float HEALTH_THRESHOLD = 6.0f; // 3 hearts

    @Override
    public boolean shouldTrigger(WorldState state) {
        return state.getHealth() > 0 && state.getHealth() < HEALTH_THRESHOLD
                && state.getInventoryTracker().hasFood();
    }

    @Override
    public Task createResponseTask() {
        return new EatFoodTask();
    }

    @Override
    public TaskPriority getPriority() {
        return TaskPriority.CRITICAL;
    }

    @Override
    public String getName() {
        return "low_health";
    }

    @Override
    public int getCooldownTicks() {
        return 200; // 10 seconds
    }

    /**
     * Simple task that makes the bot eat food.
     */
    private static class EatFoodTask extends AbstractTask {

        EatFoodTask() {
            super("eat_food", TaskPriority.CRITICAL);
            addStep(new EatStep());
        }

        private static class EatStep extends AbstractStep {
            private int ticksEating = 0;
            private boolean started = false;

            EatStep() {
                super("eat_food_step");
            }

            @Override
            public void run(BotController controller) {
                ServerPlayerEntity player = controller.getWorldState().getPlayer();
                if (player == null) {
                    markFailed();
                    return;
                }

                if (!started) {
                    // Find food in inventory and switch to it
                    int foodSlot = controller.getWorldState().getInventoryTracker().findFoodSlot();
                    if (foodSlot < 0) {
                        BresenhamMod.LOGGER.warn("[Bresenham] No food found in inventory for eating.");
                        markFailed();
                        return;
                    }

                    // Move food to main hand hotbar slot
                    if (foodSlot < 9) {
                        player.getInventory().selectedSlot = foodSlot;
                    } else {
                        // Swap with current hotbar slot
                        ItemStack hotbarStack = player.getInventory().getStack(player.getInventory().selectedSlot);
                        ItemStack foodStack = player.getInventory().getStack(foodSlot);
                        player.getInventory().setStack(player.getInventory().selectedSlot, foodStack);
                        player.getInventory().setStack(foodSlot, hotbarStack);
                    }

                    started = true;
                    BresenhamMod.LOGGER.debug("[Bresenham] Starting to eat food.");
                }

                ticksEating++;
                if (ticksEating >= 40) { // ~2 seconds eating time
                    markComplete();
                }
            }

            @Override
            public void reset() {
                super.reset();
                ticksEating = 0;
                started = false;
            }
        }
    }
}
