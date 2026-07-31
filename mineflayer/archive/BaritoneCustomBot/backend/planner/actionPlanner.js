import { GoogleGenAI } from '@google/genai';
import { PromptBuilder } from '../prompts/promptBuilder.js';
import { ActionValidator } from './actionValidator.js';
import { RecipeResolver } from './recipeResolver.js';
import { CooldownManager } from '../utils/cooldownManager.js';
import { AntiLoopDetector } from '../utils/antiLoop.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Planner');
const GEMINI_TIMEOUT_MS = 15000;

export class ActionPlanner {
    constructor(memoryStore, goalManager, botName) {
        this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        this.promptBuilder = new PromptBuilder(memoryStore, goalManager, botName);
        this.validator = new ActionValidator();
        this.recipeResolver = new RecipeResolver();
        this.cooldown = new CooldownManager();
        this.antiLoop = new AntiLoopDetector();
        this.memory = memoryStore;
        this.goalManager = goalManager;
        this.craftingQueue = [];
    }

    /**
     * Plan actions in response to a player chat command.
     */
    async planForChat(sender, message, worldState) {
        if (!this.cooldown.canCallGemini()) {
            log.warn('Gemini on cooldown, skipping chat plan');
            return null;
        }

        const { systemPrompt, userPrompt } = this.promptBuilder.buildChatPrompt(
            sender, message, worldState
        );
        return await this._callGemini(systemPrompt, userPrompt);
    }

    /**
     * Plan next action after a task completes.
     * If there's a pending crafting queue, returns the next step without calling Gemini.
     */
    async planForTaskComplete(taskResult, worldState) {
        // Check if there's a pending crafting queue
        if (this.craftingQueue.length > 0) {
            const nextStep = this.craftingQueue.shift();
            log.info(`Crafting queue: sending next step (${nextStep.type}), ${this.craftingQueue.length} remaining`);
            return {
                intent: `Crafting step: ${nextStep.type} ${nextStep.item || nextStep.block || ''}`.trim(),
                priority: 'medium',
                actions: [nextStep],
                chat_response: null
            };
        }

        if (!this.cooldown.canCallGemini()) {
            log.debug('Gemini on cooldown, skipping task complete plan');
            return null;
        }

        const { systemPrompt, userPrompt } = this.promptBuilder.buildTaskCompletePrompt(
            taskResult, worldState
        );
        return await this._callGemini(systemPrompt, userPrompt);
    }

    /**
     * Plan emergency response (bypasses cooldown).
     */
    async planForEmergency(emergencyType, worldState) {
        const { systemPrompt, userPrompt } = this.promptBuilder.buildEmergencyPrompt(
            emergencyType, worldState
        );
        return await this._callGemini(systemPrompt, userPrompt);
    }

    /**
     * Plan when the bot is stuck.
     */
    async planForStuck(worldState) {
        if (!this.cooldown.canCallGemini()) {
            log.debug('Gemini on cooldown, skipping stuck plan');
            return null;
        }

        const { systemPrompt, userPrompt } = this.promptBuilder.buildStuckPrompt(worldState);
        return await this._callGemini(systemPrompt, userPrompt);
    }

    /**
     * Plan an autonomous action when the bot has been idle with no player commands.
     */
    async planForAutonomy(worldState) {
        if (!this.cooldown.canCallGemini()) {
            log.debug('Gemini on cooldown, skipping autonomy plan');
            return null;
        }

        const { systemPrompt, userPrompt } = this.promptBuilder.buildAutonomyPrompt(worldState);
        return await this._callGemini(systemPrompt, userPrompt);
    }

    /**
     * Core Gemini API call with validation and anti-loop logic.
     */
    async _callGemini(systemPrompt, userPrompt) {
        try {
            this.cooldown.recordGeminiCall();

            log.debug('Calling Gemini...');
            const response = await Promise.race([
                this.ai.models.generateContent({
                    model: this.model,
                    contents: userPrompt,
                    config: {
                        systemInstruction: systemPrompt,
                        responseMimeType: 'application/json',
                        temperature: 0.3,
                        maxOutputTokens: 4096
                    }
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Gemini API timeout')), GEMINI_TIMEOUT_MS)
                )
            ]);

            const text = response.text;
            log.debug('Gemini raw response:', text?.substring(0, 200));

            if (!text) {
                log.error('Gemini returned empty response');
                return null;
            }

            // Parse JSON
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                log.error('Failed to parse Gemini response as JSON:', text.substring(0, 300));
                return null;
            }

            // Validate structure
            const validated = this.validator.validate(parsed);
            if (!validated) {
                log.warn('Gemini response failed validation');
                return null;
            }

            // Anti-loop checks (suppressed for goal-aligned actions)
            const hasGoal = this.goalManager && this.goalManager.hasActiveGoal();

            for (const action of validated.actions) {
                const isGoalAligned = hasGoal && this.goalManager.isGoalAligned(action);

                if (!isGoalAligned && !this.cooldown.checkActionRepetition(action.type)) {
                    log.warn(`Action "${action.type}" repeated too many times, forcing IDLE`);
                    return {
                        intent: 'Breaking repetition — same action too many times',
                        priority: 'low',
                        actions: [{ type: 'IDLE' }],
                        chat_response: null
                    };
                }
                this.antiLoop.recordAction(action);
            }

            if (!hasGoal && this.antiLoop.isLooping()) {
                log.warn('Action loop detected, forcing EXPLORE to break cycle');
                this.antiLoop.reset();
                return {
                    intent: 'Breaking detected action loop',
                    priority: 'medium',
                    actions: [{ type: 'EXPLORE' }],
                    chat_response: "Hmm, I seem stuck in a loop. Let me try something different."
                };
            }

            log.info(`Plan: "${validated.intent}" [${validated.priority}] — ${validated.actions.length} action(s)`);

            // Intercept STORE_ITEMS actions: inject base coordinates
            const storeAction = validated.actions.find(a => a.type === 'STORE_ITEMS');
            if (storeAction) {
                const base = this.memory.getBase();
                if (base) {
                    storeAction.baseX = base.x;
                    storeAction.baseY = base.y;
                    storeAction.baseZ = base.z;
                    log.info(`Injected base coordinates into STORE_ITEMS: ${base.x}, ${base.y}, ${base.z}`);
                } else {
                    log.warn('STORE_ITEMS requested but no base set, replacing with IDLE');
                    validated.actions = [{ type: 'IDLE' }];
                    validated.chat_response = "I don't have a base set yet. Tell me to set base here!";
                }
            }

            // Intercept CRAFT actions: resolve recipe chain and queue steps
            const craftAction = validated.actions.find(a => a.type === 'CRAFT');
            if (craftAction) {
                const inventory = this.memory.data?.lastKnownState?.inventory || [];
                const steps = this.recipeResolver.resolve(craftAction.item, craftAction.count || 1, inventory);
                if (steps && steps.length > 0) {
                    log.info(`Resolved crafting chain for ${craftAction.item}: ${steps.length} steps`);
                    // Queue all steps except the first
                    this.craftingQueue = steps.slice(1);
                    // Replace the CRAFT action with the first step
                    validated.actions = [steps[0]];
                } else {
                    log.warn(`Could not resolve recipe for ${craftAction.item}`);
                }
            }

            return validated;

        } catch (error) {
            if (error.status === 429) {
                log.warn('Gemini rate limited, will retry later');
            } else if (error.status >= 500) {
                log.warn('Gemini server error:', error.message);
            } else {
                log.error('Gemini API call failed:', error.message);
            }
            return null;
        }
    }

    /**
     * Check if there are pending crafting queue steps.
     */
    hasCraftingQueue() {
        return this.craftingQueue.length > 0;
    }

    /**
     * Clear the crafting queue (e.g. on STOP command).
     */
    clearCraftingQueue() {
        this.craftingQueue = [];
    }
}
