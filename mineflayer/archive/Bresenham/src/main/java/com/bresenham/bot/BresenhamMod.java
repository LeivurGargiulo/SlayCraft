package com.bresenham.bot;

import com.bresenham.bot.ai.AdvisorIntegration;
import com.bresenham.bot.ai.GeminiAdvisor;
import com.bresenham.bot.ai.GeminiAdvisorImpl;
import com.bresenham.bot.ai.GeminiConfig;
import com.bresenham.bot.api.BotApiImpl;
import com.bresenham.bot.api.TaskFactory;
import com.bresenham.bot.command.BotCommands;
import com.bresenham.bot.command.CommandHandler;
import com.bresenham.bot.controller.BotController;
import com.bresenham.bot.controller.BotManager;
import com.bresenham.bot.executor.BaritoneActionExecutor;
import com.bresenham.bot.persistence.BotState;
import com.bresenham.bot.persistence.JsonPersistenceManager;
import com.bresenham.bot.persistence.PersistenceManager;
import com.bresenham.bot.planner.DependencyPlanner;
import com.bresenham.bot.planner.rules.ToolRequirementRule;
import com.bresenham.bot.reactive.ReactiveSystem;
import com.bresenham.bot.reactive.rules.EnemyNearbyRule;
import com.bresenham.bot.reactive.rules.LowHealthRule;
import com.bresenham.bot.reactive.rules.ToolBreakRule;
import com.bresenham.bot.state.WorldState;
import com.bresenham.bot.task.TaskManager;
import com.bresenham.bot.task.impl.CraftPickaxeTask;
import com.bresenham.bot.task.impl.MineIronTask;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;

/**
 * Main entrypoint for the Bresenham Bot mod.
 * Initializes all subsystems and wires them together.
 */
public class BresenhamMod implements ModInitializer {

    public static final String MOD_ID = "bresenham-bot";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private BotManager botManager;
    private GeminiAdvisorImpl geminiAdvisor;
    private PersistenceManager persistenceManager;

    @Override
    public void onInitialize() {
        LOGGER.info("[Bresenham] Initializing Bresenham Bot System...");

        // --- Core Systems ---
        WorldState worldState = new WorldState();
        TaskManager taskManager = new TaskManager();

        // --- Reactive System ---
        ReactiveSystem reactiveSystem = new ReactiveSystem();
        reactiveSystem.addRule(new ToolBreakRule());
        reactiveSystem.addRule(new LowHealthRule());
        reactiveSystem.addRule(new EnemyNearbyRule());

        // --- Planner ---
        DependencyPlanner planner = new DependencyPlanner();
        planner.addRule(new ToolRequirementRule());

        // --- Action Executor ---
        // Initialized with null player; will be set when bot starts for a player
        BaritoneActionExecutor actionExecutor = new BaritoneActionExecutor(null);

        // --- Gemini AI Advisory ---
        Path configDir = FabricLoader.getInstance().getConfigDir();
        GeminiConfig geminiConfig = GeminiConfig.loadOrCreate(configDir);
        geminiAdvisor = new GeminiAdvisorImpl(geminiConfig);
        AdvisorIntegration advisorIntegration = new AdvisorIntegration(geminiAdvisor, geminiConfig);

        // --- Bot Controller ---
        BotController controller = new BotController(
                worldState, taskManager, reactiveSystem, actionExecutor, advisorIntegration
        );

        // --- Bot Manager ---
        botManager = new BotManager();

        // --- Task Factory ---
        TaskFactory taskFactory = new TaskFactory();
        taskFactory.registerTask("mine_iron", MineIronTask::new);
        taskFactory.registerTask("craft_pickaxe", CraftPickaxeTask::new);

        // --- API ---
        BotApiImpl botApi = new BotApiImpl(controller, taskManager, taskFactory, planner, worldState);

        // --- Commands ---
        CommandHandler commandHandler = new CommandHandler(botApi, geminiAdvisor, geminiConfig);
        BotCommands botCommands = new BotCommands(commandHandler);
        botCommands.register();

        // --- Server Lifecycle Events ---
        ServerTickEvents.END_SERVER_TICK.register(server -> {
            botManager.tickAll();
            // Also tick the primary controller if not managed via botManager
            if (botManager.getControllerCount() == 0) {
                // Auto-assign first player if no player set yet
                if (controller.getPlayer() == null && !server.getPlayerManager().getPlayerList().isEmpty()) {
                    controller.setPlayer(server.getPlayerManager().getPlayerList().get(0));
                    LOGGER.info("[Bresenham] Auto-assigned player: {}",
                            server.getPlayerManager().getPlayerList().get(0).getName().getString());
                }
                if (controller.isRunning()) {
                    controller.tick();
                }
            }
        });

        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            // Initialize persistence with world directory
            Path worldDir = server.getSavePath(net.minecraft.util.WorldSavePath.ROOT);
            persistenceManager = new JsonPersistenceManager(worldDir);

            // Load saved state if available
            BotState savedState = persistenceManager.load();
            if (savedState != null) {
                LOGGER.info("[Bresenham] Restored saved bot state (task: {}, running: {})",
                        savedState.getCurrentTaskName(), savedState.isBotRunning());
            }
        });

        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            // Save state before shutdown
            if (persistenceManager != null && controller.isRunning()) {
                BotState state = new BotState();
                state.setBotRunning(controller.isRunning());
                if (taskManager.getCurrentTask() != null) {
                    state.setCurrentTaskName(taskManager.getCurrentTask().getName());
                    state.setCurrentStepIndex(taskManager.getCurrentTask().getCurrentStepIndex());
                    state.setTaskState(taskManager.getCurrentTask().getState());
                }
                if (worldState.getPosition() != null) {
                    state.setPosX(worldState.getPosition().getX());
                    state.setPosY(worldState.getPosition().getY());
                    state.setPosZ(worldState.getPosition().getZ());
                }
                state.setHealth(worldState.getHealth());
                state.setHunger(worldState.getHunger());
                persistenceManager.save(state);
            }

            // Shutdown AI advisor
            if (geminiAdvisor != null) {
                geminiAdvisor.shutdown();
            }

            // Shutdown bot manager
            botManager.shutdownAll();

            LOGGER.info("[Bresenham] Bresenham Bot System shut down.");
        });

        LOGGER.info("[Bresenham] Bresenham Bot System initialized successfully.");
        LOGGER.info("[Bresenham] Registered tasks: {}", taskFactory.getAvailableTaskNames());
        LOGGER.info("[Bresenham] Registered reactive rules: {}",
                reactiveSystem.getRules().stream().map(r -> r.getName()).toList());
        LOGGER.info("[Bresenham] AI advisory: {}",
                geminiAdvisor.isAvailable() ? "available" : "not configured (set API key in config/bresenham/gemini.json)");
    }
}
