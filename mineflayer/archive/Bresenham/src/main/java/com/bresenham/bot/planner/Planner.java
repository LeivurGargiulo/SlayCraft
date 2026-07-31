package com.bresenham.bot.planner;

import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;

import java.util.List;

/**
 * Validates task preconditions and resolves dependencies.
 * Returns an ordered list of tasks to execute (prerequisites first).
 */
public interface Planner {

    /**
     * Analyze a task and return all tasks needed to complete it,
     * including any prerequisite tasks that must execute first.
     *
     * @param task the goal task to plan for
     * @param state current world state for precondition checks
     * @return ordered list of tasks (prerequisites first, original task last)
     */
    List<Task> plan(Task task, WorldState state);
}
