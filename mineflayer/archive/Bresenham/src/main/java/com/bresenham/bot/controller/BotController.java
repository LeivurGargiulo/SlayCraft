package com.bresenham.bot.controller;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.ai.AdvisorIntegration;
import com.bresenham.bot.executor.ActionExecutor;
import com.bresenham.bot.reactive.ReactiveSystem;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.TaskManager;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * Central tick-based orchestrator for the bot.
 * Coordinates all subsystems in the correct priority order each tick:
 * 1. Update WorldState
 * 2. AI Advisory tick (async, non-blocking)
 * 3. ReactiveSystem (highest priority — safety overrides)
 * 4. TaskManager (execute current task)
 */
public class BotController {

    private final WorldState worldState;
    private final TaskManager taskManager;
    private final ReactiveSystem reactiveSystem;
    private final ActionExecutor actionExecutor;
    private final AdvisorIntegration advisorIntegration;

    private ServerPlayerEntity player;
    private boolean running = false;

    public BotController(WorldState worldState, TaskManager taskManager,
                         ReactiveSystem reactiveSystem, ActionExecutor actionExecutor,
                         AdvisorIntegration advisorIntegration) {
        this.worldState = worldState;
        this.taskManager = taskManager;
        this.reactiveSystem = reactiveSystem;
        this.actionExecutor = actionExecutor;
        this.advisorIntegration = advisorIntegration;
    }

    /**
     * Called every server tick when the bot is running.
     * Executes subsystems in priority order.
     */
    public void tick() {
        if (!running || player == null) return;

        // 1. Update world state from player entity
        worldState.update(player);

        // 2. AI advisory tick (non-blocking async checks)
        if (advisorIntegration != null) {
            advisorIntegration.tick(worldState, taskManager);
        }

        // 3. Reactive system — checked FIRST, can interrupt tasks
        reactiveSystem.check(worldState, taskManager);

        // 4. Task manager — execute current task
        taskManager.tick(this);
    }

    /**
     * Set the player entity this bot controls.
     * Propagates to the action executor so it can act on behalf of this player.
     */
    public void setPlayer(ServerPlayerEntity player) {
        this.player = player;
        if (actionExecutor != null) {
            actionExecutor.setPlayer(player);
        }
    }

    public ServerPlayerEntity getPlayer() {
        return player;
    }

    public boolean isRunning() {
        return running;
    }

    public void setRunning(boolean running) {
        this.running = running;
        if (!running) {
            actionExecutor.stop();
        }
        BresenhamMod.LOGGER.info("[Bresenham] Bot controller {}", running ? "started" : "stopped");
    }

    public WorldState getWorldState() {
        return worldState;
    }

    public TaskManager getTaskManager() {
        return taskManager;
    }

    public ReactiveSystem getReactiveSystem() {
        return reactiveSystem;
    }

    public ActionExecutor getActionExecutor() {
        return actionExecutor;
    }
}
