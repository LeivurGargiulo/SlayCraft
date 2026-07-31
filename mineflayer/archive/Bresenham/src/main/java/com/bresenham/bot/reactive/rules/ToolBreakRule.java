package com.bresenham.bot.reactive.rules;

import com.bresenham.bot.reactive.ReactiveRule;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;
import com.bresenham.bot.task.TaskPriority;
import com.bresenham.bot.task.impl.CraftPickaxeTask;
import net.minecraft.item.ItemStack;
import net.minecraft.item.PickaxeItem;

/**
 * Triggers when the equipped tool is about to break (durability <= 2).
 * Interrupts with a craft replacement task.
 */
public class ToolBreakRule implements ReactiveRule {

    private static final int LOW_DURABILITY_THRESHOLD = 2;

    @Override
    public boolean shouldTrigger(WorldState state) {
        ItemStack equipped = state.getEquippedTool();
        if (equipped == null || equipped.isEmpty()) return false;

        // Only trigger for tools with durability
        if (equipped.getMaxDamage() == 0) return false;

        int remaining = equipped.getMaxDamage() - equipped.getDamage();
        return remaining <= LOW_DURABILITY_THRESHOLD && equipped.getItem() instanceof PickaxeItem;
    }

    @Override
    public Task createResponseTask() {
        return new CraftPickaxeTask();
    }

    @Override
    public TaskPriority getPriority() {
        return TaskPriority.HIGH;
    }

    @Override
    public String getName() {
        return "tool_break";
    }

    @Override
    public int getCooldownTicks() {
        return 200; // 10 seconds - avoid spamming craft tasks
    }
}
