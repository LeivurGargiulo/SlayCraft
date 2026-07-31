import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { InventoryAnalyzer } from '../utils/inventoryAnalyzer.js';

const log = createLogger('WebSocket');

export class GameWebSocketServer {
    constructor(planner, memoryStore, goalManager, config = {}) {
        this.planner = planner;
        this.memory = memoryStore;
        this.goalManager = goalManager;
        this.botName = config.botName || 'Bot';
        this.whitelist = config.whitelist || [];
        this.blacklist = config.blacklist || [];
        this.wss = null;
        this.clientSocket = null;
        this.lastWorldState = null;
        this.heartbeatInterval = null;
        this.pendingGeminiCall = false;
        this.lastPlayerTaskTime = Date.now();
        this.autonomyCheckInterval = null;
        this.lastDimension = null;
        this.lastPosition = null;
        this.lastEmergencyTime = {};
        this.pendingEmergencyCall = false;
        this.emergencyTaskIds = new Set();
        this.queuedChatMessage = null;
        this.playerIdleTaskIds = new Set();

        log.info(`Bot name: ${this.botName}`);
        if (this.whitelist.length > 0) log.info(`Whitelist: ${this.whitelist.join(', ')}`);
        if (this.blacklist.length > 0) log.info(`Blacklist: ${this.blacklist.join(', ')}`);
    }

    start(port) {
        this.wss = new WebSocketServer({ port });
        log.info(`WebSocket server listening on port ${port}`);

        this.wss.on('connection', (ws) => {
            log.info('Minecraft mod client connected');
            this.clientSocket = ws;

            // Send stored base location to mod on reconnect
            const base = this.memory.getBase();
            if (base) {
                this.sendToMod({ type: 'SET_BASE', x: base.x, y: base.y, z: base.z });
                log.info(`Sent stored base location to mod: ${base.x}, ${base.y}, ${base.z}`);
            }

            // Send bot config (name + idle mode) to mod
            this.sendToMod({
                type: 'SET_CONFIG',
                botName: this.botName,
                idleMode: this.memory.getIdleMode()
            });
            log.info(`Sent config to mod: name=${this.botName}, idleMode=${this.memory.getIdleMode()}`);

            ws.isAlive = true;
            ws.on('pong', () => { ws.isAlive = true; });

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    await this.handleMessage(message);
                } catch (e) {
                    log.error('Failed to handle message:', e.message);
                }
            });

            ws.on('close', () => {
                log.info('Minecraft mod client disconnected');
                this.clientSocket = null;
                // Reset all guards and stale state on disconnect
                this.emergencyTaskIds.clear();
                this.playerIdleTaskIds.clear();
                this.pendingGeminiCall = false;
                this.pendingEmergencyCall = false;
                this.queuedChatMessage = null;
            });

            ws.on('error', (err) => {
                log.error('WebSocket error:', err.message);
            });
        });

        // Heartbeat — terminate stale connections every 30s
        this.heartbeatInterval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (!ws.isAlive) {
                    log.warn('Terminating stale connection');
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () => {
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        });

        // Autonomy check — every 60 seconds, see if bot should act on its own
        this.autonomyCheckInterval = setInterval(() => {
            this._checkAutonomy();
        }, 60000);
    }

    async handleMessage(message) {
        const { type } = message;
        if (type !== 'STATE_UPDATE') {
            log.debug(`Received: ${type}`);
        }

        switch (type) {
            case 'CHAT_MESSAGE': {
                const { sender, message: chatMsg, worldState } = message;
                this.lastWorldState = worldState;
                this.lastPlayerTaskTime = Date.now();

                log.info(`Chat from "${sender}": "${chatMsg}"`);

                // Whitelist/blacklist access control
                if (this.blacklist.includes(sender)) {
                    log.info(`Blocked command from blacklisted player: ${sender}`);
                    break;
                }
                if (this.whitelist.length > 0 && !this.whitelist.includes(sender)) {
                    log.info(`Blocked command from non-whitelisted player: ${sender}`);
                    break;
                }

                this.memory.updatePlayer(sender, { lastMessage: chatMsg });

                // Clear autonomous goals when any player sends a command
                if (this.goalManager.isAutonomousGoal()) {
                    log.info('Player command received — clearing autonomous goal');
                    this.goalManager.clearGoal();
                    this.planner.antiLoop.reset();
                }

                // Detect "set base" commands
                const lowerMsg = chatMsg.toLowerCase();
                if (lowerMsg.match(/\b(set\s+base|this\s+is\s+(your|the)\s+base|base\s+here|make\s+this\s+(your\s+)?base)\b/)) {
                    if (worldState?.position && worldState.position.x !== undefined) {
                        const bx = Math.round(worldState.position.x);
                        const by = Math.round(worldState.position.y);
                        const bz = Math.round(worldState.position.z);
                        this.memory.setBase(bx, by, bz);
                        this.sendToMod({ type: 'SET_BASE', x: bx, y: by, z: bz });
                        log.info(`Base set by ${sender} at ${bx}, ${by}, ${bz}`);
                    }
                }

                // Detect goal-clearing commands
                if (lowerMsg.match(/\b(stop|halt|cancel|enough|done|quit)\b/)) {
                    if (this.goalManager.hasActiveGoal()) {
                        log.info('Player requested stop — clearing active goal');
                        this.goalManager.clearGoal();
                        this.planner.antiLoop.reset();
                    }
                }

                // Detect idle mode toggle commands
                if (lowerMsg.match(/\b(stay\s+put|stay\s+still|don'?t\s+(wander|move|roam)|stand\s+still)\b/)) {
                    this.memory.setIdleMode('stay_put');
                    this.sendToMod({ type: 'SET_IDLE_MODE', mode: 'stay_put' });
                    log.info(`Idle mode set to stay_put by ${sender}`);
                }
                if (lowerMsg.match(/\b(do\s+what(ever)?\s+you\s+want|be\s+(free|autonomous)|you\s+can\s+(wander|roam|move)|do\s+your\s+(own\s+)?thing)\b/)) {
                    this.memory.setIdleMode('autonomous');
                    this.sendToMod({ type: 'SET_IDLE_MODE', mode: 'autonomous' });
                    log.info(`Idle mode set to autonomous by ${sender}`);
                }

                // Clear stale crafting queue on new player commands
                this.planner.clearCraftingQueue();

                // If a Gemini call is in progress, queue this message instead of dropping it
                if (this.pendingGeminiCall) {
                    log.info('Gemini call in progress, queuing player command');
                    this.queuedChatMessage = { sender, chatMsg, worldState };
                    // Cancel whatever task is running — player command takes priority
                    this.sendToMod({ type: 'STOP' });
                    return;
                }

                this.pendingGeminiCall = true;
                try {
                    const plan = await this.planner.planForChat(sender, chatMsg, worldState);
                    if (plan) {
                        this.memory.addConversation(sender, chatMsg, plan.chat_response);

                        // Detect farming intent and set goal
                        this._detectAndSetGoal(sender, chatMsg, plan);

                        // Auto-convert long GOTO to NETHER_TRAVEL if beneficial
                        this._convertToNetherTravel(plan.actions, worldState);

                        const taskId = randomUUID();

                        // Track player-initiated STOP/IDLE tasks to suppress follow-up planning
                        const firstActionType = plan.actions[0]?.type;
                        if (firstActionType === 'STOP' || firstActionType === 'IDLE') {
                            this.playerIdleTaskIds.add(taskId);
                            setTimeout(() => this.playerIdleTaskIds.delete(taskId), 300000);
                        }

                        this.sendToMod({
                            type: 'EXECUTE_ACTIONS',
                            taskId,
                            actions: plan.actions,
                            chatResponse: plan.chat_response
                        });
                    }
                } finally {
                    this.pendingGeminiCall = false;
                    this._processQueuedChat();
                }
                break;
            }

            case 'STATE_UPDATE': {
                this.lastWorldState = message.worldState;
                this.memory.updateLastKnownState(message.worldState);

                // Track dimension changes for portal pair discovery
                if (message.worldState?.dimension && message.worldState?.position) {
                    const currentDim = message.worldState.dimension;
                    const currentPos = message.worldState.position;

                    if (this.lastDimension && this.lastPosition && currentDim !== this.lastDimension) {
                        const isToNether = currentDim.includes('the_nether') && !this.lastDimension.includes('the_nether');
                        const isToOverworld = !currentDim.includes('the_nether') && this.lastDimension.includes('the_nether');

                        if (isToNether) {
                            // Entered nether: last position was overworld portal, current is nether side
                            this.memory.addPortalPair(
                                { x: Math.round(this.lastPosition.x), y: Math.round(this.lastPosition.y), z: Math.round(this.lastPosition.z) },
                                { x: Math.round(currentPos.x), y: Math.round(currentPos.y), z: Math.round(currentPos.z) }
                            );
                        } else if (isToOverworld) {
                            // Exited nether: last position was nether portal, current is overworld side
                            this.memory.addPortalPair(
                                { x: Math.round(currentPos.x), y: Math.round(currentPos.y), z: Math.round(currentPos.z) },
                                { x: Math.round(this.lastPosition.x), y: Math.round(this.lastPosition.y), z: Math.round(this.lastPosition.z) }
                            );
                        }
                        log.info(`Dimension change detected: ${this.lastDimension} -> ${currentDim}`);
                    }

                    this.lastDimension = currentDim;
                    this.lastPosition = currentPos;
                }

                // Passive — no Gemini call
                break;
            }

            case 'TASK_COMPLETE': {
                log.info(`Task completed: ${message.taskId}`);

                // Skip follow-up planning for emergency-originated tasks
                if (this.emergencyTaskIds.has(message.taskId)) {
                    this.emergencyTaskIds.delete(message.taskId);
                    log.info('Emergency task completed, returning to idle');
                    this._processQueuedChat();
                    break;
                }

                // Skip follow-up planning for player-initiated stop/idle
                if (this.playerIdleTaskIds.has(message.taskId)) {
                    this.playerIdleTaskIds.delete(message.taskId);
                    log.info('Player-initiated stop/idle completed, skipping follow-up');
                    this._processQueuedChat();
                    break;
                }

                // Check inventory fullness
                const invAnalysis = InventoryAnalyzer.analyze(this.lastWorldState);

                // Check if autonomous goal has expired
                if (this.goalManager.isAutonomousGoal() && this.goalManager.isGoalExpired()) {
                    log.info('Autonomous goal expired, clearing and storing items');
                    this.goalManager.clearGoal();
                    this.planner.antiLoop.reset();
                    if (invAnalysis.usedSlots > 5) {
                        this._triggerStoreItems();
                        break;
                    }
                }

                // If inventory is nearly full, trigger store items
                if (invAnalysis.isNearlyFull && this.memory.getBase()) {
                    log.info(`Inventory nearly full (${invAnalysis.usedSlots}/36), storing items`);
                    if (this.goalManager.isAutonomousGoal()) {
                        this.goalManager.clearGoal();
                        this.planner.antiLoop.reset();
                    }
                    this._triggerStoreItems();
                    break;
                }

                if (this.pendingGeminiCall) return;
                this.pendingGeminiCall = true;
                try {
                    const plan = await this.planner.planForTaskComplete(
                        { taskId: message.taskId, result: message.result },
                        this.lastWorldState
                    );

                    // Safety net: if goal is active but Gemini returned IDLE, override
                    if (this.goalManager.hasActiveGoal() && plan &&
                        (plan.actions.length === 0 || plan.actions[0].type === 'IDLE')) {
                        const goal = this.goalManager.getActiveGoal();
                        // If autonomous goal and Gemini says IDLE, respect it — bot stops voluntarily
                        if (this.goalManager.isAutonomousGoal()) {
                            log.info('Autonomous goal: Gemini returned IDLE, clearing goal');
                            this.goalManager.clearGoal();
                            this.planner.antiLoop.reset();
                        } else {
                            log.info(`Active goal exists but got IDLE, continuing farm: ${goal.resource}`);
                            this.sendToMod({
                                type: 'EXECUTE_ACTIONS',
                                taskId: randomUUID(),
                                actions: [{ type: 'MINE', block: `minecraft:${goal.resource}` }],
                                chatResponse: null
                            });
                        }
                    } else if (plan && plan.actions.length > 0 && plan.actions[0].type !== 'IDLE') {
                        // Auto-convert long GOTO to NETHER_TRAVEL if beneficial
                        this._convertToNetherTravel(plan.actions, this.lastWorldState);

                        this.sendToMod({
                            type: 'EXECUTE_ACTIONS',
                            taskId: randomUUID(),
                            actions: plan.actions,
                            chatResponse: plan.chat_response
                        });
                    }
                } finally {
                    this.pendingGeminiCall = false;
                    this._processQueuedChat();
                }
                break;
            }

            case 'TASK_FAILED': {
                log.warn(`Task failed: ${message.error}`);

                // Skip follow-up planning for emergency-originated tasks
                if (this.emergencyTaskIds.has(message.taskId)) {
                    this.emergencyTaskIds.delete(message.taskId);
                    log.info('Emergency task failed, returning to idle');
                    this._processQueuedChat();
                    break;
                }

                // Skip follow-up planning for player-initiated stop/idle
                if (this.playerIdleTaskIds.has(message.taskId)) {
                    this.playerIdleTaskIds.delete(message.taskId);
                    log.info('Player-initiated stop/idle failed, skipping follow-up');
                    this._processQueuedChat();
                    break;
                }

                // Clear stale crafting queue on any failure
                this.planner.clearCraftingQueue();

                // If farming and task failed, handle recovery
                if (this.goalManager.hasActiveGoal()) {
                    const goal = this.goalManager.getActiveGoal();
                    const isStuck = message.error && message.error.includes('stuck');
                    if (isStuck && goal.resource) {
                        // Stuck while farming — retry MINE at current location (Baritone recalculates path)
                        log.info(`Farming stuck, retrying MINE for ${goal.resource}`);
                        this.sendToMod({
                            type: 'EXECUTE_ACTIONS',
                            taskId: randomUUID(),
                            actions: [{ type: 'MINE', block: `minecraft:${goal.resource}` }],
                            chatResponse: null
                        });
                    } else {
                        log.info(`Farming task failed, exploring to find more ${goal.resource}`);
                        this.sendToMod({
                            type: 'EXECUTE_ACTIONS',
                            taskId: randomUUID(),
                            actions: [{ type: 'EXPLORE' }],
                            chatResponse: `Can't find ${goal.resource} nearby, let me look around...`
                        });
                    }
                    break;
                }

                if (this.pendingGeminiCall) return;
                this.pendingGeminiCall = true;
                try {
                    const plan = await this.planner.planForStuck(this.lastWorldState);
                    if (plan) {
                        this.sendToMod({
                            type: 'EXECUTE_ACTIONS',
                            taskId: randomUUID(),
                            actions: plan.actions,
                            chatResponse: plan.chat_response
                        });
                    }
                } finally {
                    this.pendingGeminiCall = false;
                    this._processQueuedChat();
                }
                break;
            }

            case 'EMERGENCY': {
                // Rate limit: ignore duplicate emergency types within 10 seconds
                const now = Date.now();
                const lastTime = this.lastEmergencyTime[message.emergencyType] || 0;
                if (now - lastTime < 10000) {
                    break;
                }
                this.lastEmergencyTime[message.emergencyType] = now;

                // Skip if no world state available yet
                const emergencyWorldState = message.worldState || this.lastWorldState;
                if (!emergencyWorldState) {
                    log.warn('Emergency ignored — no world state available yet');
                    break;
                }

                // Prevent concurrent emergency Gemini calls
                if (this.pendingEmergencyCall) break;

                log.warn(`Emergency: ${message.emergencyType}`);

                this.pendingEmergencyCall = true;
                try {
                    const plan = await this.planner.planForEmergency(
                        message.emergencyType,
                        emergencyWorldState
                    );
                    if (plan) {
                        const emergencyTaskId = randomUUID();
                        this.emergencyTaskIds.add(emergencyTaskId);
                        setTimeout(() => this.emergencyTaskIds.delete(emergencyTaskId), 300000); // 5 min TTL
                        this.sendToMod({
                            type: 'EXECUTE_ACTIONS',
                            taskId: emergencyTaskId,
                            actions: plan.actions,
                            chatResponse: plan.chat_response
                        });
                    }
                } catch (e) {
                    log.error('Failed to handle emergency:', e.message);
                } finally {
                    this.pendingEmergencyCall = false;
                }
                break;
            }

            default: {
                log.debug(`Unknown message type: ${type}`);
            }
        }
    }

    /**
     * Process a queued chat message after a Gemini call completes.
     */
    _processQueuedChat() {
        if (!this.queuedChatMessage || this.pendingGeminiCall) return;
        const { sender, chatMsg, worldState } = this.queuedChatMessage;
        this.queuedChatMessage = null;
        log.info(`Processing queued chat from "${sender}": "${chatMsg}"`);
        this.handleMessage({ type: 'CHAT_MESSAGE', sender, message: chatMsg, worldState })
            .catch(e => log.error('Error processing queued chat:', e.message));
    }

    /**
     * Detect farming/gathering intent from a chat message and set a persistent goal.
     */
    _detectAndSetGoal(sender, chatMsg, plan) {
        const lower = chatMsg.toLowerCase();

        // Detect farming/gathering intent from the chat message
        const farmMatch = lower.match(/\b(farm|gather|keep\s+mining|continuously\s+mine|harvest)\s+(\w+)/);
        if (farmMatch) {
            const resource = farmMatch[2];
            log.info(`Setting farming goal for resource: ${resource}`);
            this.goalManager.setGoal('farm', { resource }, sender);
            this.planner.antiLoop.reset();
            return;
        }

        // Also detect from Gemini's intent if it mentions farming
        if (plan.intent && plan.intent.toLowerCase().includes('farm')) {
            const mineAction = plan.actions.find(a => a.type === 'MINE');
            if (mineAction && mineAction.block) {
                const resource = mineAction.block.replace('minecraft:', '');
                log.info(`Setting farming goal from plan intent: ${resource}`);
                this.goalManager.setGoal('farm', { resource }, sender);
                this.planner.antiLoop.reset();
            }
        }
    }

    /**
     * Send a STORE_ITEMS action to the mod with base coordinates injected.
     */
    _triggerStoreItems() {
        const base = this.memory.getBase();
        if (!base) {
            log.warn('Cannot store items — no base set');
            return;
        }
        this.sendToMod({
            type: 'EXECUTE_ACTIONS',
            taskId: randomUUID(),
            actions: [{ type: 'STORE_ITEMS', baseX: base.x, baseY: base.y, baseZ: base.z }],
            chatResponse: "Inventory's getting full, heading back to base to store items."
        });
    }

    /**
     * Auto-convert long GOTO actions to NETHER_TRAVEL when nether portals would make the journey shorter.
     * Modifies the actions array in place.
     */
    _convertToNetherTravel(actions, worldState) {
        if (!actions || actions.length === 0 || !worldState) return;

        // Only convert when in the overworld
        if (worldState.dimension && worldState.dimension.includes('the_nether')) return;

        const currentPos = worldState.position;
        if (!currentPos) return;

        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            if (action.type !== 'GOTO' || action.player) continue;
            if (typeof action.x !== 'number' || typeof action.z !== 'number') continue;

            const dx = action.x - currentPos.x;
            const dz = action.z - currentPos.z;
            const directDist = Math.sqrt(dx * dx + dz * dz);

            // Only consider nether travel for long distances
            if (directDist < 500) continue;

            // Find nearest entry portal (from memory pairs + world state nearby portals)
            let entryPortal = this.memory.findNearestOverworldPortal(currentPos.x, currentPos.z, 200);

            // Also check nearby portals from world state (unpaired portals the bot can see)
            if (!entryPortal && worldState.nearbyPortals && worldState.nearbyPortals.length > 0) {
                let nearestDist = 200;
                for (const p of worldState.nearbyPortals) {
                    const d = Math.sqrt((p.x - currentPos.x) ** 2 + (p.z - currentPos.z) ** 2);
                    if (d < nearestDist) {
                        nearestDist = d;
                        // Create a synthetic pair entry (no nether side known yet — skip)
                    }
                }
                // Can't use unpaired portals for auto-conversion (need nether coords)
            }

            if (!entryPortal) continue;

            // Find nearest exit portal pair close to destination
            const exitPair = this.memory.findNearestExitPair(action.x, action.z, 500);
            if (!exitPair) continue;

            // Don't use the same portal pair for entry and exit
            if (entryPortal === exitPair) continue;

            // Calculate nether route distance
            const walkToPortal = Math.sqrt(
                (currentPos.x - entryPortal.overworld.x) ** 2 +
                (currentPos.z - entryPortal.overworld.z) ** 2
            );
            const netherDist = Math.sqrt(
                (entryPortal.nether.x - exitPair.nether.x) ** 2 +
                (entryPortal.nether.z - exitPair.nether.z) ** 2
            );
            const walkFromExit = Math.sqrt(
                (exitPair.overworld.x - action.x) ** 2 +
                (exitPair.overworld.z - action.z) ** 2
            );
            const totalNetherRoute = walkToPortal + netherDist + walkFromExit;

            // Must be at least 30% shorter to justify the complexity
            if (totalNetherRoute < directDist * 0.7) {
                log.info(`Auto-converting GOTO to NETHER_TRAVEL: direct=${Math.round(directDist)}, nether=${Math.round(totalNetherRoute)}`);
                actions[i] = {
                    type: 'NETHER_TRAVEL',
                    portalX: entryPortal.overworld.x,
                    portalY: entryPortal.overworld.y,
                    portalZ: entryPortal.overworld.z,
                    netherTargetX: exitPair.nether.x,
                    netherTargetZ: exitPair.nether.z,
                    destX: action.x,
                    destZ: action.z
                };
            }
        }
    }

    /**
     * Check if the bot should act autonomously (no player commands for 15+ minutes).
     */
    async _checkAutonomy() {
        // Skip if no client connected
        if (!this.clientSocket) return;

        // Skip if idle mode is stay_put (no autonomous tasks)
        if (this.memory.getIdleMode() === 'stay_put') return;

        // Skip if Gemini call in progress
        if (this.pendingGeminiCall) return;

        // Check for expired autonomous goals
        if (this.goalManager.isAutonomousGoal() && this.goalManager.isGoalExpired()) {
            log.info('Autonomous goal expired during autonomy check, clearing');
            this.goalManager.clearGoal();
            this.planner.antiLoop.reset();
            const invAnalysis = InventoryAnalyzer.analyze(this.lastWorldState);
            if (invAnalysis.usedSlots > 5 && this.memory.getBase()) {
                this._triggerStoreItems();
            }
            return;
        }

        // Check if inventory is nearly full during autonomous task
        if (this.goalManager.isAutonomousGoal()) {
            const invAnalysis = InventoryAnalyzer.analyze(this.lastWorldState);
            if (invAnalysis.isNearlyFull && this.memory.getBase()) {
                log.info('Inventory nearly full during autonomous task, storing items');
                this.goalManager.clearGoal();
                this.planner.antiLoop.reset();
                this._triggerStoreItems();
                return;
            }
        }

        // Skip if there's an active goal (farming/autonomous handles its own continuity)
        if (this.goalManager && this.goalManager.hasActiveGoal()) return;

        // Skip if bot is currently executing (not idle)
        if (this.lastWorldState?.currentTaskState &&
            this.lastWorldState.currentTaskState !== 'IDLE') return;

        // Skip if Baritone is actively pathing (e.g., manual Baritone command)
        if (this.lastWorldState?.baritoneActive) return;

        // Check if 15 minutes have passed since last player interaction
        const minutesSincePlayerTask = (Date.now() - this.lastPlayerTaskTime) / 60000;
        if (minutesSincePlayerTask < 15) return;

        log.info(`No player tasks for ${Math.round(minutesSincePlayerTask)} min, starting autonomous task`);

        this.pendingGeminiCall = true;
        try {
            const plan = await this.planner.planForAutonomy(this.lastWorldState);
            if (plan && plan.actions.length > 0 && plan.actions[0].type !== 'IDLE') {
                // Set an autonomous goal with random 30-60 min duration
                const durationMinutes = 30 + Math.floor(Math.random() * 31);
                const mineAction = plan.actions.find(a => a.type === 'MINE');
                if (mineAction && mineAction.block) {
                    const resource = mineAction.block.replace('minecraft:', '');
                    this.goalManager.setGoal('autonomous_task', {
                        resource, durationMinutes
                    }, 'autonomous');
                } else {
                    this.goalManager.setGoal('autonomous_task', {
                        durationMinutes
                    }, 'autonomous');
                }
                this.planner.antiLoop.reset();

                // Auto-convert long GOTO to NETHER_TRAVEL if beneficial
                this._convertToNetherTravel(plan.actions, this.lastWorldState);

                this.sendToMod({
                    type: 'EXECUTE_ACTIONS',
                    taskId: randomUUID(),
                    actions: plan.actions,
                    chatResponse: plan.chat_response
                });
            }
        } finally {
            this.pendingGeminiCall = false;
        }
    }

    sendToMod(message) {
        if (this.clientSocket && this.clientSocket.readyState === 1) {
            this.clientSocket.send(JSON.stringify(message));
            log.debug(`Sent: ${message.type} (task: ${message.taskId || 'n/a'})`);
        } else {
            log.warn('Cannot send to mod — client not connected');
        }
    }

    stop() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.autonomyCheckInterval) clearInterval(this.autonomyCheckInterval);
        if (this.wss) {
            this.wss.close();
            log.info('WebSocket server stopped');
        }
    }
}
