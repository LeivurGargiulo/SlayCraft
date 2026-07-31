package com.bresenham.bot.api;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.controller.BotController;
import com.bresenham.bot.planner.Planner;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.Task;
import com.bresenham.bot.task.TaskManager;
import net.minecraft.server.network.ServerPlayerEntity;

import java.util.List;

/**
 * Implementation of BotApi that bridges external inputs to internal systems.
 * All commands and future REST endpoints use this implementation.
 */
public class BotApiImpl implements BotApi {

    private final BotController controller;
    private final TaskManager taskManager;
    private final TaskFactory taskFactory;
    private final Planner planner;
    private final WorldState worldState;

    public BotApiImpl(BotController controller, TaskManager taskManager,
                      TaskFactory taskFactory, Planner planner, WorldState worldState) {
        this.controller = controller;
        this.taskManager = taskManager;
        this.taskFactory = taskFactory;
        this.planner = planner;
        this.worldState = worldState;
    }

    @Override
    public void startTask(String taskName) {
        Task task = taskFactory.createTask(taskName);

        // Run through planner to resolve dependencies
        List<Task> plannedTasks = planner.plan(task, worldState);

        BresenhamMod.LOGGER.info("[Bresenham] Planned {} task(s) for '{}'.", plannedTasks.size(), taskName);

        // Push tasks in order (prerequisites first)
        // Since TaskManager is a stack, we push in reverse so first prerequisite runs first
        for (int i = plannedTasks.size() - 1; i >= 0; i--) {
            taskManager.pushTask(plannedTasks.get(i));
        }
    }

    @Override
    public void stopCurrentTask() {
        taskManager.stopCurrentTask();
    }

    @Override
    public void startBot() {
        controller.setRunning(true);
        BresenhamMod.LOGGER.info("[Bresenham] Bot started.");
    }

    @Override
    public void startBot(ServerPlayerEntity player) {
        controller.setPlayer(player);
        controller.setRunning(true);
        BresenhamMod.LOGGER.info("[Bresenham] Bot started for player: {}", player.getName().getString());
    }

    @Override
    public void stopBot() {
        controller.setRunning(false);
        taskManager.clearAll();
        BresenhamMod.LOGGER.info("[Bresenham] Bot stopped.");
    }

    @Override
    public void pauseCurrentTask() {
        taskManager.pauseCurrentTask();
    }

    @Override
    public void resumeCurrentTask() {
        taskManager.resumeCurrentTask();
    }

    @Override
    public String getStatus() {
        StringBuilder sb = new StringBuilder();
        sb.append("Bot: ").append(controller.isRunning() ? "RUNNING" : "STOPPED");

        Task current = taskManager.getCurrentTask();
        if (current != null) {
            sb.append(" | Task: ").append(current.getName());
            sb.append(" [").append(current.getState()).append("]");
            sb.append(" Step: ").append(current.getCurrentStepIndex() + 1)
              .append("/").append(current.getSteps().size());
        } else {
            sb.append(" | No active task");
        }

        sb.append(" | Tasks in queue: ").append(taskManager.getTaskCount());
        sb.append(" | Health: ").append(String.format("%.1f", worldState.getHealth()));

        return sb.toString();
    }

    @Override
    public List<String> getAvailableTaskNames() {
        return taskFactory.getAvailableTaskNames();
    }

    @Override
    public boolean isRunning() {
        return controller.isRunning();
    }
}
