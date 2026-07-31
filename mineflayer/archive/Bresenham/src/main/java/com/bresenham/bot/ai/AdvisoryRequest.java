package com.bresenham.bot.ai;

import java.util.List;

/**
 * Structured request to the Gemini AI advisor.
 * Contains the context, question, and available options for the AI to consider.
 */
public class AdvisoryRequest {

    /**
     * Types of advisory requests the AI can handle.
     */
    public enum RequestType {
        GOAL_SELECTION,      // "What should the bot do next?"
        TACTICAL_DECISION,   // "Which approach should we take?"
        RESOURCE_PRIORITY,   // "Which resource should we gather first?"
        COMBAT_STRATEGY,     // "Fight or flee?"
        EXPLORATION,         // "Which direction should we explore?"
        FREEFORM             // Open-ended question
    }

    private final RequestType type;
    private final String question;
    private final String contextSummary;
    private final List<String> availableOptions;

    public AdvisoryRequest(RequestType type, String question, String contextSummary, List<String> availableOptions) {
        this.type = type;
        this.question = question;
        this.contextSummary = contextSummary;
        this.availableOptions = availableOptions;
    }

    /**
     * Create a freeform question request.
     */
    public static AdvisoryRequest freeform(String question, String context) {
        return new AdvisoryRequest(RequestType.FREEFORM, question, context, List.of());
    }

    /**
     * Create a goal selection request.
     */
    public static AdvisoryRequest goalSelection(String context, List<String> options) {
        return new AdvisoryRequest(RequestType.GOAL_SELECTION,
                "What should the bot do next?", context, options);
    }

    /**
     * Create a tactical decision request.
     */
    public static AdvisoryRequest tacticalDecision(String question, String context, List<String> options) {
        return new AdvisoryRequest(RequestType.TACTICAL_DECISION, question, context, options);
    }

    /**
     * Build the prompt string to send to Gemini.
     */
    public String toPrompt() {
        StringBuilder sb = new StringBuilder();
        sb.append("You are an AI advisor for a Minecraft bot. ");
        sb.append("Respond with a JSON object containing: ");
        sb.append("\"decision\" (your chosen option or answer), ");
        sb.append("\"confidence\" (0.0-1.0), ");
        sb.append("\"reasoning\" (brief explanation).\n\n");

        sb.append("## Current State\n");
        sb.append(contextSummary).append("\n\n");

        sb.append("## Question\n");
        sb.append(question).append("\n\n");

        if (!availableOptions.isEmpty()) {
            sb.append("## Available Options\n");
            for (int i = 0; i < availableOptions.size(); i++) {
                sb.append(i + 1).append(". ").append(availableOptions.get(i)).append("\n");
            }
        }

        return sb.toString();
    }

    public RequestType getType() {
        return type;
    }

    public String getQuestion() {
        return question;
    }

    public String getContextSummary() {
        return contextSummary;
    }

    public List<String> getAvailableOptions() {
        return availableOptions;
    }
}
