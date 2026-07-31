export class AntiLoopDetector {
    constructor(windowSize = 10) {
        this.recentActions = [];
        this.windowSize = windowSize;
    }

    recordAction(action) {
        const key = JSON.stringify({ type: action.type, target: action.block || action.player || null });
        this.recentActions.push(key);
        if (this.recentActions.length > this.windowSize) {
            this.recentActions.shift();
        }
    }

    /**
     * Detects ABAB or AAAA repetition patterns.
     */
    isLooping() {
        const len = this.recentActions.length;
        if (len < 4) return false;

        // Check AAAA pattern (4+ identical consecutive actions)
        const last = this.recentActions[len - 1];
        let sameCount = 0;
        for (let i = len - 1; i >= 0; i--) {
            if (this.recentActions[i] === last) sameCount++;
            else break;
        }
        if (sameCount >= 4) return true;

        // Check ABAB pattern (alternating pairs repeated 3+ times)
        if (len >= 6) {
            const a = this.recentActions[len - 2];
            const b = this.recentActions[len - 1];
            if (a !== b) {
                let abCount = 0;
                for (let i = len - 2; i >= 1; i -= 2) {
                    if (this.recentActions[i] === b && this.recentActions[i - 1] === a) {
                        abCount++;
                    } else break;
                }
                if (abCount >= 3) return true;
            }
        }

        return false;
    }

    reset() {
        this.recentActions = [];
    }
}
