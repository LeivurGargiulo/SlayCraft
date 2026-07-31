package com.bresenham.bot.reactive;

import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;
import com.bresenham.bot.task.TaskPriority;

/**
 * Defines a reactive behavior that triggers based on world state conditions.
 * When triggered, creates a response task that interrupts normal execution.
 */
public interface ReactiveRule {

    /**
     * @return true if this rule's conditions are met
     */
    boolean shouldTrigger(WorldState state);

    /**
     * @return the task to execute in response to the trigger
     */
    Task createResponseTask();

    /**
     * @return priority of the response task (determines if it can interrupt current task)
     */
    TaskPriority getPriority();

    /**
     * @return human-readable name of this rule
     */
    String getName();

    /**
     * @return cooldown in ticks before this rule can trigger again (prevents spam)
     */
    default int getCooldownTicks() {
        return 100; // 5 seconds default
    }
}
