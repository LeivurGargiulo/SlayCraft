package com.bresenham.bot.ai;

/**
 * Structured response from the Gemini AI advisor.
 * The deterministic system can inspect confidence and choose to ignore low-confidence advice.
 */
public class AdvisoryResponse {

    private final String decision;
    private final float confidence;
    private final String reasoning;
    private final boolean successful;

    public AdvisoryResponse(String decision, float confidence, String reasoning) {
        this.decision = decision;
        this.confidence = confidence;
        this.reasoning = reasoning;
        this.successful = true;
    }

    /**
     * Create a failed response (e.g., API error).
     */
    public static AdvisoryResponse failed(String reason) {
        return new AdvisoryResponse("none", 0.0f, "Failed: " + reason);
    }

    /**
     * Create an empty/no-op response (AI unavailable or disabled).
     */
    public static AdvisoryResponse empty() {
        return new AdvisoryResponse("none", 0.0f, "AI advisory not available.");
    }

    public String getDecision() {
        return decision;
    }

    public float getConfidence() {
        return confidence;
    }

    public String getReasoning() {
        return reasoning;
    }

    public boolean isSuccessful() {
        return successful;
    }

    /**
     * @return true if confidence is above the given threshold
     */
    public boolean isConfidentEnough(float threshold) {
        return confidence >= threshold;
    }

    @Override
    public String toString() {
        return String.format("AdvisoryResponse{decision='%s', confidence=%.2f, reasoning='%s'}",
                decision, confidence, reasoning);
    }
}
