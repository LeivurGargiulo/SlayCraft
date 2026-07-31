package com.bresenham.bot.ai;

import com.bresenham.bot.BresenhamMod;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Configuration for the Gemini AI advisory system.
 * Loaded from config/bresenham/gemini.json.
 */
public class GeminiConfig {

    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private String apiKey = "";
    private String modelName = "gemini-2.5-flash";
    private boolean enabled = false;
    private float temperature = 0.7f;
    private int maxTokens = 256;
    private float confidenceThreshold = 0.5f;

    // Supported models for user reference
    public static final String[] SUPPORTED_MODELS = {
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-3-flash",
            "gemini-3-pro"
    };

    public GeminiConfig() {}

    /**
     * Load config from file, creating defaults if it doesn't exist.
     */
    public static GeminiConfig loadOrCreate(Path configDir) {
        Path configFile = configDir.resolve("bresenham").resolve("gemini.json");

        if (Files.exists(configFile)) {
            try {
                String json = Files.readString(configFile);
                GeminiConfig config = GSON.fromJson(json, GeminiConfig.class);
                if (config != null) {
                    BresenhamMod.LOGGER.info("[Bresenham] Gemini config loaded from {}", configFile);
                    return config;
                }
                BresenhamMod.LOGGER.warn("[Bresenham] Gemini config was null after parsing, using defaults.");
            } catch (IOException e) {
                BresenhamMod.LOGGER.error("[Bresenham] Failed to load Gemini config.", e);
            } catch (com.google.gson.JsonSyntaxException e) {
                BresenhamMod.LOGGER.error("[Bresenham] Malformed Gemini config JSON, using defaults.", e);
            }
        }

        // Create default config
        GeminiConfig config = new GeminiConfig();
        config.save(configDir);
        return config;
    }

    /**
     * Save config to file.
     */
    public void save(Path configDir) {
        Path configFile = configDir.resolve("bresenham").resolve("gemini.json");
        try {
            Files.createDirectories(configFile.getParent());
            Files.writeString(configFile, GSON.toJson(this));
            BresenhamMod.LOGGER.debug("[Bresenham] Gemini config saved to {}", configFile);
        } catch (IOException e) {
            BresenhamMod.LOGGER.error("[Bresenham] Failed to save Gemini config.", e);
        }
    }

    // Getters and setters

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public float getTemperature() {
        return temperature;
    }

    public void setTemperature(float temperature) {
        this.temperature = temperature;
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public void setMaxTokens(int maxTokens) {
        this.maxTokens = maxTokens;
    }

    public float getConfidenceThreshold() {
        return confidenceThreshold;
    }

    public void setConfidenceThreshold(float confidenceThreshold) {
        this.confidenceThreshold = confidenceThreshold;
    }

    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }
}
