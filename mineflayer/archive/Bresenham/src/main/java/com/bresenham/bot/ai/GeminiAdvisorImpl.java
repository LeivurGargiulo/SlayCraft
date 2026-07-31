package com.bresenham.bot.ai;

import com.bresenham.bot.BresenhamMod;
import com.google.genai.Client;
import com.google.genai.types.GenerateContentResponse;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Gemini AI advisor implementation using the Google AI Java SDK.
 * Handles API communication, response parsing, retries, and graceful degradation.
 *
 * If the API is unavailable or the API key is not configured,
 * the bot continues operating on its deterministic rule-based systems.
 */
public class GeminiAdvisorImpl implements GeminiAdvisor {

    private final GeminiConfig config;
    private Client client;
    private final ExecutorService executor;
    private boolean available = false;

    public GeminiAdvisorImpl(GeminiConfig config) {
        this.config = config;
        this.executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "bresenham-gemini");
            t.setDaemon(true);
            return t;
        });

        initializeClient();
    }

    private void initializeClient() {
        if (!config.hasApiKey()) {
            BresenhamMod.LOGGER.info("[Bresenham] Gemini API key not configured. AI advisory disabled.");
            available = false;
            return;
        }

        try {
            client = Client.builder().apiKey(config.getApiKey()).build();
            available = true;
            BresenhamMod.LOGGER.info("[Bresenham] Gemini AI advisor initialized with model: {}", config.getModelName());
        } catch (Exception e) {
            BresenhamMod.LOGGER.error("[Bresenham] Failed to initialize Gemini client.", e);
            available = false;
        }
    }

    @Override
    public AdvisoryResponse advise(AdvisoryRequest request) {
        if (!isAvailable() || !config.isEnabled()) {
            return AdvisoryResponse.empty();
        }

        try {
            String prompt = request.toPrompt();
            GenerateContentResponse response = client.models.generateContent(
                    config.getModelName(),
                    prompt,
                    null
            );

            String text = response.text();
            return parseResponse(text);
        } catch (Exception e) {
            BresenhamMod.LOGGER.error("[Bresenham] Gemini API call failed.", e);
            return AdvisoryResponse.failed(e.getMessage());
        }
    }

    @Override
    public CompletableFuture<AdvisoryResponse> adviseAsync(AdvisoryRequest request) {
        if (!isAvailable() || !config.isEnabled()) {
            return CompletableFuture.completedFuture(AdvisoryResponse.empty());
        }

        return CompletableFuture.supplyAsync(() -> advise(request), executor)
                .exceptionally(e -> {
                    BresenhamMod.LOGGER.error("[Bresenham] Async Gemini call failed.", e);
                    return AdvisoryResponse.failed(e.getMessage());
                });
    }

    /**
     * Parse the AI response text into a structured AdvisoryResponse.
     * Expects JSON format: {"decision": "...", "confidence": 0.8, "reasoning": "..."}
     */
    private AdvisoryResponse parseResponse(String responseText) {
        if (responseText == null || responseText.isBlank()) {
            return AdvisoryResponse.failed("Empty response from AI.");
        }

        try {
            // Try to parse as JSON
            com.google.gson.JsonObject json = com.google.gson.JsonParser
                    .parseString(extractJson(responseText))
                    .getAsJsonObject();

            String decision = json.has("decision") ? json.get("decision").getAsString() : "unknown";
            float confidence = json.has("confidence") ? json.get("confidence").getAsFloat() : 0.5f;
            String reasoning = json.has("reasoning") ? json.get("reasoning").getAsString() : "";

            AdvisoryResponse response = new AdvisoryResponse(decision, confidence, reasoning);
            BresenhamMod.LOGGER.info("[Bresenham] AI advisory: {} (confidence: {})", decision, confidence);
            return response;
        } catch (Exception e) {
            // If JSON parsing fails, treat the whole response as the decision
            BresenhamMod.LOGGER.warn("[Bresenham] Could not parse AI response as JSON, using raw text.");
            return new AdvisoryResponse(responseText.trim(), 0.5f, "Raw response (unparsed)");
        }
    }

    /**
     * Extract JSON from a response that may contain markdown code blocks.
     */
    private String extractJson(String text) {
        // Remove markdown code blocks if present
        if (text.contains("```json")) {
            int start = text.indexOf("```json") + 7;
            int end = text.indexOf("```", start);
            if (end > start) {
                return text.substring(start, end).trim();
            }
        }
        if (text.contains("```")) {
            int start = text.indexOf("```") + 3;
            int end = text.indexOf("```", start);
            if (end > start) {
                return text.substring(start, end).trim();
            }
        }
        // Try to find JSON object directly
        int braceStart = text.indexOf('{');
        int braceEnd = text.lastIndexOf('}');
        if (braceStart >= 0 && braceEnd > braceStart) {
            return text.substring(braceStart, braceEnd + 1);
        }
        return text;
    }

    @Override
    public boolean isAvailable() {
        return available && client != null;
    }

    @Override
    public void shutdown() {
        executor.shutdown();
        BresenhamMod.LOGGER.info("[Bresenham] Gemini advisor shut down.");
    }

    /**
     * Reinitialize the client (e.g., after config change).
     */
    public void reinitialize() {
        initializeClient();
    }
}
