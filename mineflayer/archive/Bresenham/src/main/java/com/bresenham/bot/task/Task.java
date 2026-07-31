package com.bresenham.bot.task;

import com.bresenham.bot.controller.BotController;

import java.util.List;
import java.util.Map;

/**
 * High-level goal composed of sequential Steps.
 * Tasks are managed by the TaskManager and can be paused, resumed, and interrupted.
 */
public interface Task {

    /**
     * @return ordered list of steps to execute
     */
    List<Step> getSteps();

    /**
     * @return index of the currently executing step
     */
    int getCurrentStepIndex();

    /**
     * @return priority level of this task
     */
    TaskPriority getPriority();

    /**
     * @return current lifecycle state
     */
    TaskState getState();

    /**
     * Set the task's lifecycle state.
     */
    void setState(TaskState state);

    /**
     * Pause this task, preserving current progress.
     */
    void pause();

    /**
     * Resume this task from where it was paused.
     */
    void resume();

    /**
     * Execute one tick of the current step.
     */
    void tick(BotController controller);

    /**
     * @return human-readable name of this task
     */
    String getName();

    /**
     * @return metadata about this task's requirements (e.g., "requires_tool" -> "pickaxe")
     * Used by the Planner to determine prerequisites.
     */
    Map<String, String> getMetadata();
}
