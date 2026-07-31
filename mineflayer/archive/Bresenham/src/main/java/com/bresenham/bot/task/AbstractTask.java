package com.bresenham.bot.task;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.controller.BotController;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Base Task implementation managing step progression and lifecycle.
 */
public abstract class AbstractTask implements Task {

    private final String name;
    private final TaskPriority priority;
    private final List<Step> steps;
    private final Map<String, String> metadata;
    private TaskState state;
    private int currentStepIndex;

    protected AbstractTask(String name, TaskPriority priority) {
        this.name = name;
        this.priority = priority;
        this.steps = new ArrayList<>();
        this.metadata = new HashMap<>();
        this.state = TaskState.PENDING;
        this.currentStepIndex = 0;
    }

    /**
     * Subclasses must call this to define their steps.
     */
    protected void addStep(Step step) {
        steps.add(step);
    }

    /**
     * Add metadata for the planner to inspect.
     */
    protected void setMetadata(String key, String value) {
        metadata.put(key, value);
    }

    @Override
    public void tick(BotController controller) {
        if (state != TaskState.RUNNING) return;
        if (currentStepIndex >= steps.size()) {
            state = TaskState.COMPLETED;
            BresenhamMod.LOGGER.info("[Bresenham] Task '{}' completed.", name);
            return;
        }

        Step currentStep = steps.get(currentStepIndex);

        // Check if current step can execute
        if (!currentStep.canExecute(controller.getWorldState())) {
            BresenhamMod.LOGGER.warn("[Bresenham] Step '{}' cannot execute (preconditions not met).", currentStep.getName());
            state = TaskState.FAILED;
            return;
        }

        // Run the step
        currentStep.run(controller);

        // Check if step failed
        if (currentStep.isFailed()) {
            BresenhamMod.LOGGER.warn("[Bresenham] Step '{}' failed. Task '{}' marked as FAILED.", currentStep.getName(), name);
            state = TaskState.FAILED;
            return;
        }

        // Advance to next step if complete
        if (currentStep.isComplete()) {
            BresenhamMod.LOGGER.debug("[Bresenham] Step '{}' completed. Advancing to next step.", currentStep.getName());
            currentStepIndex++;
            if (currentStepIndex >= steps.size()) {
                state = TaskState.COMPLETED;
                BresenhamMod.LOGGER.info("[Bresenham] Task '{}' completed all steps.", name);
            }
        }
    }

    @Override
    public void pause() {
        if (state == TaskState.RUNNING) {
            state = TaskState.PAUSED;
            BresenhamMod.LOGGER.info("[Bresenham] Task '{}' paused at step {}.", name, currentStepIndex);
        }
    }

    @Override
    public void resume() {
        if (state == TaskState.PAUSED) {
            state = TaskState.RUNNING;
            BresenhamMod.LOGGER.info("[Bresenham] Task '{}' resumed at step {}.", name, currentStepIndex);
        }
    }

    @Override
    public List<Step> getSteps() {
        return steps;
    }

    @Override
    public int getCurrentStepIndex() {
        return currentStepIndex;
    }

    @Override
    public TaskPriority getPriority() {
        return priority;
    }

    @Override
    public TaskState getState() {
        return state;
    }

    @Override
    public void setState(TaskState state) {
        this.state = state;
    }

    @Override
    public String getName() {
        return name;
    }

    @Override
    public Map<String, String> getMetadata() {
        return metadata;
    }

    /**
     * Set the current step index (used for persistence/restoration).
     */
    public void setCurrentStepIndex(int index) {
        this.currentStepIndex = Math.min(index, steps.size());
    }
}
