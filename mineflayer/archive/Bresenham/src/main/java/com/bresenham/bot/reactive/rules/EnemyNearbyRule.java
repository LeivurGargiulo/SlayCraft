package com.bresenham.bot.reactive.rules;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.controller.BotController;
import com.bresenham.bot.reactive.ReactiveRule;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.AbstractStep;
import com.bresenham.bot.task.AbstractTask;
import com.bresenham.bot.task.Task;
import com.bresenham.bot.task.TaskPriority;
import net.minecraft.entity.Entity;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;

/**
 * Triggers when a hostile entity is within close range.
 * Creates a flee/defend task to handle the threat.
 */
public class EnemyNearbyRule implements ReactiveRule {

    private static final double DANGER_RADIUS = 8.0;

    @Override
    public boolean shouldTrigger(WorldState state) {
        Entity nearest = state.getEntityTracker().getNearestHostileInRange(DANGER_RADIUS);
        return nearest != null;
    }

    @Override
    public Task createResponseTask() {
        return new FleeTask();
    }

    @Override
    public TaskPriority getPriority() {
        return TaskPriority.CRITICAL;
    }

    @Override
    public String getName() {
        return "enemy_nearby";
    }

    @Override
    public int getCooldownTicks() {
        return 100; // 5 seconds
    }

    /**
     * Simple flee task - moves the bot away from danger.
     * In a full implementation, this would calculate a safe direction and use ActionExecutor.
     */
    private static class FleeTask extends AbstractTask {

        FleeTask() {
            super("flee_enemy", TaskPriority.CRITICAL);
            addStep(new FleeStep());
        }

        private static class FleeStep extends AbstractStep {
            private int ticksFleeing = 0;
            private BlockPos fleeTarget;

            FleeStep() {
                super("flee_step");
            }

            @Override
            public void run(BotController controller) {
                ServerPlayerEntity player = controller.getWorldState().getPlayer();
                if (player == null) {
                    markFailed();
                    return;
                }

                // Calculate flee direction on first tick
                if (fleeTarget == null) {
                    Entity nearest = controller.getWorldState().getEntityTracker().getNearestHostile();
                    if (nearest != null) {
                        // Calculate direction away from the hostile
                        Vec3d playerPos = player.getPos();
                        Vec3d hostilePos = nearest.getPos();
                        Vec3d away = playerPos.subtract(hostilePos).normalize().multiply(16);
                        fleeTarget = BlockPos.ofFloored(playerPos.add(away));
                        BresenhamMod.LOGGER.debug("[Bresenham] Fleeing towards {}", fleeTarget);
                    } else {
                        // No hostile found, just complete
                        markComplete();
                        return;
                    }
                }

                controller.getActionExecutor().moveTo(fleeTarget);
                ticksFleeing++;
                if (ticksFleeing >= 60) { // 3 seconds of fleeing
                    controller.getActionExecutor().stop();
                    markComplete();
                }
            }

            @Override
            public void reset() {
                super.reset();
                ticksFleeing = 0;
                fleeTarget = null;
            }
        }
    }
}
