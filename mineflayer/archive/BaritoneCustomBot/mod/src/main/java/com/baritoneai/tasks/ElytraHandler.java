package com.baritoneai.tasks;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ElytraHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Elytra");
    private static final int FIREWORK_COOLDOWN = 50; // 2.5 seconds between fireworks
    private static final int TIMEOUT_TICKS = 6000; // 5 minutes max flight
    private static final double ARRIVAL_DISTANCE = 20.0; // Within 20 blocks = arrived

    public enum State {
        IDLE, EQUIPPING, JUMPING, DEPLOYING, FLYING, LANDING, DONE, FAILED
    }

    private final EquipmentHandler equipmentHandler;

    private State state = State.IDLE;
    private double targetX, targetY, targetZ;
    private int ticksInState = 0;
    private int totalFlightTicks = 0;
    private int fireworkCooldown = 0;
    private int jumpAttempts = 0;
    private ItemStack previousChestplate = ItemStack.EMPTY;

    public ElytraHandler(EquipmentHandler equipmentHandler) {
        this.equipmentHandler = equipmentHandler;
    }

    /**
     * Start flying to target coordinates.
     */
    public void flyTo(double x, double y, double z) {
        LOGGER.info("Starting elytra flight to {}, {}, {}", x, y, z);
        this.targetX = x;
        this.targetY = y;
        this.targetZ = z;
        this.totalFlightTicks = 0;
        this.jumpAttempts = 0;
        this.previousChestplate = ItemStack.EMPTY;
        transition(State.EQUIPPING);
    }

    /**
     * Called every tick from TaskStateMachine.
     */
    public void tick() {
        if (state == State.IDLE || state == State.DONE || state == State.FAILED) return;

        totalFlightTicks++;
        ticksInState++;

        if (totalFlightTicks > TIMEOUT_TICKS) {
            fail("Flight timed out");
            return;
        }

        if (fireworkCooldown > 0) fireworkCooldown--;

        Minecraft mc = Minecraft.getInstance();
        LocalPlayer player = mc.player;
        if (player == null) return;

        switch (state) {
            case EQUIPPING -> handleEquipping(mc, player);
            case JUMPING -> handleJumping(mc, player);
            case DEPLOYING -> handleDeploying(mc, player);
            case FLYING -> handleFlying(mc, player);
            case LANDING -> handleLanding(mc, player);
            default -> {}
        }
    }

    // ========== State Handlers ==========

    private void handleEquipping(Minecraft mc, LocalPlayer player) {
        if (ticksInState > 1) return; // Only equip once

        // Save current chestplate
        previousChestplate = player.getItemBySlot(EquipmentSlot.CHEST).copy();

        // Check if elytra is already equipped
        if (isElytra(player.getItemBySlot(EquipmentSlot.CHEST))) {
            LOGGER.info("Elytra already equipped");
            transition(State.JUMPING);
            return;
        }

        // Find elytra in inventory
        int elytraSlot = -1;
        for (int i = 9; i < 45; i++) {
            ItemStack stack = player.inventoryMenu.getSlot(i).getItem();
            if (!stack.isEmpty() && isElytra(stack)) {
                elytraSlot = i;
                break;
            }
        }

        if (elytraSlot == -1) {
            fail("No elytra found in inventory");
            return;
        }

        // Equip elytra to chest slot
        equipmentHandler.equipToSlot(elytraSlot, EquipmentSlot.CHEST);
        LOGGER.info("Equipped elytra from slot {}", elytraSlot);
        transition(State.JUMPING);
    }

    private void handleJumping(Minecraft mc, LocalPlayer player) {
        // Press jump on the first tick
        if (ticksInState == 1) {
            mc.options.keyJump.setDown(true);
        } else if (ticksInState == 2) {
            mc.options.keyJump.setDown(false);
        }

        // Wait until we're airborne
        if (ticksInState > 3 && !player.onGround()) {
            transition(State.DEPLOYING);
        }

        // Timeout — retry jump
        if (ticksInState > 15) {
            jumpAttempts++;
            if (jumpAttempts > 5) {
                fail("Could not get airborne after multiple jump attempts");
                return;
            }
            transition(State.JUMPING);
        }
    }

    private void handleDeploying(Minecraft mc, LocalPlayer player) {
        // Press jump while falling to activate elytra
        if (ticksInState == 1) {
            mc.options.keyJump.setDown(true);
        } else if (ticksInState == 2) {
            mc.options.keyJump.setDown(false);
        }

        // Check if elytra is active
        if (player.isFallFlying()) {
            LOGGER.info("Elytra deployed! Starting flight");
            // Immediately use a firework to gain altitude from ground level
            useFirework(mc, player);
            transition(State.FLYING);
            return;
        }

        // If we landed, retry jumping
        if (ticksInState > 10 && player.onGround()) {
            transition(State.JUMPING);
        }

        // Timeout
        if (ticksInState > 40) {
            fail("Failed to deploy elytra");
        }
    }

    private void handleFlying(Minecraft mc, LocalPlayer player) {
        if (!player.isFallFlying()) {
            // We stopped flying — either crashed or landed
            if (player.onGround()) {
                double dist = getHorizontalDistance(player);
                if (dist < ARRIVAL_DISTANCE) {
                    transition(State.LANDING);
                } else {
                    // Crashed too early — try to take off again
                    transition(State.JUMPING);
                }
            }
            return;
        }

        // Navigate toward target
        float desiredYaw = calculateDesiredYaw(player);
        smoothRotate(player, desiredYaw);

        // Altitude management
        double altitudeDiff = player.getY() - targetY;
        float desiredPitch;

        if (altitudeDiff < -10) {
            // Too low — pitch up and use firework
            desiredPitch = -30f;
            if (fireworkCooldown <= 0) {
                useFirework(mc, player);
            }
        } else if (altitudeDiff > 50) {
            // Too high — pitch down to descend
            desiredPitch = 15f;
        } else {
            // Normal cruise — slight upward pitch
            desiredPitch = -5f;
            // Use firework periodically to maintain speed
            if (fireworkCooldown <= 0) {
                useFirework(mc, player);
            }
        }

        smoothPitch(player, desiredPitch);

        // Crash avoidance — check blocks below
        BlockPos below = player.blockPosition().below(5);
        if (mc.level != null) {
            BlockState blockBelow = mc.level.getBlockState(below);
            if (!blockBelow.isAir() && player.getXRot() > 0) {
                // Ground is close and we're pointing down — pitch up!
                player.setXRot(Math.max(player.getXRot() - 5f, -45f));
            }
        }

        // Check if we've arrived
        double dist = getHorizontalDistance(player);
        if (dist < ARRIVAL_DISTANCE) {
            LOGGER.info("Arrived near destination, landing");
            transition(State.LANDING);
        }
    }

    private void handleLanding(Minecraft mc, LocalPlayer player) {
        if (player.isFallFlying()) {
            // Gently pitch down to land
            smoothPitch(player, 10f);

            // Slow down by looking up slightly near the ground
            BlockPos below = player.blockPosition().below(10);
            if (mc.level != null && !mc.level.getBlockState(below).isAir()) {
                smoothPitch(player, 5f);
            }
        }

        if (player.onGround() || !player.isFallFlying()) {
            LOGGER.info("Landed successfully");
            // Re-equip previous chestplate
            if (!previousChestplate.isEmpty() && !isElytra(previousChestplate)) {
                // Find the previous chestplate in inventory and equip it
                for (int i = 9; i < 45; i++) {
                    ItemStack stack = player.inventoryMenu.getSlot(i).getItem();
                    if (ItemStack.isSameItemSameComponents(stack, previousChestplate)) {
                        equipmentHandler.equipToSlot(i, EquipmentSlot.CHEST);
                        break;
                    }
                }
            }
            state = State.DONE;
        }

        if (ticksInState > 200) {
            // Took too long to land
            state = State.DONE; // Still mark as done — we're close enough
        }
    }

    // ========== Helpers ==========

    private boolean isElytra(ItemStack stack) {
        if (stack.isEmpty()) return false;
        String itemId = stack.getItem().builtInRegistryHolder().key().identifier().toString();
        return itemId.equals("minecraft:elytra");
    }

    private void useFirework(Minecraft mc, LocalPlayer player) {
        // Find firework in hotbar
        int fireworkSlot = -1;
        for (int i = 0; i < 9; i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (!stack.isEmpty()) {
                String id = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                if (id.equals("minecraft:firework_rocket")) {
                    fireworkSlot = i;
                    break;
                }
            }
        }

        // Check main inventory if not in hotbar
        if (fireworkSlot == -1) {
            for (int i = 9; i < 36; i++) {
                ItemStack stack = player.getInventory().getItem(i);
                if (!stack.isEmpty()) {
                    String id = stack.getItem().builtInRegistryHolder().key().identifier().toString();
                    if (id.equals("minecraft:firework_rocket")) {
                        // Swap to current hotbar slot
                        if (mc.gameMode != null) {
                            mc.gameMode.handleInventoryMouseClick(
                                    player.inventoryMenu.containerId,
                                    i + 9, // container slot offset
                                    player.getInventory().getSelectedSlot(),
                                    net.minecraft.world.inventory.ClickType.SWAP,
                                    player
                            );
                        }
                        fireworkSlot = player.getInventory().getSelectedSlot();
                        break;
                    }
                }
            }
        }

        if (fireworkSlot == -1) {
            LOGGER.warn("No firework rockets available");
            return;
        }

        player.getInventory().setSelectedSlot(fireworkSlot);
        // Right-click to use firework
        mc.options.keyUse.setDown(true);
        // Schedule release for next tick
        Minecraft.getInstance().execute(() -> mc.options.keyUse.setDown(false));
        fireworkCooldown = FIREWORK_COOLDOWN;
    }

    private float calculateDesiredYaw(LocalPlayer player) {
        double dx = targetX - player.getX();
        double dz = targetZ - player.getZ();
        return (float) (Math.toDegrees(Math.atan2(-dx, dz)));
    }

    private double getHorizontalDistance(LocalPlayer player) {
        double dx = targetX - player.getX();
        double dz = targetZ - player.getZ();
        return Math.sqrt(dx * dx + dz * dz);
    }

    private void smoothRotate(LocalPlayer player, float targetYaw) {
        float current = player.getYRot();
        float diff = targetYaw - current;
        // Normalize to [-180, 180]
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        // Smooth interpolation (max 5 degrees per tick)
        float step = Math.max(-5f, Math.min(5f, diff));
        player.setYRot(current + step);
    }

    private void smoothPitch(LocalPlayer player, float targetPitch) {
        float current = player.getXRot();
        float diff = targetPitch - current;
        float step = Math.max(-3f, Math.min(3f, diff));
        float newPitch = Math.max(-80f, Math.min(80f, current + step));
        player.setXRot(newPitch);
    }

    private void transition(State newState) {
        LOGGER.debug("Elytra state: {} -> {}", state, newState);
        state = newState;
        ticksInState = 0;
    }

    private void fail(String reason) {
        LOGGER.warn("Elytra flight failed: {}", reason);
        Minecraft mc = Minecraft.getInstance();
        mc.options.keyJump.setDown(false);
        mc.options.keyUse.setDown(false);
        state = State.FAILED;
    }

    public void reset() {
        state = State.IDLE;
        ticksInState = 0;
        totalFlightTicks = 0;
        fireworkCooldown = 0;
        jumpAttempts = 0;
        previousChestplate = ItemStack.EMPTY;
    }

    public boolean isActive() {
        return state != State.IDLE && state != State.DONE && state != State.FAILED;
    }

    public boolean isFlying() {
        return state == State.FLYING || state == State.LANDING;
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
        mc.options.keyJump.setDown(false);
        mc.options.keyUse.setDown(false);
        state = State.FAILED;
    }
}
