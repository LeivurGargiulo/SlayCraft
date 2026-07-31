package com.bresenham.bot.api;

import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;

import java.util.List;

/**
 * Provides goals (tasks) for the bot to execute.
 * This is the integration point for AI-driven goal selection.
 * The Gemini AI advisory system implements this interface.
 */
public interface GoalProvider {

    /**
     * Analyze the current world state and suggest tasks for the bot to execute.
     *
     * @param state current world state
     * @return ordered list of suggested tasks (highest priority first)
     */
    List<Task> provideGoals(WorldState state);
}
