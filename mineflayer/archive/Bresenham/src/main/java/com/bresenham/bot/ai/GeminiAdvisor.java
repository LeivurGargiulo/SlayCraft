package com.bresenham.bot.ai;

import java.util.concurrent.CompletableFuture;

/**
 * Interface for the Gemini AI advisory system.
 * All AI interactions go through this interface, enabling easy testing and swapping.
 */
public interface GeminiAdvisor {

    /**
     * Send a synchronous advisory request to Gemini.
     * Blocks until response is received.
     */
    AdvisoryResponse advise(AdvisoryRequest request);

    /**
     * Send an asynchronous advisory request to Gemini.
     * Returns immediately; result available via CompletableFuture.
     * This is the preferred method — bot should never stall waiting for AI.
     */
    CompletableFuture<AdvisoryResponse> adviseAsync(AdvisoryRequest request);

    /**
     * @return true if the advisor is configured and can accept requests
     */
    boolean isAvailable();

    /**
     * Shut down the advisor and release resources.
     */
    void shutdown();
}
