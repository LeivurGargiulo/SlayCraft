package com.bresenham.bot.api;

import net.minecraft.server.network.ServerPlayerEntity;

import java.util.List;

/**
 * Internal API interface for controlling the bot.
 * All commands and future REST endpoints route through this interface.
 * This decoupling enables web API integration without changing core logic.
 */
public interface BotApi {

    /**
     * Start a named task (resolved via TaskFactory, planned via Planner).
     */
    void startTask(String taskName);

    /**
     * Stop the currently executing task.
     */
    void stopCurrentTask();

    /**
     * Start the bot controller (begins tick processing).
     */
    void startBot();

    /**
     * Start the bot controller and assign it to the given player.
     */
    void startBot(ServerPlayerEntity player);

    /**
     * Stop the bot controller entirely.
     */
    void stopBot();

    /**
     * Pause the current task without stopping the bot.
     */
    void pauseCurrentTask();

    /**
     * Resume a paused task.
     */
    void resumeCurrentTask();

    /**
     * @return human-readable status string describing bot state
     */
    String getStatus();

    /**
     * @return list of available task names from the TaskFactory
     */
    List<String> getAvailableTaskNames();

    /**
     * @return true if the bot controller is currently running
     */
    boolean isRunning();
}
