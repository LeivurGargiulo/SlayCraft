package com.baritoneai.tasks;

import com.baritoneai.baritone.BaritoneWrapper;
import com.baritoneai.chat.ChatSender;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ActionExecutor {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Executor");

    private final BaritoneWrapper baritone;
    private final CombatHandler combatHandler;
    private final EatingHandler eatingHandler;
    private CraftingHandler craftingHandler;
    private ElytraHandler elytraHandler;
    private BoatHandler boatHandler;
    private StorageHandler storageHandler;
    private NetherPortalHandler netherPortalHandler;
    private ChestSearchHandler chestSearchHandler;

    private String currentActionType = null;
    private JsonObject currentAction = null;

    public ActionExecutor(BaritoneWrapper baritone, CombatHandler combatHandler, EatingHandler eatingHandler) {
        this.baritone = baritone;
        this.combatHandler = combatHandler;
        this.eatingHandler = eatingHandler;
    }

    public void setCraftingHandler(CraftingHandler craftingHandler) {
        this.craftingHandler = craftingHandler;
    }

    public void setElytraHandler(ElytraHandler elytraHandler) {
        this.elytraHandler = elytraHandler;
    }

    public void setBoatHandler(BoatHandler boatHandler) {
        this.boatHandler = boatHandler;
    }

    public void setStorageHandler(StorageHandler storageHandler) {
        this.storageHandler = storageHandler;
    }

    public void setNetherPortalHandler(NetherPortalHandler netherPortalHandler) {
        this.netherPortalHandler = netherPortalHandler;
    }

    public void setChestSearchHandler(ChestSearchHandler chestSearchHandler) {
        this.chestSearchHandler = chestSearchHandler;
    }

    /**
     * Execute a single action. Must be called on the client thread.
     */
    public void executeAction(JsonObject action) {
        if (action == null || !action.has("type")) {
            LOGGER.warn("Invalid action: null or missing type");
            return;
        }

        String type = action.get("type").getAsString();
        currentActionType = type;
        currentAction = action;
        LOGGER.info("Executing action: {}", type);

        // Ensure execution on the client thread
        Minecraft.getInstance().execute(() -> {
            try {
                switch (type) {
                    case "GOTO" -> executeGoto(action);
                    case "MINE" -> executeMine(action);
                    case "FOLLOW_PLAYER" -> executeFollow(action);
                    case "STOP" -> executeStop();
                    case "EAT" -> executeEat();
                    case "ATTACK_NEAREST_HOSTILE" -> executeAttack();
                    case "BUILD_STRUCTURE" -> executeBuild(action);
                    case "CHAT" -> executeChat(action);
                    case "EXPLORE" -> executeExplore(action);
                    case "IDLE" -> executeIdle();
                    case "CRAFT" -> executeCraft(action);
                    case "FLY_TO" -> executeFlyTo(action);
                    case "BOAT_TO" -> executeBoatTo(action);
                    case "STORE_ITEMS" -> executeStoreItems(action);
                    case "NETHER_TRAVEL" -> executeNetherTravel(action);
                    case "RETRIEVE_FROM_CHEST" -> executeRetrieveFromChest(action);
                    default -> LOGGER.warn("Unknown action type: {}", type);
                }
            } catch (Exception e) {
                LOGGER.error("Error executing action '{}': {}", type, e.getMessage(), e);
            }
        });
    }

    /**
     * Execute a sequence of actions. Currently executes only the first action.
     * Multi-step sequencing is handled by the TaskStateMachine.
     */
    public void executeActions(JsonArray actions) {
        if (actions == null || actions.isEmpty()) {
            LOGGER.warn("No actions to execute");
            return;
        }

        // Execute only the first action; backend will send next action on completion
        executeAction(actions.get(0).getAsJsonObject());
    }

    // ========== Action Implementations ==========

    private void executeGoto(JsonObject action) {
        if (action.has("x") && action.has("y") && action.has("z")) {
            baritone.gotoPosition(
                    action.get("x").getAsDouble(),
                    action.get("y").getAsDouble(),
                    action.get("z").getAsDouble()
            );
        } else if (action.has("x") && action.has("z")) {
            baritone.gotoXZ(
                    action.get("x").getAsInt(),
                    action.get("z").getAsInt()
            );
        } else if (action.has("player")) {
            // Go to a player's position
            String playerName = action.get("player").getAsString();
            Minecraft mc = Minecraft.getInstance();
            if (mc.level != null) {
                mc.level.players().stream()
                        .filter(p -> p.getName().getString().equalsIgnoreCase(playerName))
                        .findFirst()
                        .ifPresent(p -> baritone.gotoNear(p.getX(), p.getY(), p.getZ(), 2));
            }
        } else {
            LOGGER.warn("GOTO action missing coordinates");
        }
    }

    private void executeMine(JsonObject action) {
        if (!action.has("block")) {
            LOGGER.warn("MINE action missing 'block' field");
            return;
        }

        String blockName = action.get("block").getAsString();
        // Ensure minecraft: prefix
        if (!blockName.contains(":")) {
            blockName = "minecraft:" + blockName;
        }

        int quantity = action.has("quantity") ? action.get("quantity").getAsInt() : 0;
        if (quantity > 0) {
            baritone.mine(quantity, blockName);
        } else {
            baritone.mine(blockName);
        }
    }

    private void executeFollow(JsonObject action) {
        if (!action.has("player")) {
            LOGGER.warn("FOLLOW_PLAYER action missing 'player' field");
            return;
        }
        baritone.followPlayer(action.get("player").getAsString());
    }

    private void executeStop() {
        baritone.stop();
        currentActionType = null;
        currentAction = null;
    }

    private void executeEat() {
        if (!eatingHandler.eatBestFood()) {
            LOGGER.warn("Failed to eat - no food available");
        }
    }

    private void executeAttack() {
        combatHandler.attackNearest();
    }

    private void executeBuild(JsonObject action) {
        if (!action.has("schematic")) {
            LOGGER.warn("BUILD_STRUCTURE action missing 'schematic' field");
            return;
        }
        String schematicName = action.get("schematic").getAsString();
        if (!baritone.buildSchematic(schematicName)) {
            LOGGER.warn("Failed to build schematic: {}", schematicName);
            ChatSender.sendChat("I couldn't find a schematic named '" + schematicName + "'. Available schematics: " +
                    String.join(", ", baritone.getAvailableSchematics()));
        }
    }

    private void executeChat(JsonObject action) {
        if (!action.has("message")) {
            LOGGER.warn("CHAT action missing 'message' field");
            return;
        }
        ChatSender.sendChat(action.get("message").getAsString());
    }

    private void executeExplore(JsonObject action) {
        Minecraft mc = Minecraft.getInstance();
        int cx, cz;
        if (action.has("centerX") && action.has("centerZ")) {
            cx = action.get("centerX").getAsInt();
            cz = action.get("centerZ").getAsInt();
        } else if (mc.player != null) {
            cx = (int) mc.player.getX();
            cz = (int) mc.player.getZ();
        } else {
            cx = 0;
            cz = 0;
        }
        baritone.explore(cx, cz);
    }

    private void executeIdle() {
        baritone.stop();
        currentActionType = null;
        currentAction = null;
        LOGGER.info("Going idle");
    }

    private void executeCraft(JsonObject action) {
        if (craftingHandler == null) {
            LOGGER.warn("CraftingHandler not available");
            return;
        }
        if (!action.has("item")) {
            LOGGER.warn("CRAFT action missing 'item' field");
            return;
        }

        String item = action.get("item").getAsString();
        int count = action.has("count") ? action.get("count").getAsInt() : 1;
        boolean needsTable = action.has("needsTable") && action.get("needsTable").getAsBoolean();
        JsonArray grid = action.has("grid") ? action.get("grid").getAsJsonArray() : null;

        craftingHandler.craft(item, count, grid, needsTable);
    }

    private void executeFlyTo(JsonObject action) {
        if (elytraHandler == null) {
            LOGGER.warn("ElytraHandler not available");
            return;
        }
        if (!action.has("x") || !action.has("z")) {
            LOGGER.warn("FLY_TO action missing coordinates");
            return;
        }

        double x = action.get("x").getAsDouble();
        double y = action.has("y") ? action.get("y").getAsDouble() : 100;
        double z = action.get("z").getAsDouble();
        elytraHandler.flyTo(x, y, z);
    }

    private void executeBoatTo(JsonObject action) {
        if (boatHandler == null) {
            LOGGER.warn("BoatHandler not available");
            return;
        }
        if (!action.has("x") || !action.has("z")) {
            LOGGER.warn("BOAT_TO action missing coordinates");
            return;
        }

        double x = action.get("x").getAsDouble();
        double z = action.get("z").getAsDouble();
        boatHandler.boatTo(x, z);
    }

    private void executeStoreItems(JsonObject action) {
        if (storageHandler == null) {
            LOGGER.warn("StorageHandler not available");
            return;
        }

        int baseX = action.has("baseX") ? action.get("baseX").getAsInt() : 0;
        int baseY = action.has("baseY") ? action.get("baseY").getAsInt() : 64;
        int baseZ = action.has("baseZ") ? action.get("baseZ").getAsInt() : 0;

        storageHandler.storeItems(new net.minecraft.core.BlockPos(baseX, baseY, baseZ));
    }

    private void executeNetherTravel(JsonObject action) {
        if (netherPortalHandler == null) {
            LOGGER.warn("NetherPortalHandler not available");
            return;
        }
        if (!action.has("portalX") || !action.has("portalZ") || !action.has("destX") || !action.has("destZ")) {
            LOGGER.warn("NETHER_TRAVEL action missing required coordinates");
            return;
        }

        int portalX = action.get("portalX").getAsInt();
        int portalY = action.has("portalY") ? action.get("portalY").getAsInt() : 64;
        int portalZ = action.get("portalZ").getAsInt();
        int destX = action.get("destX").getAsInt();
        int destZ = action.get("destZ").getAsInt();

        // Nether target: use provided coords or calculate from destination
        int netherTargetX = action.has("netherTargetX") ? action.get("netherTargetX").getAsInt() : destX / 8;
        int netherTargetZ = action.has("netherTargetZ") ? action.get("netherTargetZ").getAsInt() : destZ / 8;

        netherPortalHandler.startNetherTravel(portalX, portalY, portalZ, netherTargetX, netherTargetZ, destX, destZ);
    }

    private void executeRetrieveFromChest(JsonObject action) {
        if (chestSearchHandler == null) {
            LOGGER.warn("ChestSearchHandler not available");
            return;
        }
        if (!action.has("item")) {
            LOGGER.warn("RETRIEVE_FROM_CHEST action missing 'item' field");
            return;
        }

        String item = action.get("item").getAsString();
        if (!item.contains(":")) {
            item = "minecraft:" + item;
        }
        int quantity = action.has("quantity") ? action.get("quantity").getAsInt() : 1;

        chestSearchHandler.searchAndRetrieve(item, quantity, null);
    }

    public String getCurrentActionType() {
        return currentActionType;
    }

    public JsonObject getCurrentAction() {
        return currentAction;
    }
}
