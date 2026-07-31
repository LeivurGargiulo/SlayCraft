package com.bresenham.bot.task.impl;

import com.bresenham.bot.task.AbstractTask;
import com.bresenham.bot.task.TaskPriority;
import net.minecraft.item.Items;

/**
 * Task to craft a stone pickaxe.
 * Steps:
 * 1. Craft planks from wood (if needed)
 * 2. Craft sticks from planks
 * 3. Craft stone pickaxe from sticks + cobblestone
 *
 * This task is automatically injected by the planner when a task
 * requires a pickaxe and none exists in inventory.
 */
public class CraftPickaxeTask extends AbstractTask {

    public CraftPickaxeTask() {
        super("craft_pickaxe", TaskPriority.HIGH);

        // Step 1: Ensure we have planks
        addStep(new CraftItemStep(Items.OAK_PLANKS, 2));

        // Step 2: Craft sticks from planks
        addStep(new CraftItemStep(Items.STICK, 2));

        // Step 3: Craft stone pickaxe
        addStep(new CraftItemStep(Items.STONE_PICKAXE, 1));
    }
}
