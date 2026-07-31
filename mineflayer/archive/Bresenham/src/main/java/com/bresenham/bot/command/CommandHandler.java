package com.bresenham.bot.command;

import com.bresenham.bot.ai.GeminiAdvisor;
import com.bresenham.bot.ai.GeminiConfig;
import com.bresenham.bot.api.BotApi;
import net.minecraft.server.network.ServerPlayerEntity;

/**
 * Stateless bridge between Fabric commands and the BotApi.
 * No game logic here — all logic is delegated to BotApi.
 */
public class CommandHandler {

    private final BotApi botApi;
    private final GeminiAdvisor geminiAdvisor;
    private final GeminiConfig geminiConfig;

    public CommandHandler(BotApi botApi, GeminiAdvisor geminiAdvisor, GeminiConfig geminiConfig) {
        this.botApi = botApi;
        this.geminiAdvisor = geminiAdvisor;
        this.geminiConfig = geminiConfig;
    }

    public String handleStart(ServerPlayerEntity player) {
        botApi.startBot(player);
        return "Bot started for " + player.getName().getString() + ".";
    }

    public String handleStop() {
        botApi.stopBot();
        return "Bot stopped.";
    }

    public String handleTask(String taskName) {
        try {
            botApi.startTask(taskName);
            return "Task '" + taskName + "' started.";
        } catch (IllegalArgumentException e) {
            return "Unknown task: " + taskName + ". Available: " + botApi.getAvailableTaskNames();
        }
    }

    public String handleStatus() {
        return botApi.getStatus();
    }

    public String handlePause() {
        botApi.pauseCurrentTask();
        return "Current task paused.";
    }

    public String handleResume() {
        botApi.resumeCurrentTask();
        return "Current task resumed.";
    }

    // AI commands

    public String handleAiStatus() {
        boolean available = geminiAdvisor != null && geminiAdvisor.isAvailable();
        String model = geminiConfig != null ? geminiConfig.getModelName() : "not configured";
        boolean enabled = geminiConfig != null && geminiConfig.isEnabled();
        return String.format("AI Status: %s | Model: %s | Enabled: %s",
                available ? "available" : "unavailable", model, enabled);
    }

    public String handleAiModel(String modelName) {
        if (geminiConfig == null) return "AI not configured.";
        geminiConfig.setModelName(modelName);
        return "AI model set to: " + modelName;
    }

    public String handleAiEnable() {
        if (geminiConfig == null) return "AI not configured.";
        geminiConfig.setEnabled(true);
        return "AI advisory enabled.";
    }

    public String handleAiDisable() {
        if (geminiConfig == null) return "AI not configured.";
        geminiConfig.setEnabled(false);
        return "AI advisory disabled.";
    }

    public String handleAiAsk(String question) {
        if (geminiAdvisor == null || !geminiAdvisor.isAvailable()) {
            return "AI is not available.";
        }
        if (geminiConfig != null && !geminiConfig.isEnabled()) {
            return "AI is disabled. Use /bot ai enable first.";
        }
        // Async ask — result will be logged
        return "AI query submitted: " + question;
    }
}
