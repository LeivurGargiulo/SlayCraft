package com.bresenham.bot.task;

import com.bresenham.bot.state.WorldState;

/**
 * Base implementation of Step with common state tracking.
 */
public abstract class AbstractStep implements Step {

    private final String name;
    protected boolean completed = false;
    protected boolean failed = false;

    protected AbstractStep(String name) {
        this.name = name;
    }

    @Override
    public boolean isComplete() {
        return completed || failed;
    }

    @Override
    public boolean isFailed() {
        return failed;
    }

    @Override
    public boolean canExecute(WorldState state) {
        return true;
    }

    @Override
    public String getName() {
        return name;
    }

    @Override
    public void reset() {
        completed = false;
        failed = false;
    }

    protected void markComplete() {
        completed = true;
    }

    protected void markFailed() {
        failed = true;
    }
}
