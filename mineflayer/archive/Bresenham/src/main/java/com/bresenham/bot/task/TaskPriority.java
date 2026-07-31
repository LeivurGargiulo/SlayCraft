package com.bresenham.bot.task;

/**
 * Priority levels for tasks. Higher value = higher priority.
 * Used by TaskManager to determine interruption behavior.
 */
public enum TaskPriority {
    LOW(0),
    MEDIUM(1),
    HIGH(2),
    CRITICAL(3);

    private final int value;

    TaskPriority(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public boolean isHigherThan(TaskPriority other) {
        return this.value > other.value;
    }
}
