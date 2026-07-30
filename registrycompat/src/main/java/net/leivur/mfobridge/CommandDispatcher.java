package net.leivur.mfobridge;

import com.google.gson.JsonObject;

import java.util.concurrent.CompletableFuture;

/**
 * Executes one bridge command and produces its response payload. Kept free of any
 * Minecraft-API dependency in the signature so {@link BridgeServer} is testable without a
 * running game client; {@link MinecraftCommandDispatcher} is the implementation that isn't.
 */
public interface CommandDispatcher {
	/**
	 * Completes with the response payload on success, or completes exceptionally (the
	 * exception's message becomes the response's {@code error}) on failure. Unknown command
	 * names must fail, never silently no-op.
	 */
	CompletableFuture<JsonObject> dispatch(String commandName, JsonObject payload);
}
