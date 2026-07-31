package com.bresenham.bot.ai;

import com.bresenham.bot.BresenhamMod;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.TaskManager;

import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Hooks the Gemini AI advisor into the bot's decision-making systems.
 * All advisory queries are async and non-blocking.
 *
 * Integration points:
 * - Goal selection: when idle, asks what to do next
 * - Tactical decisions: when planner has multiple options
 * - Reactive prioritization: when multiple reactive rules trigger
 * - Resource strategy: when mining, which resources to prioritize
 *
 * The deterministic system always has final say. AI advice with
 * confidence below the configured threshold is ignored.
 */
public class AdvisorIntegration {

    private final GeminiAdvisor advisor;
    private final GeminiConfig config;

    // Track pending async responses
    private CompletableFuture<AdvisoryResponse> pendingGoalAdvice;
    private AdvisoryResponse lastGoalAdvice;

    // Cooldown to prevent excessive API calls
    private int ticksSinceLastQuery = 0;
    private static final int QUERY_COOLDOWN_TICKS = 200; // 10 seconds

    public AdvisorIntegration(GeminiAdvisor advisor, GeminiConfig config) {
        this.advisor = advisor;
        this.config = config;
    }

    /**
     * Called every tick by BotController.
     * Checks for completed async responses and manages query cooldowns.
     */
    public void tick(WorldState state, TaskManager taskManager) {
        if (!config.isEnabled() || !advisor.isAvailable()) return;

        ticksSinceLastQuery++;

        // Check if pending goal advice has completed
        if (pendingGoalAdvice != null && pendingGoalAdvice.isDone()) {
            try {
                lastGoalAdvice = pendingGoalAdvice.get();
                BresenhamMod.LOGGER.info("[Bresenham] AI goal advice received: {}", lastGoalAdvice);
            } catch (Exception e) {
                BresenhamMod.LOGGER.error("[Bresenham] Failed to get AI goal advice.", e);
            }
            pendingGoalAdvice = null;
        }

        // If bot is idle and cooldown has passed, ask for goal suggestion
        if (!taskManager.hasTasks() && ticksSinceLastQuery >= QUERY_COOLDOWN_TICKS) {
            requestGoalAdvice(state, taskManager);
        }
    }

    /**
     * Ask the AI what the bot should do next.
     */
    public void requestGoalAdvice(WorldState state, TaskManager taskManager) {
        if (pendingGoalAdvice != null) return; // Already waiting

        String context = AdvisoryContext.buildContext(state, taskManager);
        List<String> options = List.of("mine_iron", "craft_pickaxe", "explore", "gather_wood", "build_shelter");

        AdvisoryRequest request = AdvisoryRequest.goalSelection(context, options);
        pendingGoalAdvice = advisor.adviseAsync(request);
        ticksSinceLastQuery = 0;

        BresenhamMod.LOGGER.debug("[Bresenham] Requesting AI goal advice...");
    }

    /**
     * Ask the AI for a tactical decision between options.
     */
    public CompletableFuture<AdvisoryResponse> requestTacticalAdvice(
            String question, WorldState state, TaskManager taskManager, List<String> options) {
        String context = AdvisoryContext.buildContext(state, taskManager);
        AdvisoryRequest request = AdvisoryRequest.tacticalDecision(question, context, options);
        return advisor.adviseAsync(request);
    }

    /**
     * Submit a freeform question to the AI.
     */
    public CompletableFuture<AdvisoryResponse> askFreeform(String question, WorldState state, TaskManager taskManager) {
        String context = AdvisoryContext.buildContext(state, taskManager);
        AdvisoryRequest request = AdvisoryRequest.freeform(question, context);
        return advisor.adviseAsync(request);
    }

    /**
     * @return the most recent goal advice, or null if none
     */
    public AdvisoryResponse getLastGoalAdvice() {
        return lastGoalAdvice;
    }

    /**
     * @return true if there's a pending async query
     */
    public boolean hasPendingQuery() {
        return pendingGoalAdvice != null && !pendingGoalAdvice.isDone();
    }
}
