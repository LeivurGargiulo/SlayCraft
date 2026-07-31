package com.bresenham.bot.command;

import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.minecraft.server.command.CommandManager;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;

/**
 * Registers all /bot commands with the Fabric command system.
 */
public class BotCommands {

    private final CommandHandler handler;

    public BotCommands(CommandHandler handler) {
        this.handler = handler;
    }

    public void register() {
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> {
            dispatcher.register(
                CommandManager.literal("bot")
                    .then(CommandManager.literal("start")
                        .executes(ctx -> {
                            ServerPlayerEntity player = ctx.getSource().getPlayer();
                            if (player == null) {
                                return execute(ctx, "This command must be run by a player.");
                            }
                            return execute(ctx, handler.handleStart(player));
                        }))
                    .then(CommandManager.literal("stop")
                        .executes(ctx -> execute(ctx, handler.handleStop())))
                    .then(CommandManager.literal("status")
                        .executes(ctx -> execute(ctx, handler.handleStatus())))
                    .then(CommandManager.literal("pause")
                        .executes(ctx -> execute(ctx, handler.handlePause())))
                    .then(CommandManager.literal("resume")
                        .executes(ctx -> execute(ctx, handler.handleResume())))
                    .then(CommandManager.literal("task")
                        .then(CommandManager.argument("name", StringArgumentType.word())
                            .executes(ctx -> {
                                String taskName = StringArgumentType.getString(ctx, "name");
                                return execute(ctx, handler.handleTask(taskName));
                            })))
                    // AI subcommands
                    .then(CommandManager.literal("ai")
                        .then(CommandManager.literal("status")
                            .executes(ctx -> execute(ctx, handler.handleAiStatus())))
                        .then(CommandManager.literal("enable")
                            .executes(ctx -> execute(ctx, handler.handleAiEnable())))
                        .then(CommandManager.literal("disable")
                            .executes(ctx -> execute(ctx, handler.handleAiDisable())))
                        .then(CommandManager.literal("model")
                            .then(CommandManager.argument("name", StringArgumentType.word())
                                .executes(ctx -> {
                                    String model = StringArgumentType.getString(ctx, "name");
                                    return execute(ctx, handler.handleAiModel(model));
                                })))
                        .then(CommandManager.literal("ask")
                            .then(CommandManager.argument("question", StringArgumentType.greedyString())
                                .executes(ctx -> {
                                    String question = StringArgumentType.getString(ctx, "question");
                                    return execute(ctx, handler.handleAiAsk(question));
                                }))))
            );
        });
    }

    private int execute(CommandContext<ServerCommandSource> ctx, String message) {
        ctx.getSource().sendFeedback(() -> Text.literal(message), false);
        return 1;
    }
}
