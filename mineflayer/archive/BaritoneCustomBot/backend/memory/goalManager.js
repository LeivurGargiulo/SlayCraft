import { createLogger } from '../utils/logger.js';

const log = createLogger('GoalManager');

const RESOURCE_ALIASES = {
    'bamboo': 'bamboo',
    'wood': 'oak_log',
    'oak': 'oak_log',
    'birch': 'birch_log',
    'spruce': 'spruce_log',
    'dark_oak': 'dark_oak_log',
    'jungle': 'jungle_log',
    'acacia': 'acacia_log',
    'diamond': 'diamond_ore',
    'diamonds': 'diamond_ore',
    'iron': 'iron_ore',
    'coal': 'coal_ore',
    'gold': 'gold_ore',
    'copper': 'copper_ore',
    'lapis': 'lapis_ore',
    'redstone': 'redstone_ore',
    'emerald': 'emerald_ore',
    'wheat': 'wheat',
    'sugarcane': 'sugar_cane',
    'sugar_cane': 'sugar_cane',
    'cactus': 'cactus',
    'sand': 'sand',
    'gravel': 'gravel',
    'dirt': 'dirt',
    'cobblestone': 'cobblestone',
    'stone': 'stone',
    'obsidian': 'obsidian',
    'logs': 'oak_log',
    'trees': 'oak_log'
};

export class GoalManager {
    constructor() {
        this.activeGoal = null;
    }

    /**
     * Set a persistent goal.
     * @param {string} type - Goal type ('farm', 'gather', etc.)
     * @param {object} details - Goal details, e.g. { resource: 'bamboo' }
     * @param {string} setBy - Player who set the goal
     */
    setGoal(type, details, setBy) {
        if (details.resource) {
            details.resource = GoalManager.normalizeResource(details.resource);
        }
        this.activeGoal = {
            type, ...details, setBy, setAt: Date.now(),
            durationMinutes: details.durationMinutes || null
        };
        log.info(`Goal set: ${type} ${details.resource || ''} (by ${setBy}, duration: ${details.durationMinutes || 'indefinite'} min)`);
    }

    clearGoal() {
        if (this.activeGoal) {
            log.info(`Goal cleared: ${this.activeGoal.type} ${this.activeGoal.resource || ''}`);
        }
        this.activeGoal = null;
    }

    hasActiveGoal() {
        return this.activeGoal !== null;
    }

    getActiveGoal() {
        return this.activeGoal;
    }

    /**
     * Returns goal context formatted for Gemini prompt injection.
     */
    /**
     * Check if the current goal has expired (only applies to timed goals).
     */
    isGoalExpired() {
        if (!this.activeGoal || !this.activeGoal.durationMinutes) return false;
        const elapsedMin = (Date.now() - this.activeGoal.setAt) / 60000;
        return elapsedMin >= this.activeGoal.durationMinutes;
    }

    /**
     * Check if the active goal is an autonomous (not player-set) goal.
     */
    isAutonomousGoal() {
        return this.activeGoal && this.activeGoal.setBy === 'autonomous';
    }

    getGoalContextForPrompt() {
        if (!this.activeGoal) return null;
        const durationMin = Math.round((Date.now() - this.activeGoal.setAt) / 60000);
        const remainingMin = this.activeGoal.durationMinutes
            ? Math.max(0, this.activeGoal.durationMinutes - durationMin)
            : null;
        return {
            activeGoal: this.activeGoal,
            durationMinutes: durationMin,
            remainingMinutes: remainingMin,
            isAutonomous: this.activeGoal.setBy === 'autonomous'
        };
    }

    /**
     * Check if a MINE action is aligned with the current goal.
     */
    isGoalAligned(action) {
        if (!this.activeGoal) return false;

        // Autonomous goals: suppress anti-loop for all actions
        if (this.activeGoal.type === 'autonomous_task') return true;

        if (!this.activeGoal.resource) return false;
        if (action.type !== 'MINE') return false;
        if (!action.block) return false;
        const block = action.block.replace('minecraft:', '');
        return block === this.activeGoal.resource || block.endsWith(this.activeGoal.resource);
    }

    /**
     * Normalize a player-provided resource name to a Minecraft block name (without prefix).
     */
    static normalizeResource(resource) {
        resource = resource.replace('minecraft:', '').toLowerCase();
        return RESOURCE_ALIASES[resource] || resource;
    }
}
