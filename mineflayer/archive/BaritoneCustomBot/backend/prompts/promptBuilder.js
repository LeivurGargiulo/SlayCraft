import { buildSystemPrompt } from './systemPrompt.js';

export class PromptBuilder {
    constructor(memoryStore, goalManager, botName) {
        this.memory = memoryStore;
        this.goalManager = goalManager;
        this.botName = botName || 'Bot';
    }

    _buildGoalSection() {
        const goalContext = this.goalManager ? this.goalManager.getGoalContextForPrompt() : null;
        if (!goalContext) return '';
        return `\n## Active Goal\n${JSON.stringify(goalContext, null, 2)}\nYou have an active persistent goal. Continue working toward it unless the player gives you a new task or tells you to stop.\n`;
    }

    _buildBaseSection() {
        const base = this.memory.getBase();
        if (!base) return '';
        return `\n## Base Location\nYour base is at X=${base.x}, Y=${base.y}, Z=${base.z}. Stay within 50 blocks of base when idle. Use STORE_ITEMS when your inventory is nearly full to deposit items in chests at base.\n`;
    }

    /**
     * Build a prompt for when a player sends a chat command.
     */
    buildChatPrompt(sender, message, worldState) {
        const memoryContext = this.memory.getContextForPrompt();
        const goalSection = this._buildGoalSection();
        const baseSection = this._buildBaseSection();

        const userPrompt = `## Current World State
${JSON.stringify(worldState, null, 2)}

## Your Memory
${JSON.stringify(memoryContext, null, 2)}
${goalSection}${baseSection}
## Incoming Chat Command
Player "${sender}" says: "${message}"

Decide what actions to take based on the player's request, your current state, and your memory.
Respond with the JSON action plan.`;

        return { systemPrompt: buildSystemPrompt(this.botName), userPrompt };
    }

    /**
     * Build a prompt for when a task has completed.
     */
    buildTaskCompletePrompt(taskResult, worldState) {
        const memoryContext = this.memory.getContextForPrompt();
        const goalSection = this._buildGoalSection();
        const baseSection = this._buildBaseSection();
        const hasGoal = this.goalManager && this.goalManager.hasActiveGoal();

        const instruction = hasGoal
            ? 'You have an active farming/gathering goal. Continue working on it — issue another MINE action for the same resource. Do NOT go IDLE while your goal is active. If the resource is not nearby, EXPLORE briefly to find more.'
            : "If there's nothing else to do, go IDLE. Don't repeat the same task unless there's a reason.";

        const userPrompt = `## Current World State
${JSON.stringify(worldState, null, 2)}

## Your Memory
${JSON.stringify(memoryContext, null, 2)}
${goalSection}${baseSection}
## Task Completed
Previous task result: ${JSON.stringify(taskResult)}

Your previous task has completed successfully. Decide what to do next.
${instruction}
Respond with the JSON action plan.`;

        return { systemPrompt: buildSystemPrompt(this.botName), userPrompt };
    }

    /**
     * Build a prompt for an emergency situation.
     */
    buildEmergencyPrompt(emergencyType, worldState) {
        const memoryContext = this.memory.getContextForPrompt();
        const goalSection = this._buildGoalSection();
        const baseSection = this._buildBaseSection();

        const userPrompt = `## EMERGENCY: ${emergencyType}

## Current World State
${JSON.stringify(worldState, null, 2)}

## Your Memory
${JSON.stringify(memoryContext, null, 2)}
${goalSection}${baseSection}
An emergency has occurred! Decide the best immediate action to survive.
- If LOW_HEALTH: eat food, flee from danger, or fight if cornered
- If HOSTILE_DETECTED: fight if armed, flee if low health
Priority should be "emergency". Act quickly.
Respond with the JSON action plan.`;

        return { systemPrompt: buildSystemPrompt(this.botName), userPrompt };
    }

    /**
     * Build a prompt for when the bot appears stuck.
     */
    buildStuckPrompt(worldState) {
        const memoryContext = this.memory.getContextForPrompt();
        const goalSection = this._buildGoalSection();
        const baseSection = this._buildBaseSection();

        const userPrompt = `## STUCK DETECTION

## Current World State
${JSON.stringify(worldState, null, 2)}

## Your Memory
${JSON.stringify(memoryContext, null, 2)}
${goalSection}${baseSection}
The bot hasn't moved for a while and appears stuck. The previous task has been cancelled.
Try a nearby alternative first: EXPLORE a short distance to find a new path, or MINE nearby resources.
Do NOT go to distant locations — stay in the same area. Only use IDLE as a last resort.
Don't retry the exact same coordinates that got you stuck.
Respond with the JSON action plan.`;

        return { systemPrompt: buildSystemPrompt(this.botName), userPrompt };
    }

    /**
     * Build a prompt for autonomous decision-making (no player commands for 15+ minutes).
     */
    buildAutonomyPrompt(worldState) {
        const memoryContext = this.memory.getContextForPrompt();
        const goalSection = this._buildGoalSection();
        const baseSection = this._buildBaseSection();

        // Inventory context for smarter decisions
        const usedSlots = worldState?.usedInventorySlots || 0;
        const emptySlots = 36 - usedSlots;
        const inventoryNote = usedSlots >= 31
            ? `\nYour inventory is nearly full (${usedSlots}/36 slots used, only ${emptySlots} empty). You should use STORE_ITEMS to deposit items at base before starting a new task.`
            : `\nYou have ${emptySlots} empty inventory slots available.`;

        const userPrompt = `## Current World State
${JSON.stringify(worldState, null, 2)}

## Your Memory
${JSON.stringify(memoryContext, null, 2)}
${goalSection}${baseSection}
## Autonomous Decision Time
No player has given you a task for a while. You're free to decide what to do — act like a real player who decides to be productive.
${inventoryNote}

Pick ONE focused, sustained task and commit to it. Good choices:
- Mine iron ore or coal underground (go to Y=16 for iron, or Y=0+ for coal)
- Gather a full inventory of wood (oak_log, birch_log, etc.)
- Strip-mine for diamonds at Y=-59
- Collect cobblestone or stone for building projects
- Explore to find new resources or interesting areas

Rules:
- Pick a SINGLE resource/task — don't switch between activities
- This task should keep you busy for a long session until your inventory fills up
- When inventory is full, use STORE_ITEMS to deposit at base
- If a player gives you a command, you'll automatically switch to their task
- Keep any chat_response brief and in-character (e.g., "Nobody's around... time to go mining!")

Respond with the JSON action plan.`;

        return { systemPrompt: buildSystemPrompt(this.botName), userPrompt };
    }
}
