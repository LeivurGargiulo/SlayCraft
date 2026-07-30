package net.leivur.mfobridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.NativeImage;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

import java.io.File;
import java.io.IOException;
import java.util.Iterator;
import java.util.Queue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.function.Supplier;

/**
 * Implements the six bridge commands per {@code docs/BRIDGE_MOD_PROTOCOL.md}'s "Client-side mod
 * responsibilities" against verified 1.21.11 Mojang-mapped APIs. Every mutation here is one a
 * real player's client already performs on its own (issuing a command, opening a container the
 * server would let them open, reading a menu the server already sent) — there is no click-slot,
 * movement, or attack path anywhere in this class.
 */
public final class MinecraftCommandDispatcher implements CommandDispatcher {
	/** Vanilla convention: every stock container menu appends the 36-slot player inventory after its own slots. */
	private static final int PLAYER_INVENTORY_SLOTS = 36;
	private static final double TELEPORT_TOLERANCE_BLOCKS = 0.5;
	private static final long TELEPORT_TIMEOUT_MS = 10_000;
	private static final long CONTAINER_OPEN_TIMEOUT_MS = 5_000;

	/**
	 * Commands that need to wait across multiple client ticks (teleport confirmation, a
	 * container's open-screen packet) register a check here instead of a fresh tick listener
	 * each time — Fabric's {@code Event} has no de-registration, so one persistent drain avoids
	 * leaking a listener per call.
	 */
	private final Queue<PendingCheck> pendingChecks = new ConcurrentLinkedQueue<>();

	public MinecraftCommandDispatcher() {
		ClientTickEvents.END_CLIENT_TICK.register(client -> drainPendingChecks());
	}

	@Override
	public CompletableFuture<JsonObject> dispatch(String commandName, JsonObject payload) {
		return switch (commandName) {
			case "teleport" -> teleport(payload);
			case "look" -> look(payload);
			case "queryEntities" -> queryEntities(payload);
			case "queryBlock" -> queryBlock(payload);
			case "readContainer" -> readContainer(payload);
			case "captureScreenshot" -> captureScreenshot(payload);
			default -> CompletableFuture.failedFuture(new IllegalArgumentException("unknown command: " + commandName));
		};
	}

	private CompletableFuture<JsonObject> teleport(JsonObject payload) {
		String dimension = payload.get("dimension").getAsString();
		double x = payload.get("x").getAsDouble();
		double y = payload.get("y").getAsDouble();
		double z = payload.get("z").getAsDouble();
		String targetDimensionId = "minecraft:" + dimension;

		CompletableFuture<JsonObject> future = new CompletableFuture<>();
		Minecraft.getInstance().execute(() -> {
			LocalPlayer player = Minecraft.getInstance().player;
			if (player == null) {
				future.completeExceptionally(new IllegalStateException("not connected to a world"));
				return;
			}
			// Identical to a player typing this in chat — TeleportService already builds this
			// exact command string against the mineflayer path (mineflayer-manager-client.ts).
			player.connection.sendCommand("execute in " + targetDimensionId + " run tp @s " + x + " " + y + " " + z);
			pendingChecks.add(new PendingCheck(
					future,
					() -> pollTeleportConfirmed(targetDimensionId, x, y, z),
					deadlineNanos(TELEPORT_TIMEOUT_MS),
					"teleport timed out"));
		});
		return future;
	}

	private JsonObject pollTeleportConfirmed(String targetDimensionId, double x, double y, double z) {
		Minecraft client = Minecraft.getInstance();
		LocalPlayer player = client.player;
		ClientLevel level = client.level;
		if (player == null || level == null) {
			return null; // still mid dimension-swap; keep waiting
		}
		if (!level.dimension().identifier().toString().equals(targetDimensionId)) {
			return null;
		}
		double dx = player.getX() - x;
		double dy = player.getY() - y;
		double dz = player.getZ() - z;
		if (dx * dx + dy * dy + dz * dz > TELEPORT_TOLERANCE_BLOCKS * TELEPORT_TOLERANCE_BLOCKS) {
			return null;
		}
		return new JsonObject();
	}

	private CompletableFuture<JsonObject> look(JsonObject payload) {
		float yawDegrees = (float) payload.get("yawDegrees").getAsDouble();
		float pitchDegrees = (float) payload.get("pitchDegrees").getAsDouble();
		return Minecraft.getInstance().submit(() -> {
			LocalPlayer player = requirePlayer();
			// No position change, no packet sent here directly — the client's normal network
			// tick picks up the new rotation, same as the protocol spec describes.
			player.setYRot(yawDegrees);
			player.setXRot(pitchDegrees);
			return new JsonObject();
		});
	}

	private CompletableFuture<JsonObject> queryEntities(JsonObject payload) {
		double radius = payload.has("radius") ? payload.get("radius").getAsDouble() : Double.MAX_VALUE;
		return Minecraft.getInstance().submit(() -> {
			LocalPlayer player = requirePlayer();
			ClientLevel level = requireLevel();
			JsonArray entities = new JsonArray();
			for (Entity entity : level.entitiesForRendering()) {
				if (entity == player) {
					continue; // excludes the Manager's own entity, matching ManagerClient#getEntities
				}
				double dx = entity.getX() - player.getX();
				double dy = entity.getY() - player.getY();
				double dz = entity.getZ() - player.getZ();
				if (dx * dx + dy * dy + dz * dz > radius * radius) {
					continue;
				}
				entities.add(toEntityJson(entity));
			}
			JsonObject result = new JsonObject();
			result.add("entities", entities);
			return result;
		});
	}

	private JsonObject toEntityJson(Entity entity) {
		JsonObject json = new JsonObject();
		json.addProperty("id", entity.getId());
		boolean isPlayer = entity instanceof Player;
		// mineflayer's `entity.type` is a coarse spawn-packet category (player/mob/object/...);
		// MFO's monitors only ever branch on "is this a player" (entity-monitor.ts,
		// worker-monitor.ts), so that's the only distinction reproduced here.
		json.addProperty("type", isPlayer ? "player" : "mob");
		JsonObject position = new JsonObject();
		position.addProperty("x", entity.getX());
		position.addProperty("y", entity.getY());
		position.addProperty("z", entity.getZ());
		json.add("position", position);
		if (isPlayer) {
			json.addProperty("username", ((Player) entity).getGameProfile().name());
		} else {
			Identifier typeId = BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType());
			if (typeId != null) {
				json.addProperty("name", stripMinecraftNamespace(typeId));
			}
		}
		Component customName = entity.getCustomName();
		if (customName != null) {
			json.addProperty("customName", customName.getString());
		}
		if (entity instanceof LivingEntity livingEntity) {
			json.addProperty("health", livingEntity.getHealth());
		}
		return json;
	}

	private CompletableFuture<JsonObject> queryBlock(JsonObject payload) {
		int x = payload.get("x").getAsInt();
		int z = payload.get("z").getAsInt();
		return Minecraft.getInstance().submit(() -> {
			ClientLevel level = requireLevel();
			JsonObject result = new JsonObject();
			result.addProperty("loaded", level.hasChunk(x >> 4, z >> 4));
			return result;
		});
	}

	private CompletableFuture<JsonObject> readContainer(JsonObject payload) {
		BlockPos pos = new BlockPos(payload.get("x").getAsInt(), payload.get("y").getAsInt(), payload.get("z").getAsInt());

		CompletableFuture<JsonObject> future = new CompletableFuture<>();
		Minecraft.getInstance().execute(() -> {
			Minecraft client = Minecraft.getInstance();
			LocalPlayer player = client.player;
			ClientLevel level = client.level;
			if (player == null || level == null) {
				future.completeExceptionally(new IllegalStateException("not connected to a world"));
				return;
			}
			if (!level.hasChunk(pos.getX() >> 4, pos.getZ() >> 4)) {
				future.complete(notFound());
				return;
			}
			AbstractContainerMenu menuBeforeOpen = player.containerMenu;
			// The identical action a right-click would trigger — client `useItemOn`, same as
			// `MultiPlayerGameMode.useItemOn` behind vanilla's own right-click handling.
			Vec3 hitLocation = new Vec3(pos.getX() + 0.5, pos.getY() + 1.0, pos.getZ() + 0.5);
			BlockHitResult hitResult = new BlockHitResult(hitLocation, Direction.UP, pos, false);
			client.gameMode.useItemOn(player, InteractionHand.MAIN_HAND, hitResult);
			pendingChecks.add(new PendingCheck(
					future,
					() -> pollContainerOpened(menuBeforeOpen),
					deadlineNanos(CONTAINER_OPEN_TIMEOUT_MS),
					"readContainer timed out waiting for the server to open the container"));
		});
		return future;
	}

	private JsonObject pollContainerOpened(AbstractContainerMenu menuBeforeOpen) {
		LocalPlayer player = Minecraft.getInstance().player;
		if (player == null) {
			return null;
		}
		AbstractContainerMenu menu = player.containerMenu;
		if (menu == menuBeforeOpen) {
			return null; // still waiting on the server's open-screen packet
		}
		int capacity = menu.slots.size() - PLAYER_INVENTORY_SLOTS;
		if (capacity <= 0) {
			// Whatever opened has no slots beyond the player's own inventory — not a storage
			// container this protocol knows how to read.
			player.closeContainer();
			return notFound();
		}
		JsonArray items = new JsonArray();
		for (int i = 0; i < capacity; i++) {
			ItemStack stack = menu.getSlot(i).getItem();
			if (stack.isEmpty()) {
				continue;
			}
			JsonObject item = new JsonObject();
			item.addProperty("itemId", stripMinecraftNamespace(BuiltInRegistries.ITEM.getKey(stack.getItem())));
			item.addProperty("count", stack.getCount());
			items.add(item);
		}
		player.closeContainer();
		JsonObject result = new JsonObject();
		result.addProperty("capacity", capacity);
		result.add("items", items);
		return result;
	}

	private static JsonObject notFound() {
		JsonObject result = new JsonObject();
		result.addProperty("error", "not found");
		return result;
	}

	private CompletableFuture<JsonObject> captureScreenshot(JsonObject payload) {
		CompletableFuture<JsonObject> future = new CompletableFuture<>();
		Minecraft.getInstance().execute(() -> {
			Minecraft client = Minecraft.getInstance();
			File screenshotsDir = new File(client.gameDirectory, "screenshots");
			screenshotsDir.mkdirs();
			File target = new File(screenshotsDir, "mfo-" + System.currentTimeMillis() + ".png");
			// The same real-framebuffer grab vanilla's own F2 screenshot uses; MFO gets to
			// choose the file name/path instead of Screenshot.grab's auto-numbered default.
			Screenshot.takeScreenshot(client.getMainRenderTarget(), nativeImage -> {
				try (nativeImage) {
					nativeImage.writeToFile(target);
					JsonObject result = new JsonObject();
					result.addProperty("filePath", target.getAbsolutePath());
					future.complete(result);
				} catch (IOException e) {
					future.completeExceptionally(e);
				}
			});
		});
		return future;
	}

	private void drainPendingChecks() {
		Iterator<PendingCheck> iterator = pendingChecks.iterator();
		while (iterator.hasNext()) {
			PendingCheck check = iterator.next();
			JsonObject result;
			try {
				result = check.poll.get();
			} catch (RuntimeException e) {
				check.future.completeExceptionally(e);
				iterator.remove();
				continue;
			}
			if (result != null) {
				check.future.complete(result);
				iterator.remove();
			} else if (System.nanoTime() > check.deadlineNanos) {
				check.future.completeExceptionally(new IllegalStateException(check.timeoutMessage));
				iterator.remove();
			}
		}
	}

	private static long deadlineNanos(long timeoutMs) {
		return System.nanoTime() + timeoutMs * 1_000_000L;
	}

	private static LocalPlayer requirePlayer() {
		LocalPlayer player = Minecraft.getInstance().player;
		if (player == null) {
			throw new IllegalStateException("not connected to a world");
		}
		return player;
	}

	private static ClientLevel requireLevel() {
		ClientLevel level = Minecraft.getInstance().level;
		if (level == null) {
			throw new IllegalStateException("not connected to a world");
		}
		return level;
	}

	private static String stripMinecraftNamespace(Identifier id) {
		return "minecraft".equals(id.getNamespace()) ? id.getPath() : id.toString();
	}

	/** {@code poll} returns the response payload once ready, or {@code null} to keep waiting. */
	private record PendingCheck(CompletableFuture<JsonObject> future, Supplier<JsonObject> poll, long deadlineNanos, String timeoutMessage) {
	}
}
