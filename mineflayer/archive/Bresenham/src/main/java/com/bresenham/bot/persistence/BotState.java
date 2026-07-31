package com.bresenham.bot.persistence;

import com.bresenham.bot.task.TaskState;

/**
 * Serializable snapshot of the bot's current state.
 * Used for save/load across server restarts.
 */
public class BotState {

    private String currentTaskName;
    private int currentStepIndex;
    private TaskState taskState;
    private boolean botRunning;

    // Position snapshot
    private double posX;
    private double posY;
    private double posZ;

    // Health snapshot
    private float health;
    private int hunger;

    public BotState() {}

    // Getters and setters

    public String getCurrentTaskName() {
        return currentTaskName;
    }

    public void setCurrentTaskName(String currentTaskName) {
        this.currentTaskName = currentTaskName;
    }

    public int getCurrentStepIndex() {
        return currentStepIndex;
    }

    public void setCurrentStepIndex(int currentStepIndex) {
        this.currentStepIndex = currentStepIndex;
    }

    public TaskState getTaskState() {
        return taskState;
    }

    public void setTaskState(TaskState taskState) {
        this.taskState = taskState;
    }

    public boolean isBotRunning() {
        return botRunning;
    }

    public void setBotRunning(boolean botRunning) {
        this.botRunning = botRunning;
    }

    public double getPosX() {
        return posX;
    }

    public void setPosX(double posX) {
        this.posX = posX;
    }

    public double getPosY() {
        return posY;
    }

    public void setPosY(double posY) {
        this.posY = posY;
    }

    public double getPosZ() {
        return posZ;
    }

    public void setPosZ(double posZ) {
        this.posZ = posZ;
    }

    public float getHealth() {
        return health;
    }

    public void setHealth(float health) {
        this.health = health;
    }

    public int getHunger() {
        return hunger;
    }

    public void setHunger(int hunger) {
        this.hunger = hunger;
    }
}
