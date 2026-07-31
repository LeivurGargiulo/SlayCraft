package com.baritoneai.tasks;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.inventory.ClickType;
import net.minecraft.world.phys.AABB;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

public class BoatHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Boat");
    private static final double ARRIVAL_DISTANCE = 10.0;
    private static final int TIMEOUT_TICKS = 6000; // 5 minutes max

    public enum State {
        IDLE, SELECTING_BOAT, PLACING_BOAT, ENTERING, STEERING, EXITING, DONE, FAILED
    }

    private State state = State.IDLE;
    private double targetX, targetZ;
    private int ticksInState = 0;
    private int totalTicks = 0;

    /**
     * Start boating to target coordinates.
     */
    public void boatTo(double x, double z) {
        LOGGER.info("Starting boat travel to {}, {}", x, z);
        this.targetX = x;
        this.targetZ = z;
        this.totalTicks = 0;
        transition(State.SELECTING_BOAT);
    }

    /**
     * Called every tick from TaskStateMachine.
     */
    public void tick() {
        if (state == State.IDLE || state == State.DONE || state == State.FAILED) return;

        totalTicks++;
        ticksInState++;

        if (totalTicks > TIMEOUT_TICKS) {
            fail("Boat travel timed out");
            return;
        }

        Minecraft mc = Minecraft.getInstance();
        LocalPlayer player = mc.player;
        if (player == null) return;

        switch (state) {
            case SELECTING_BOAT -> handleSelectingBoat(mc, player);
            case PLACING_BOAT -> handlePlacingBoat(mc, player);
            case ENTERING -> handleEntering(mc, player);
            case STEERING -> handleSteering(mc, player);
            case EXITING -> handleExiting(mc, player);
            default -> {}
        }
    }

    // ========== State Handlers ==========

    private void handleSelectingBoat(Minecraft mc, LocalPlayer player) {
        if (ticksInState > 1) return;

        // Check if already in a boat
        if (player.isPassenger() && player.getVehicle() instanceof AbstractBoat) {
            LOGGER.info("Already in a boat");
            transition(State.STEERING);
            return;
        }

        // Find a boat in inventory
        int boatSlot = findBoatInInventory(player);
        if (boatSlot == -1) {
            fail("No boat found in inventory");
            return;
        }

        // Select boat in hotbar
        if (boatSlot < 9) {
            player.getInventory().setSelectedSlot(boatSlot);
        } else {
            // Swap to hotbar
            if (mc.gameMode != null) {
                mc.gameMode.handleInventoryMouseClick(
                        player.inventoryMenu.containerId,
                        boatSlot + 9, // player container slot offset for main inventory
                        player.getInventory().getSelectedSlot(),
                        ClickType.SWAP,
                        player
                );
            }
        }

        transition(State.PLACING_BOAT);
    }

    private void handlePlacingBoat(Minecraft mc, LocalPlayer player) {
        if (ticksInState == 1) {
            // Look down at the water
            player.setXRot(45f);
        }

        if (ticksInState == 3) {
            // Right-click to place the boat
            mc.options.keyUse.setDown(true);
        }

        if (ticksInState == 5) {
            mc.options.keyUse.setDown(false);
        }

        if (ticksInState > 10) {
            // Check if a boat entity appeared nearby
            List<Entity> nearbyBoats = player.level().getEntities(
                    player,
                    player.getBoundingBox().inflate(5.0)
            );
            boolean boatNearby = nearbyBoats.stream().anyMatch(e -> e instanceof AbstractBoat);

            if (boatNearby) {
                transition(State.ENTERING);
            } else if (ticksInState > 40) {
                fail("Could not place boat — may not be on water");
            }
        }
    }

    private void handleEntering(Minecraft mc, LocalPlayer player) {
        if (ticksInState == 1) {
            // Find nearest boat and right-click it
            List<Entity> nearbyEntities = player.level().getEntities(
                    player,
                    player.getBoundingBox().inflate(5.0)
            );

            nearbyEntities.stream()
                    .filter(e -> e instanceof AbstractBoat)
                    .min((a, b) -> Double.compare(a.distanceTo(player), b.distanceTo(player)))
                    .ifPresent(boat -> {
                        // Look at the boat
                        player.lookAt(
                                net.minecraft.commands.arguments.EntityAnchorArgument.Anchor.EYES,
                                boat.position()
                        );
                        // Right-click to enter
                        if (mc.gameMode != null) {
                            mc.gameMode.interact(player, boat, net.minecraft.world.InteractionHand.MAIN_HAND);
                        }
                    });
        }

        // Check if we got in
        if (player.isPassenger() && player.getVehicle() instanceof AbstractBoat) {
            LOGGER.info("Entered boat");
            transition(State.STEERING);
        }

        if (ticksInState > 30) {
            fail("Could not enter boat");
        }
    }

    private void handleSteering(Minecraft mc, LocalPlayer player) {
        if (!player.isPassenger()) {
            // Fell out of boat
            LOGGER.warn("Left boat unexpectedly");
            fail("No longer in boat");
            return;
        }

        // Face toward target
        float desiredYaw = calculateDesiredYaw(player);
        smoothRotate(player, desiredYaw);

        // Hold forward to move
        mc.options.keyUp.setDown(true);

        // Check arrival
        double dist = getHorizontalDistance(player);
        if (dist < ARRIVAL_DISTANCE) {
            LOGGER.info("Arrived near destination by boat");
            mc.options.keyUp.setDown(false);
            transition(State.EXITING);
        }
    }

    private void handleExiting(Minecraft mc, LocalPlayer player) {
        if (ticksInState == 1) {
            mc.options.keyUp.setDown(false);
            // Press sneak to dismount
            mc.options.keyShift.setDown(true);
        }

        if (ticksInState == 3) {
            mc.options.keyShift.setDown(false);
        }

        if (!player.isPassenger() || ticksInState > 10) {
            mc.options.keyShift.setDown(false);
            state = State.DONE;
            LOGGER.info("Boat travel complete");
        }
    }

    // ========== Helpers ==========

    private int findBoatInInventory(LocalPlayer player) {
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (!stack.isEmpty()) {
                String id = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                if (id.endsWith("_boat")) {
                    return i;
                }
            }
        }
        return -1;
    }

    private float calculateDesiredYaw(LocalPlayer player) {
        Entity vehicle = player.getVehicle();
        double px = vehicle != null ? vehicle.getX() : player.getX();
        double pz = vehicle != null ? vehicle.getZ() : player.getZ();
        double dx = targetX - px;
        double dz = targetZ - pz;
        return (float) (Math.toDegrees(Math.atan2(-dx, dz)));
    }

    private double getHorizontalDistance(LocalPlayer player) {
        Entity vehicle = player.getVehicle();
        double px = vehicle != null ? vehicle.getX() : player.getX();
        double pz = vehicle != null ? vehicle.getZ() : player.getZ();
        double dx = targetX - px;
        double dz = targetZ - pz;
        return Math.sqrt(dx * dx + dz * dz);
    }

    private void smoothRotate(LocalPlayer player, float targetYaw) {
        float current = player.getYRot();
        float diff = targetYaw - current;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        float step = Math.max(-5f, Math.min(5f, diff));
        player.setYRot(current + step);
    }

    private void transition(State newState) {
        LOGGER.debug("Boat state: {} -> {}", state, newState);
        state = newState;
        ticksInState = 0;
    }

    private void fail(String reason) {
        LOGGER.warn("Boat travel failed: {}", reason);
        Minecraft mc = Minecraft.getInstance();
        mc.options.keyUp.setDown(false);
        mc.options.keyShift.setDown(false);
        mc.options.keyUse.setDown(false);
        state = State.FAILED;
    }

    public void reset() {
        state = State.IDLE;
        ticksInState = 0;
        totalTicks = 0;
        Minecraft mc = Minecraft.getInstance();
        mc.options.keyUp.setDown(false);
    }

    public boolean isActive() {
        return state != State.IDLE && state != State.DONE && state != State.FAILED;
    }

    public boolean isDone() {
        return state == State.DONE;
    }

    public boolean hasFailed() {
        return state == State.FAILED;
    }

    public State getState() {
        return state;
    }

    public void abort() {
        Minecraft mc = Minecraft.getInstance();
        mc.options.keyUp.setDown(false);
        mc.options.keyShift.setDown(false);
        mc.options.keyUse.setDown(false);
        state = State.FAILED;
    }
}
