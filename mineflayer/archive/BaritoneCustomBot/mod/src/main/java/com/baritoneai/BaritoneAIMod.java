package com.baritoneai;

import com.baritoneai.ai.TaskStateMachine;
import com.baritoneai.baritone.BaritoneWrapper;
import com.baritoneai.chat.ChatListener;
import com.baritoneai.network.MessageHandler;
import com.baritoneai.network.WebSocketClient;
import com.baritoneai.state.WorldStateCollector;
import com.baritoneai.state.WorldStateSnapshot;
import com.google.gson.JsonObject;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class BaritoneAIMod implements ClientModInitializer {

    public static final String MOD_ID = "baritone-ai";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private BaritoneWrapper baritone;
    private WebSocketClient wsClient;
    private TaskStateMachine stateMachine;
    private ChatListener chatListener;
    private WorldStateCollector stateCollector;
    private boolean initialized = false;

    @Override
    public void onInitializeClient() {
        LOGGER.info("BaritoneAI mod loading...");

        // Create components (but don't connect yet — Baritone isn't ready)
        baritone = new BaritoneWrapper();
        wsClient = new WebSocketClient();
        stateCollector = new WorldStateCollector(baritone);
        stateMachine = new TaskStateMachine(baritone, wsClient, stateCollector);
        chatListener = new ChatListener();

        // Register chat listener for bot mention commands
        chatListener.register((sender, command) -> {
            LOGGER.info("Bot mention from {}: {}", sender, command);

            // Collect current world state to include with the chat message
            WorldStateSnapshot snapshot = stateCollector.collect(
                    stateMachine.getState().name(), null, null
            );
            if (snapshot != null) {
                String message = MessageHandler.buildChatMessage(sender, command, snapshot.toJson());
                wsClient.send(message);
            }
        });

        // Register tick event — this is the main loop
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (client.player != null && client.level != null) {
                // Lazy initialization — Baritone needs the world to be loaded
                if (!initialized) {
                    initializeRuntime();
                }
                stateMachine.tick();
            } else {
                // Player left the world
                if (initialized) {
                    LOGGER.info("Player left world, marking as uninitialized");
                    initialized = false;
                }
            }
        });

        // Clean shutdown when Minecraft closes
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            LOGGER.info("BaritoneAI shutting down...");
            wsClient.disconnect();
        });

        LOGGER.info("BaritoneAI mod loaded — waiting for world to initialize");
    }

    /**
     * Initialize Baritone connection and WebSocket.
     * Called lazily on the first tick where the player is in a world.
     */
    private void initializeRuntime() {
        try {
            baritone.initialize();

            if (!baritone.isInitialized()) {
                LOGGER.warn("Baritone not available — is baritone installed?");
                // Still connect WS so the backend can send chat-only commands
            }

            wsClient.connect(this::handleIncomingMessage);
            initialized = true;
            LOGGER.info("BaritoneAI fully initialized and connected");
        } catch (Exception e) {
            LOGGER.error("Failed to initialize BaritoneAI runtime", e);
        }
    }

    /**
     * Handle messages from the Node.js backend.
     * Called on the WebSocket thread — must dispatch to client thread.
     */
    private void handleIncomingMessage(JsonObject message) {
        String type = MessageHandler.getType(message);
        LOGGER.debug("Received from backend: {}", type);

        // All Minecraft interactions must happen on the client thread
        Minecraft.getInstance().execute(() -> {
            try {
                switch (type) {
                    case MessageHandler.EXECUTE_ACTIONS -> {
                        String taskId = message.has("taskId")
                                ? message.get("taskId").getAsString()
                                : "unknown";
                        var actions = message.has("actions")
                                ? message.getAsJsonArray("actions")
                                : new com.google.gson.JsonArray();
                        String chatResp = message.has("chatResponse")
                                ? message.get("chatResponse").getAsString()
                                : null;
                        stateMachine.handleExecuteActions(taskId, actions, chatResp);
                    }

                    case MessageHandler.STOP -> {
                        stateMachine.handleStop();
                    }

                    case MessageHandler.REQUEST_STATE -> {
                        WorldStateSnapshot snapshot = stateCollector.collect(
                                stateMachine.getState().name(), null, null
                        );
                        if (snapshot != null) {
                            wsClient.send(MessageHandler.buildStateUpdate(snapshot.toJson()));
                        }
                    }

                    case MessageHandler.SET_BASE -> {
                        int x = message.has("x") ? message.get("x").getAsInt() : 0;
                        int y = message.has("y") ? message.get("y").getAsInt() : 64;
                        int z = message.has("z") ? message.get("z").getAsInt() : 0;
                        stateMachine.setBaseLocation(x, y, z);
                        LOGGER.info("Base location set to {}, {}, {}", x, y, z);
                    }

                    case MessageHandler.SET_CONFIG -> {
                        if (message.has("botName")) {
                            String botName = message.get("botName").getAsString();
                            chatListener.setBotName(botName);
                            LOGGER.info("Bot name set to: {}", botName);
                        }
                        if (message.has("idleMode")) {
                            String idleMode = message.get("idleMode").getAsString();
                            stateMachine.setIdleMode(idleMode);
                        }
                    }

                    case MessageHandler.SET_IDLE_MODE -> {
                        if (message.has("mode")) {
                            String mode = message.get("mode").getAsString();
                            stateMachine.setIdleMode(mode);
                        }
                    }

                    default -> LOGGER.warn("Unknown message type from backend: {}", type);
                }
            } catch (Exception e) {
                LOGGER.error("Error handling backend message: {}", e.getMessage(), e);
            }
        });
    }
}
