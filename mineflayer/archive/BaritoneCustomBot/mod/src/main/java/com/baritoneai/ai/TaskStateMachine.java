package com.baritoneai.ai;

import com.baritoneai.baritone.BaritoneWrapper;
import com.baritoneai.baritone.PathingHelper;
import com.baritoneai.chat.ChatSender;
import com.baritoneai.network.MessageHandler;
import com.baritoneai.network.WebSocketClient;
import com.baritoneai.state.WorldStateCollector;
import com.baritoneai.state.WorldStateSnapshot;
import com.baritoneai.tasks.*;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class TaskStateMachine {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-StateMachine");

    // Tick intervals
    private static final int STATE_UPDATE_INTERVAL = 10;     // 500ms
    private static final int STUCK_THRESHOLD_TICKS = 200;    // 10 seconds
    private static final int COMBAT_CHECK_INTERVAL = 4;      // Every 4 ticks
    private static final int LOW_HEALTH_THRESHOLD = 6;       // 3 hearts
    private static final int EQUIP_CHECK_INTERVAL = 40;      // Every 2 seconds
    private static final int IDLE_WANDER_THRESHOLD = 600;    // 30 seconds before wandering
    private static final int IDLE_WANDER_MAX_DURATION = 200; // 10 seconds max wander time
    private static final int COMPLETION_CONFIRM_THRESHOLD = 5; // 250ms debounce for completion detection
    private static final int BASE_WANDER_RADIUS = 50;        // Stay within 50 blocks of base
    private static final int MAX_STUCK_RETRIES = 2;           // Retry before failing on stuck

    private final BaritoneWrapper baritone;
    private final ActionExecutor executor;
    private final CombatHandler combatHandler;
    private final EatingHandler eatingHandler;
    private final EquipmentHandler equipmentHandler;
    private final CraftingHandler craftingHandler;
    private final ElytraHandler elytraHandler;
    private final BoatHandler boatHandler;
    private final StorageHandler storageHandler;
    private final NetherPortalHandler netherPortalHandler;
    private final ChestSearchHandler chestSearchHandler;
    private final WebSocketClient wsClient;
    private final WorldStateCollector stateCollector;

    // Base location
    private BlockPos baseLocation = null;

    // Idle mode: "autonomous" (wander + autonomous tasks) or "stay_put" (stay in place)
    private String idleMode = "autonomous";

    // State
    private TaskState state = TaskState.IDLE;
    private String currentTaskId = null;
    private String currentTaskType = null;
    private String currentTaskDescription = null;
    private JsonObject previousTask = null;

    // Counters
    private int stateUpdateCounter = 0;
    private int combatCheckCounter = 0;
    private int completionCheckDelay = 0;
    private int completionConfirmTicks = 0;
    private int equipCheckCounter = 0;
    private boolean combatEmergencySent = false;
    private boolean lowHealthEmergencySent = false;
    private int stuckRetryCount = 0;

    // Idle wander
    private int idleTicks = 0;
    private boolean isIdleWandering = false;
    private int idleWanderTicks = 0;

    public TaskStateMachine(BaritoneWrapper baritone, WebSocketClient wsClient, WorldStateCollector stateCollector) {
        this.baritone = baritone;
        this.wsClient = wsClient;
        this.stateCollector = stateCollector;
        this.combatHandler = new CombatHandler();
        this.eatingHandler = new EatingHandler();
        this.equipmentHandler = new EquipmentHandler();
        this.craftingHandler = new CraftingHandler(baritone);
        this.elytraHandler = new ElytraHandler(equipmentHandler);
        this.boatHandler = new BoatHandler();
        this.storageHandler = new StorageHandler(baritone);
        this.netherPortalHandler = new NetherPortalHandler(baritone);
        this.chestSearchHandler = new ChestSearchHandler(baritone);
        this.combatHandler.setEquipmentHandler(equipmentHandler);
        this.executor = new ActionExecutor(baritone, combatHandler, eatingHandler);
        this.executor.setCraftingHandler(craftingHandler);
        this.executor.setElytraHandler(elytraHandler);
        this.executor.setBoatHandler(boatHandler);
        this.executor.setStorageHandler(storageHandler);
        this.executor.setNetherPortalHandler(netherPortalHandler);
        this.executor.setChestSearchHandler(chestSearchHandler);
    }

    /**
     * Called every client tick (20 times/second). This is the main loop.
     */
    public void tick() {
        if (!baritone.isInitialized()) return;

        // Skip all processing if player is dead
        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null && mc.player.getHealth() <= 0) {
            if (state == TaskState.EXECUTING) {
                LOGGER.info("Player died, cancelling current task");
                baritone.stop();
                notifyTaskFailed("Bot died");
                resetTask();
            }
            return;
        }

        // Always tick sub-handlers
        combatHandler.tick();
        eatingHandler.tick();
        craftingHandler.tick();
        elytraHandler.tick();
        boatHandler.tick();
        storageHandler.tick();
        netherPortalHandler.tick();
        chestSearchHandler.tick();

        // Check if in transport mode (suppress combat/eating interrupts)
        // For nether portal: only suppress during portal-entering phases, not during nether navigation
        boolean inTransport = elytraHandler.isActive() || boatHandler.isActive() || storageHandler.isStoring()
                || netherPortalHandler.isInPortal() || chestSearchHandler.isSearching();

        // Priority 1: Combat interrupts (suppressed during transport)
        if (!inTransport) {
            combatCheckCounter++;
            if (combatCheckCounter >= COMBAT_CHECK_INTERVAL) {
                combatCheckCounter = 0;
                handleCombatCheck();
            }
        }

        // Priority 2: Eating when hungry (suppressed during transport and combat)
        if ((state == TaskState.EXECUTING || state == TaskState.IDLE) && !combatHandler.isInCombat() && !inTransport) {
            handleEatingCheck();
        }

        // Auto-equip best gear periodically
        equipCheckCounter++;
        if (equipCheckCounter >= EQUIP_CHECK_INTERVAL) {
            equipCheckCounter = 0;
            equipmentHandler.tick();
        }

        // Priority 3: Recovery from interrupts
        if (state == TaskState.INTERRUPTED) {
            handleInterruptRecovery();
        }

        // Priority 4: Task completion detection
        if (state == TaskState.EXECUTING) {
            handleCompletionCheck();
        }

        // Priority 5: Stuck detection
        if (state == TaskState.EXECUTING) {
            handleStuckCheck();
        } else {
            PathingHelper.resetStuckDetection();
        }

        // Priority 6: Low health emergency (send only once per episode)
        if (state == TaskState.EXECUTING && PathingHelper.isLowHealth(LOW_HEALTH_THRESHOLD)) {
            if (!lowHealthEmergencySent) {
                lowHealthEmergencySent = true;
                handleLowHealth();
            }
        } else {
            lowHealthEmergencySent = false;
        }

        // Priority 7: Idle wander — explore nearby when idle too long
        if (state == TaskState.IDLE) {
            idleTicks++;
            if (!isIdleWandering && idleTicks >= IDLE_WANDER_THRESHOLD && wsClient.isConnected()) {
                // Don't override manual Baritone commands — only wander if Baritone is truly idle
                if (!baritone.hasActiveProcess() && !baritone.isPathing()) {
                    startIdleWander();
                } else {
                    idleTicks = 0; // Reset timer, check again later
                    LOGGER.debug("Idle wander deferred - Baritone has active process (manual command?)");
                }
            }
            if (isIdleWandering) {
                idleWanderTicks++;
                if (idleWanderTicks >= IDLE_WANDER_MAX_DURATION) {
                    // Wander time limit reached, stop and reset
                    baritone.stop();
                    isIdleWandering = false;
                    idleTicks = 0;
                    idleWanderTicks = 0;
                    LOGGER.debug("Idle wander timed out, resetting");
                } else if (!baritone.hasActiveProcess() && !baritone.isPathing()) {
                    // Baritone finished early
                    isIdleWandering = false;
                    idleTicks = 0;
                    idleWanderTicks = 0;
                    LOGGER.debug("Idle wander completed early, resetting");
                }
            }
        } else {
            idleTicks = 0;
            isIdleWandering = false;
            idleWanderTicks = 0;
        }

        // Throttled state updates to backend
        stateUpdateCounter++;
        if (stateUpdateCounter >= STATE_UPDATE_INTERVAL) {
            stateUpdateCounter = 0;
            sendStateUpdate();
        }
    }

    // ========== Incoming Message Handlers ==========

    /**
     * Handle EXECUTE_ACTIONS message from backend.
     */
    public void handleExecuteActions(String taskId, JsonArray actions, String chatResponse) {
        LOGGER.info("Received task {} with {} action(s)", taskId, actions.size());

        // Reset idle wander state — new task preempts wandering
        this.idleTicks = 0;
        this.isIdleWandering = false;
        this.idleWanderTicks = 0;

        // Send chat response if provided
        if (chatResponse != null && !chatResponse.isEmpty()) {
            ChatSender.sendChat(chatResponse);
        }

        if (actions.isEmpty()) {
            LOGGER.info("No actions in task, staying idle");
            return;
        }

        // Stop any current activity before starting new task (including idle wander)
        if (state == TaskState.EXECUTING || isIdleWandering) {
            baritone.stop();
        }

        this.currentTaskId = taskId;
        this.state = TaskState.EXECUTING;
        this.completionCheckDelay = 10; // Wait 10 ticks before checking completion
        this.completionConfirmTicks = 0;
        PathingHelper.resetStuckDetection();

        // Extract task type from first action
        JsonObject firstAction = actions.get(0).getAsJsonObject();
        this.currentTaskType = firstAction.has("type") ? firstAction.get("type").getAsString() : "UNKNOWN";
        this.currentTaskDescription = describeAction(firstAction);

        executor.executeActions(actions);
    }

    /**
     * Handle STOP message from backend.
     */
    public void handleStop() {
        LOGGER.info("Received STOP command");
        baritone.stop();
        this.state = TaskState.IDLE;
        this.currentTaskId = null;
        this.currentTaskType = null;
        this.currentTaskDescription = null;
        this.previousTask = null;
        this.idleTicks = 0;
        this.isIdleWandering = false;
        this.idleWanderTicks = 0;
        combatHandler.resetCombat();
        storageHandler.reset();
        netherPortalHandler.reset();
        completionConfirmTicks = 0;
        combatEmergencySent = false;
        lowHealthEmergencySent = false;
        PathingHelper.resetStuckDetection();
    }

    // ========== Internal State Handlers ==========

    private void handleCombatCheck() {
        if (state != TaskState.EXECUTING && state != TaskState.IDLE) return;

        if (combatHandler.checkForThreats()) {
            if (state == TaskState.EXECUTING) {
                LOGGER.info("Combat interrupt! Saving current task and engaging hostile");
                previousTask = saveCurrentTask();
                baritone.stop();
                state = TaskState.INTERRUPTED;
            }
            combatHandler.attackNearest();
            // Only send one emergency per combat encounter to avoid chat spam
            if (!combatEmergencySent) {
                combatEmergencySent = true;
                sendEmergency("HOSTILE_DETECTED");
            }
        } else {
            // Reset flag when no threats are present
            combatEmergencySent = false;
        }
    }

    private void handleEatingCheck() {
        if (eatingHandler.shouldEat() && eatingHandler.hasFood()) {
            LOGGER.info("Hunger interrupt! Pausing to eat");
            if (state == TaskState.EXECUTING) {
                previousTask = saveCurrentTask();
                baritone.stop();
            }
            state = TaskState.INTERRUPTED;
            eatingHandler.eatBestFood();
        }
    }

    private void handleInterruptRecovery() {
        boolean combatOver = !combatHandler.isInCombat() && !combatHandler.checkForThreats();
        boolean eatingDone = !eatingHandler.isEating();

        if (combatOver && eatingDone) {
            if (previousTask != null) {
                LOGGER.info("Resuming previous task after interrupt");
                state = TaskState.EXECUTING;
                completionCheckDelay = 10;
                PathingHelper.resetStuckDetection();
                executor.executeAction(previousTask);
                previousTask = null;
            } else {
                LOGGER.info("No previous task to resume, going idle");
                state = TaskState.IDLE;
            }
        } else if (combatHandler.checkForThreats()) {
            // Still in combat, keep fighting
            combatHandler.attackNearest();
        }
    }

    private void handleCompletionCheck() {
        // Wait a few ticks after starting before checking completion
        // This prevents false positives from Baritone startup delay
        if (completionCheckDelay > 0) {
            completionCheckDelay--;
            return;
        }

        // Check storage completion/failure
        if (storageHandler.isDone()) {
            LOGGER.info("Storage task {} completed", currentTaskId);
            storageHandler.reset();
            state = TaskState.COMPLETED;
            notifyTaskComplete();
            resetTask();
            return;
        }
        if (storageHandler.hasFailed()) {
            LOGGER.warn("Storage task {} failed", currentTaskId);
            storageHandler.reset();
            state = TaskState.FAILED;
            notifyTaskFailed("Item storage failed");
            resetTask();
            return;
        }

        // Check crafting completion/failure
        if (craftingHandler.isDone()) {
            LOGGER.info("Crafting task {} completed", currentTaskId);
            craftingHandler.reset();
            state = TaskState.COMPLETED;
            notifyTaskComplete();
            resetTask();
            return;
        }
        if (craftingHandler.hasFailed()) {
            LOGGER.warn("Crafting task {} failed: {}", currentTaskId, craftingHandler.getFailReason());
            craftingHandler.reset();
            state = TaskState.FAILED;
            notifyTaskFailed("Crafting failed: " + craftingHandler.getFailReason());
            resetTask();
            return;
        }

        // Check elytra flight completion/failure
        if (elytraHandler.isDone()) {
            LOGGER.info("Flight task {} completed", currentTaskId);
            elytraHandler.reset();
            state = TaskState.COMPLETED;
            notifyTaskComplete();
            resetTask();
            return;
        }
        if (elytraHandler.hasFailed()) {
            LOGGER.warn("Flight task {} failed", currentTaskId);
            elytraHandler.reset();
            state = TaskState.FAILED;
            notifyTaskFailed("Elytra flight failed");
            resetTask();
            return;
        }

        // Check boat travel completion/failure
        if (boatHandler.isDone()) {
            LOGGER.info("Boat task {} completed", currentTaskId);
            boatHandler.reset();
            state = TaskState.COMPLETED;
            notifyTaskComplete();
            resetTask();
            return;
        }
        if (boatHandler.hasFailed()) {
            LOGGER.warn("Boat task {} failed", currentTaskId);
            boatHandler.reset();
            state = TaskState.FAILED;
            notifyTaskFailed("Boat travel failed");
            resetTask();
            return;
        }

        // Check nether portal travel completion/failure
        if (netherPortalHandler.isDone()) {
            LOGGER.info("Nether travel task {} completed", currentTaskId);
            netherPortalHandler.reset();
            state = TaskState.COMPLETED;
            notifyTaskComplete();
            resetTask();
            return;
        }
        if (netherPortalHandler.hasFailed()) {
            LOGGER.warn("Nether travel task {} failed", currentTaskId);
            netherPortalHandler.reset();
            state = TaskState.FAILED;
            notifyTaskFailed("Nether portal travel failed");
            resetTask();
            return;
        }

        // Check chest search completion/failure
        if (chestSearchHandler.isDone()) {
            LOGGER.info("Chest search task {} completed", currentTaskId);
            chestSearchHandler.reset();
            state = TaskState.COMPLETED;
            notifyTaskComplete();
            resetTask();
            return;
        }
        if (chestSearchHandler.hasFailed()) {
            LOGGER.warn("Chest search task {} failed: {}", currentTaskId, chestSearchHandler.getFailReason());
            chestSearchHandler.reset();
            state = TaskState.FAILED;
            notifyTaskFailed("Chest search failed: " + chestSearchHandler.getFailReason());
            resetTask();
            return;
        }

        // Skip Baritone check if a non-Baritone handler is active
        if (craftingHandler.isCrafting() || elytraHandler.isActive() || boatHandler.isActive() || storageHandler.isStoring() || netherPortalHandler.isActive() || chestSearchHandler.isSearching()) {
            return;
        }

        // A task is complete when Baritone has no active process and isn't pathing
        // for COMPLETION_CONFIRM_THRESHOLD consecutive ticks (debounce brief recalculation gaps)
        if (!baritone.hasActiveProcess() && !baritone.isPathing()) {
            completionConfirmTicks++;
            if (completionConfirmTicks >= COMPLETION_CONFIRM_THRESHOLD) {
                LOGGER.info("Task {} completed (confirmed after {} ticks)", currentTaskId, completionConfirmTicks);
                state = TaskState.COMPLETED;
                notifyTaskComplete();
                resetTask();
            }
        } else {
            completionConfirmTicks = 0;
        }
    }

    private void handleStuckCheck() {
        if (PathingHelper.isStuck(STUCK_THRESHOLD_TICKS)) {
            if (stuckRetryCount < MAX_STUCK_RETRIES) {
                stuckRetryCount++;
                LOGGER.info("Bot stuck, attempting recovery (attempt {}/{})", stuckRetryCount, MAX_STUCK_RETRIES);
                baritone.stop();
                PathingHelper.resetStuckDetection();

                // Jump to break free from minor obstacles
                Minecraft mc = Minecraft.getInstance();
                if (mc.player != null && mc.player.onGround()) {
                    mc.player.jumpFromGround();
                }

                // Re-execute the same action (Baritone will recalculate path)
                JsonObject currentAction = executor.getCurrentAction();
                if (currentAction != null) {
                    executor.executeAction(currentAction);
                } else {
                    // No action to retry — fail immediately
                    LOGGER.warn("Bot stuck with no action to retry, failing task");
                    baritone.stop();
                    state = TaskState.FAILED;
                    notifyTaskFailed("Bot is stuck and not making progress");
                    resetTask();
                }
            } else {
                LOGGER.warn("Bot stuck after {} retries, failing task", MAX_STUCK_RETRIES);
                baritone.stop();
                state = TaskState.FAILED;
                notifyTaskFailed("Bot is stuck and not making progress");
                resetTask();
            }
        }
    }

    private void handleLowHealth() {
        // Already handled if in combat, but add emergency notification
        sendEmergency("LOW_HEALTH");
    }

    // ========== Notifications ==========

    private void sendStateUpdate() {
        if (!wsClient.isConnected()) return;

        WorldStateSnapshot snapshot = stateCollector.collect(
                state.name(), currentTaskType, currentTaskDescription
        );
        if (snapshot != null) {
            wsClient.send(MessageHandler.buildStateUpdate(snapshot.toJson()));
        }
    }

    private void notifyTaskComplete() {
        wsClient.send(MessageHandler.buildTaskComplete(currentTaskId, "completed"));
    }

    private void notifyTaskFailed(String error) {
        wsClient.send(MessageHandler.buildTaskFailed(currentTaskId, error));
    }

    private void sendEmergency(String type) {
        WorldStateSnapshot snapshot = stateCollector.collect(
                state.name(), currentTaskType, currentTaskDescription
        );
        if (snapshot != null) {
            wsClient.send(MessageHandler.buildEmergency(type, snapshot.toJson()));
        }
    }

    // ========== Base Location ==========

    public void setBaseLocation(int x, int y, int z) {
        this.baseLocation = new BlockPos(x, y, z);
        LOGGER.info("Base location set to {}, {}, {}", x, y, z);
    }

    public BlockPos getBaseLocation() {
        return baseLocation;
    }

    // ========== Idle Mode ==========

    public void setIdleMode(String mode) {
        this.idleMode = mode;
        LOGGER.info("Idle mode set to: {}", mode);
    }

    // ========== Idle Wander ==========

    private void startIdleWander() {
        // If idle mode is stay_put, don't wander at all
        if ("stay_put".equals(idleMode)) {
            idleTicks = 0; // Reset so we don't keep checking
            return;
        }

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        LOGGER.info("Idle for {}s, starting short-range wander", IDLE_WANDER_THRESHOLD / 20);
        isIdleWandering = true;
        idleWanderTicks = 0;

        if (baseLocation != null) {
            // Base-aware wander: if too far from base, navigate back; otherwise explore near base
            double distToBase = mc.player.blockPosition().distSqr(baseLocation);
            if (distToBase > BASE_WANDER_RADIUS * BASE_WANDER_RADIUS) {
                LOGGER.info("Too far from base ({} blocks), navigating back", (int) Math.sqrt(distToBase));
                baritone.gotoPosition(baseLocation.getX(), baseLocation.getY(), baseLocation.getZ());
            } else {
                baritone.explore(baseLocation.getX(), baseLocation.getZ());
            }
        } else {
            // No base set — explore centered on current position
            int cx = (int) mc.player.getX();
            int cz = (int) mc.player.getZ();
            baritone.explore(cx, cz);
        }
    }

    // ========== Helpers ==========

    private JsonObject saveCurrentTask() {
        // Prefer the full action with all parameters (coordinates, block name, etc.)
        JsonObject action = executor.getCurrentAction();
        if (action != null) return action.deepCopy();

        // Fallback: type-only (for actions that don't need parameters)
        if (executor.getCurrentActionType() == null) return null;
        JsonObject task = new JsonObject();
        task.addProperty("type", executor.getCurrentActionType());
        return task;
    }

    private void resetTask() {
        state = TaskState.IDLE;
        currentTaskId = null;
        currentTaskType = null;
        currentTaskDescription = null;
        completionConfirmTicks = 0;
        stuckRetryCount = 0;
        PathingHelper.resetStuckDetection();
    }

    private String describeAction(JsonObject action) {
        String type = action.has("type") ? action.get("type").getAsString() : "UNKNOWN";
        return switch (type) {
            case "GOTO" -> {
                if (action.has("x") && action.has("z")) {
                    yield "Going to " + action.get("x").getAsInt() + ", " + action.get("z").getAsInt();
                }
                yield "Navigating to target";
            }
            case "MINE" -> "Mining " + (action.has("block") ? action.get("block").getAsString() : "blocks");
            case "FOLLOW_PLAYER" -> "Following " + (action.has("player") ? action.get("player").getAsString() : "player");
            case "EXPLORE" -> "Exploring the area";
            case "BUILD_STRUCTURE" -> "Building " + (action.has("schematic") ? action.get("schematic").getAsString() : "structure");
            case "EAT" -> "Eating food";
            case "ATTACK_NEAREST_HOSTILE" -> "Attacking hostile mob";
            case "CRAFT" -> "Crafting " + (action.has("item") ? action.get("item").getAsString() : "item");
            case "FLY_TO" -> "Flying to target";
            case "BOAT_TO" -> "Boating to target";
            case "STORE_ITEMS" -> "Storing items in chests at base";
            case "NETHER_TRAVEL" -> "Traveling via nether portal";
            default -> type;
        };
    }

    public TaskState getState() {
        return state;
    }
}
