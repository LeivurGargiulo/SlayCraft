package com.bresenham.bot.persistence;

import com.bresenham.bot.BresenhamMod;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * JSON-based persistence manager.
 * Saves and loads BotState to/from a JSON file in the world directory.
 */
public class JsonPersistenceManager implements PersistenceManager {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private final Path saveFile;

    /**
     * @param worldDir the world save directory (e.g., world/)
     */
    public JsonPersistenceManager(Path worldDir) {
        this.saveFile = worldDir.resolve("bresenham").resolve("bot_state.json");
    }

    @Override
    public void save(BotState state) {
        try {
            Files.createDirectories(saveFile.getParent());
            String json = GSON.toJson(state);
            Files.writeString(saveFile, json);
            BresenhamMod.LOGGER.debug("[Bresenham] Bot state saved to {}", saveFile);
        } catch (IOException e) {
            BresenhamMod.LOGGER.error("[Bresenham] Failed to save bot state.", e);
        }
    }

    @Override
    public BotState load() {
        if (!Files.exists(saveFile)) return null;

        try {
            String json = Files.readString(saveFile);
            BotState state = GSON.fromJson(json, BotState.class);
            BresenhamMod.LOGGER.info("[Bresenham] Bot state loaded from {}", saveFile);
            return state;
        } catch (IOException e) {
            BresenhamMod.LOGGER.error("[Bresenham] Failed to load bot state.", e);
            return null;
        }
    }

    @Override
    public void delete() {
        try {
            Files.deleteIfExists(saveFile);
            BresenhamMod.LOGGER.info("[Bresenham] Bot state deleted.");
        } catch (IOException e) {
            BresenhamMod.LOGGER.error("[Bresenham] Failed to delete bot state.", e);
        }
    }

    @Override
    public boolean hasSavedState() {
        return Files.exists(saveFile);
    }
}
