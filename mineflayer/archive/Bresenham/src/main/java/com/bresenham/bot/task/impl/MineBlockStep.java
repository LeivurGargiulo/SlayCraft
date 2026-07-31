package com.bresenham.bot.task.impl;

import com.bresenham.bot.controller.BotController;
import com.bresenham.bot.executor.ActionResult;
import com.bresenham.bot.task.AbstractStep;
import net.minecraft.util.math.BlockPos;

/**
 * Step that navigates to a block and mines it.
 * Combines movement and block breaking.
 */
public class MineBlockStep extends AbstractStep {

    private final BlockPos target;
    private boolean reachedTarget = false;
    private int miningTicks = 0;
    private static final int MINING_DURATION = 40; // ~2 seconds

    public MineBlockStep(BlockPos target) {
        super("mine_block_" + target.toShortString());
        this.target = target;
    }

    @Override
    public void run(BotController controller) {
        if (!reachedTarget) {
            // First, move to the block
            ActionResult moveResult = controller.getActionExecutor().moveTo(target);
            if (moveResult == ActionResult.SUCCESS) {
                reachedTarget = true;
            } else if (moveResult == ActionResult.FAILURE) {
                markFailed(); // Can't reach block
            }
        } else {
            // Then mine it
            ActionResult mineResult = controller.getActionExecutor().mineBlock(target);
            miningTicks++;

            if (mineResult == ActionResult.SUCCESS || miningTicks >= MINING_DURATION) {
                markComplete();
            }
        }
    }

    @Override
    public void reset() {
        super.reset();
        reachedTarget = false;
        miningTicks = 0;
    }
}
