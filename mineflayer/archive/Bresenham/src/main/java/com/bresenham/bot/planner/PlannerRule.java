package com.bresenham.bot.planner;

import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;

import java.util.List;

/**
 * Extensible rule for the dependency planner.
 * Each rule checks if a task has unmet prerequisites and provides tasks to fulfill them.
 */
public interface PlannerRule {

    /**
     * @return true if this rule is relevant to the given task
     */
    boolean appliesTo(Task task);

    /**
     * @return list of prerequisite tasks needed before the given task can execute,
     *         or empty list if all prerequisites are already met
     */
    List<Task> getPrerequisites(Task task, WorldState state);
}
