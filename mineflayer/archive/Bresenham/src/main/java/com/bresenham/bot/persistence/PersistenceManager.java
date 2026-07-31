package com.bresenham.bot.persistence;

/**
 * Interface for saving and loading bot state.
 * Implementations can use JSON, NBT, or other formats.
 */
public interface PersistenceManager {

    /**
     * Save the current bot state.
     */
    void save(BotState state);

    /**
     * Load the last saved bot state.
     * @return the loaded state, or null if no saved state exists
     */
    BotState load();

    /**
     * Delete any saved state.
     */
    void delete();

    /**
     * @return true if a saved state exists
     */
    boolean hasSavedState();
}
