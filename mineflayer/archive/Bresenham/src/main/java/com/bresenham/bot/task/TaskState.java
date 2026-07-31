package com.bresenham.bot.task;

/**
 * Represents the lifecycle state of a Task.
 */
public enum TaskState {
    PENDING,
    RUNNING,
    PAUSED,
    COMPLETED,
    FAILED
}
