package com.baritoneai.ai;

public enum TaskState {
    IDLE,
    EXECUTING,
    INTERRUPTED,
    COMPLETED,
    FAILED;

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED;
    }

    public boolean isActive() {
        return this == EXECUTING || this == INTERRUPTED;
    }
}
