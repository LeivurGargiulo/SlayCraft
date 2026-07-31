export class CooldownManager {
    constructor() {
        this.lastGeminiCall = 0;
        this.actionCounts = new Map();
        this.lastActionType = null;
    }

    canCallGemini() {
        const minCooldown = parseInt(process.env.MIN_GEMINI_COOLDOWN_MS || '2000');
        return Date.now() - this.lastGeminiCall >= minCooldown;
    }

    recordGeminiCall() {
        this.lastGeminiCall = Date.now();
    }

    /**
     * Returns true if the action is allowed (not too repetitive).
     * Max 3 consecutive identical action types.
     */
    checkActionRepetition(actionType) {
        if (actionType === this.lastActionType) {
            const count = (this.actionCounts.get(actionType) || 0) + 1;
            this.actionCounts.set(actionType, count);
            return count <= 3;
        }
        this.lastActionType = actionType;
        this.actionCounts.clear();
        this.actionCounts.set(actionType, 1);
        return true;
    }

    reset() {
        this.lastGeminiCall = 0;
        this.actionCounts.clear();
        this.lastActionType = null;
    }
}
