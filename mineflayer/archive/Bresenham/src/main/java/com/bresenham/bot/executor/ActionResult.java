package com.bresenham.bot.executor;

/**
 * Result of an action execution attempt.
 */
public enum ActionResult {
    /** Action completed successfully */
    SUCCESS,
    /** Action failed and cannot continue */
    FAILURE,
    /** Action is still in progress (e.g., pathfinding) */
    IN_PROGRESS
}
