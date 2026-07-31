package com.bresenham.bot.task.impl;

import com.bresenham.bot.controller.BotController;
import com.bresenham.bot.executor.ActionResult;
import com.bresenham.bot.task.AbstractStep;
import net.minecraft.item.Item;

/**
 * Step that crafts a specified item.
 * In a full implementation, this would handle opening crafting tables,
 * placing items in the crafting grid, and retrieving the result.
 */
public class CraftItemStep extends AbstractStep {

    private final Item targetItem;
    private final int count;
    private int craftingTicks = 0;
    private static final int CRAFTING_DURATION = 20; // 1 second

    public CraftItemStep(Item targetItem, int count) {
        super("craft_" + targetItem.toString());
        this.targetItem = targetItem;
        this.count = count;
    }

    @Override
    public void run(BotController controller) {
        ActionResult result = controller.getActionExecutor().craftItem(targetItem, count);
        craftingTicks++;

        if (result == ActionResult.SUCCESS || craftingTicks >= CRAFTING_DURATION) {
            markComplete();
        }
    }

    @Override
    public void reset() {
        super.reset();
        craftingTicks = 0;
    }

    public Item getTargetItem() {
        return targetItem;
    }
}
