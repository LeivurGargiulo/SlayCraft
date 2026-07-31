package com.bresenham.bot.task.impl;

import com.bresenham.bot.controller.BotController;
import com.bresenham.bot.executor.ActionResult;
import com.bresenham.bot.task.AbstractStep;
import net.minecraft.util.math.BlockPos;

/**
 * Step that navigates the bot to a target position using the ActionExecutor.
 */
public class MoveToStep extends AbstractStep {

    private final BlockPos target;
    private int timeoutTicks;
    private static final int MAX_TIMEOUT = 600; // 30 seconds

    public MoveToStep(BlockPos target) {
        super("move_to_" + target.toShortString());
        this.target = target;
        this.timeoutTicks = 0;
    }

    @Override
    public void run(BotController controller) {
        ActionResult result = controller.getActionExecutor().moveTo(target);

        switch (result) {
            case SUCCESS:
                markComplete();
                break;
            case IN_PROGRESS:
                timeoutTicks++;
                if (timeoutTicks > MAX_TIMEOUT) {
                    markFailed(); // Timeout - signal failure to parent task
                }
                break;
            case FAILURE:
                markFailed(); // Movement failed
                break;
        }
    }

    @Override
    public void reset() {
        super.reset();
        timeoutTicks = 0;
    }

    public BlockPos getTarget() {
        return target;
    }
}
