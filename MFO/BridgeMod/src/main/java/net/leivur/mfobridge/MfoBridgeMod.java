package net.leivur.mfobridge;

import com.google.gson.JsonObject;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.network.DisconnectionDetails;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Entrypoint for the client-side bridge mod: starts {@link BridgeServer} on mod-init (before the
 * client necessarily logs in, per {@code docs/BRIDGE_MOD_PROTOCOL.md}'s process lifecycle) and
 * fires the protocol's three events off Fabric API's connection lifecycle hooks.
 */
public final class MfoBridgeMod implements ClientModInitializer {
	private static final Logger LOGGER = LoggerFactory.getLogger("mfo-bridge");
	private static final int DEFAULT_PORT = 45565;

	/**
	 * Best-effort disconnect-reason capture: there's no public accessor for the reason
	 * {@link DisconnectionDetails} a {@link DisconnectedScreen} was built with, and getting one
	 * precisely would need a Mixin into vanilla's disconnect handling. This reads the screen's
	 * private field via reflection instead — simpler, but only catches disconnects that show a
	 * screen (kicks, connection errors), not a graceful client-initiated quit, hence the
	 * "connectionClosed" fallback below.
	 */
	private final AtomicReference<String> lastDisconnectReason = new AtomicReference<>();

	@Override
	public void onInitializeClient() {
		int port = Integer.getInteger("mfo.bridge.port", DEFAULT_PORT);
		BridgeServer server = new BridgeServer(port, new MinecraftCommandDispatcher(), LOGGER::info);
		try {
			server.start();
		} catch (IOException e) {
			LOGGER.error("failed to start MFO bridge server on port {}", port, e);
			return;
		}

		ScreenEvents.AFTER_INIT.register((client, screen, scaledWidth, scaledHeight) -> {
			if (screen instanceof DisconnectedScreen disconnectedScreen) {
				lastDisconnectReason.set(extractReason(disconnectedScreen));
			}
		});

		ClientPlayConnectionEvents.JOIN.register((handler, sender, client) ->
				server.broadcastEvent("connected", new JsonObject()));

		ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
			String reason = lastDisconnectReason.getAndSet(null);
			JsonObject payload = new JsonObject();
			payload.addProperty("reason", reason != null ? reason : "connectionClosed");
			server.broadcastEvent("disconnected", payload);
		});
	}

	private static String extractReason(DisconnectedScreen screen) {
		try {
			Field detailsField = DisconnectedScreen.class.getDeclaredField("details");
			detailsField.setAccessible(true);
			DisconnectionDetails details = (DisconnectionDetails) detailsField.get(screen);
			return details.reason().getString();
		} catch (ReflectiveOperationException e) {
			LOGGER.warn("could not read disconnect reason off DisconnectedScreen", e);
			return null;
		}
	}
}
