package com.bresenham.bot.planner.rules;

import com.bresenham.bot.planner.PlannerRule;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;
import com.bresenham.bot.task.impl.CraftPickaxeTask;

import java.util.ArrayList;
import java.util.List;

/**
 * Checks if a task requires a tool and injects crafting tasks if the tool is missing.
 * Tasks indicate tool requirements via metadata: "requires_tool" -> "pickaxe"
 */
public class ToolRequirementRule implements PlannerRule {

    @Override
    public boolean appliesTo(Task task) {
        return task.getMetadata().containsKey("requires_tool");
    }

    @Override
    public List<Task> getPrerequisites(Task task, WorldState state) {
        List<Task> prerequisites = new ArrayList<>();
        String requiredTool = task.getMetadata().get("requires_tool");

        if (requiredTool == null) return prerequisites;

        switch (requiredTool) {
            case "pickaxe":
                if (!state.getInventoryTracker().hasPickaxe()) {
                    prerequisites.add(new CraftPickaxeTask());
                }
                break;
            case "sword":
                if (!state.getInventoryTracker().hasSword()) {
                    // Future: add CraftSwordTask
                }
                break;
            default:
                break;
        }

        return prerequisites;
    }
}
