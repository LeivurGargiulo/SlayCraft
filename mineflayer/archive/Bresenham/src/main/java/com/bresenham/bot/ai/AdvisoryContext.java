package com.bresenham.bot.ai;

import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;
import com.bresenham.bot.task.TaskManager;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.BlockPos;

import java.util.List;

/**
 * Converts WorldState and task information into a concise text summary
 * for inclusion in Gemini AI prompts. Keeps token usage efficient.
 */
public class AdvisoryContext {

    /**
     * Build a context summary from the current world state and task manager.
     */
    public static String buildContext(WorldState state, TaskManager taskManager) {
        StringBuilder sb = new StringBuilder();

        // Player stats
        sb.append("Health: ").append(String.format("%.1f/20.0", state.getHealth()));
        sb.append(" | Hunger: ").append(state.getHunger()).append("/20");

        BlockPos pos = state.getPosition();
        if (pos != null) {
            sb.append(" | Position: ").append(pos.getX()).append(", ")
              .append(pos.getY()).append(", ").append(pos.getZ());
        }
        sb.append("\n");

        // Inventory highlights
        sb.append("Has pickaxe: ").append(state.getInventoryTracker().hasPickaxe());
        sb.append(" | Has sword: ").append(state.getInventoryTracker().hasSword());
        sb.append(" | Has food: ").append(state.getInventoryTracker().hasFood());
        sb.append("\n");

        // Nearby threats
        List<Entity> hostiles = state.getNearbyHostiles(16.0);
        if (!hostiles.isEmpty()) {
            sb.append("Nearby hostiles: ").append(hostiles.size());
            Entity nearest = state.getEntityTracker().getNearestHostile();
            if (nearest != null) {
                sb.append(" (nearest: ").append(nearest.getType().getName().getString())
                  .append(" at ").append(String.format("%.1f", nearest.distanceTo(state.getPlayer())))
                  .append(" blocks)");
            }
            sb.append("\n");
        }

        // Current task
        Task current = taskManager.getCurrentTask();
        if (current != null) {
            sb.append("Current task: ").append(current.getName())
              .append(" [").append(current.getState()).append("]")
              .append(" Step ").append(current.getCurrentStepIndex() + 1)
              .append("/").append(current.getSteps().size());
            sb.append("\n");
        } else {
            sb.append("Current task: none (idle)\n");
        }

        sb.append("Tasks queued: ").append(taskManager.getTaskCount());

        return sb.toString();
    }
}
