package com.bresenham.bot.task;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.controller.BotController;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Priority-based task stack manager.
 * Uses a stack (not queue) to support natural interruption and resumption.
 * When a higher-priority task arrives, the current task is paused and pushed down.
 */
public class TaskManager {

    private final Deque<Task> taskStack = new ArrayDeque<>();

    /**
     * Push a task onto the stack and set it to RUNNING.
     * Does not automatically pause the current task — use interruptWith() for that.
     */
    public void pushTask(Task task) {
        task.setState(TaskState.RUNNING);
        taskStack.push(task);
        BresenhamMod.LOGGER.info("[Bresenham] Task '{}' pushed (priority: {}).", task.getName(), task.getPriority());
    }

    /**
     * Interrupt the current task with a higher-priority task.
     * The current task is paused and the new task takes over.
     * If the new task has lower priority, it is not pushed.
     */
    public void interruptWith(Task newTask) {
        Task current = taskStack.peek();
        if (current != null && current.getState() == TaskState.RUNNING) {
            if (newTask.getPriority().isHigherThan(current.getPriority())
                    || newTask.getPriority() == current.getPriority()) {
                current.pause();
                BresenhamMod.LOGGER.info("[Bresenham] Interrupting '{}' with '{}'.",
                        current.getName(), newTask.getName());
                pushTask(newTask);
            } else {
                BresenhamMod.LOGGER.debug("[Bresenham] Task '{}' (priority: {}) cannot interrupt '{}' (priority: {}).",
                        newTask.getName(), newTask.getPriority(), current.getName(), current.getPriority());
            }
        } else {
            // No running task, just push
            pushTask(newTask);
        }
    }

    /**
     * Tick the current task. If it completes or fails, pop it and resume the previous.
     */
    public void tick(BotController controller) {
        // Clean up completed/failed tasks from top of stack
        while (!taskStack.isEmpty()) {
            Task current = taskStack.peek();
            if (current.getState() == TaskState.COMPLETED || current.getState() == TaskState.FAILED) {
                taskStack.pop();
                BresenhamMod.LOGGER.info("[Bresenham] Task '{}' removed (state: {}).",
                        current.getName(), current.getState());
                // Resume the next task on the stack
                Task next = taskStack.peek();
                if (next != null && next.getState() == TaskState.PAUSED) {
                    next.resume();
                }
            } else {
                break;
            }
        }

        // Tick the current task
        Task current = taskStack.peek();
        if (current != null && current.getState() == TaskState.RUNNING) {
            current.tick(controller);
        }
    }

    /**
     * @return the currently active task, or null if none
     */
    public Task getCurrentTask() {
        return taskStack.peek();
    }

    /**
     * Stop and remove the current task.
     */
    public void stopCurrentTask() {
        Task current = taskStack.poll();
        if (current != null) {
            current.setState(TaskState.FAILED);
            BresenhamMod.LOGGER.info("[Bresenham] Task '{}' stopped.", current.getName());

            // Resume next task if paused
            Task next = taskStack.peek();
            if (next != null && next.getState() == TaskState.PAUSED) {
                next.resume();
            }
        }
    }

    /**
     * Pause the current task without removing it.
     */
    public void pauseCurrentTask() {
        Task current = taskStack.peek();
        if (current != null && current.getState() == TaskState.RUNNING) {
            current.pause();
        }
    }

    /**
     * Resume the current task if it was paused.
     */
    public void resumeCurrentTask() {
        Task current = taskStack.peek();
        if (current != null && current.getState() == TaskState.PAUSED) {
            current.resume();
        }
    }

    /**
     * Clear all tasks.
     */
    public void clearAll() {
        taskStack.clear();
    }

    /**
     * @return true if there are any tasks in the stack
     */
    public boolean hasTasks() {
        return !taskStack.isEmpty();
    }

    /**
     * @return number of tasks in the stack
     */
    public int getTaskCount() {
        return taskStack.size();
    }
}
