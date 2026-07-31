package com.bresenham.bot.task;

import com.bresenham.bot.controller.BotController;
import com.bresenham.bot.state.WorldState;

/**
 * Atomic executable unit within a Task.
 * Each step represents a single action that can be ticked to completion.
 */
public interface Step {

    /**
     * Execute one tick of this step's logic.
     */
    void run(BotController controller);

    /**
     * @return true if this step has finished executing (success or failure)
     */
    boolean isComplete();

    /**
     * @return true if this step failed during execution
     */
    boolean isFailed();

    /**
     * @return true if preconditions are met for this step to execute
     */
    boolean canExecute(WorldState state);

    /**
     * @return human-readable name of this step
     */
    String getName();

    /**
     * Reset this step to its initial state for re-execution.
     */
    void reset();
}
