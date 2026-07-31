package com.baritoneai.tasks;

import com.baritoneai.baritone.BaritoneWrapper;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.Blocks;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class NetherPortalHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-NetherPortal");

    private static final int NAVIGATE_TO_PORTAL_TIMEOUT = 6000;  // 5 min
    private static final int ENTERING_PORTAL_TIMEOUT = 200;       // 10 sec
    private static final int NETHER_NAVIGATE_TIMEOUT = 6000;      // 5 min
    private static final int EXIT_SCAN_RADIUS = 128;
    private static final int EXIT_SCAN_Y_MIN = 0;
    private static final int EXIT_SCAN_Y_MAX = 128;
    private static final int SCAN_TIMEOUT = 100;                  // 5 sec for scan
    private static final int NAVIGATE_TO_DEST_TIMEOUT = 6000;     // 5 min
    private static final int TOTAL_TIMEOUT = 24000;               // 20 min total
    private static final double PORTAL_ARRIVAL_DISTANCE = 3.0;
    private static final double NETHER_ARRIVAL_DISTANCE = 20.0;

    public enum State {
        IDLE, NAVIGATING_TO_PORTAL, ENTERING_PORTAL,
        NAVIGATING_IN_NETHER, SCANNING_FOR_EXIT, ENTERING_EXIT_PORTAL,
        NAVIGATING_TO_DESTINATION, DONE, FAILED
    }

    private final BaritoneWrapper baritone;
    private State state = State.IDLE;

    // Target coordinates
    private int portalX, portalY, portalZ;       // Overworld entry portal
    private int netherTargetX, netherTargetZ;     // Nether waypoint
    private int destX, destZ;                     // Final overworld destination

    // Dimension tracking
    private String previousDimension;

    // Exit portal found during scan
    private BlockPos exitPortalPos;

    // Timing
    private int ticksInState = 0;
    private int totalTicks = 0;

    public NetherPortalHandler(BaritoneWrapper baritone) {
        this.baritone = baritone;
    }

    /**
     * Start a nether travel journey.
     * @param portalX/Y/Z  Overworld portal to enter
     * @param netherTargetX/Z  Target position in the nether
     * @param destX/Z  Final overworld destination
     */
    public void startNetherTravel(int portalX, int portalY, int portalZ,
                                   int netherTargetX, int netherTargetZ,
                                   int destX, int destZ) {
        LOGGER.info("Starting nether travel: portal ({},{},{}) -> nether ({},{}) -> dest ({},{})",
                portalX, portalY, portalZ, netherTargetX, netherTargetZ, destX, destZ);

        this.portalX = portalX;
        this.portalY = portalY;
        this.portalZ = portalZ;
        this.netherTargetX = netherTargetX;
        this.netherTargetZ = netherTargetZ;
        this.destX = destX;
        this.destZ = destZ;
        this.totalTicks = 0;
        this.exitPortalPos = null;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player != null) {
            this.previousDimension = mc.player.level().dimension().identifier().toString();
        }

        transition(State.NAVIGATING_TO_PORTAL);
        baritone.gotoNear(portalX, portalY, portalZ, 2);
    }

    /**
     * Called every tick from TaskStateMachine.
     */
    public void tick() {
        if (state == State.IDLE || state == State.DONE || state == State.FAILED) return;

        totalTicks++;
        ticksInState++;

        if (totalTicks > TOTAL_TIMEOUT) {
            fail("Nether travel timed out (total)");
            return;
        }

        Minecraft mc = Minecraft.getInstance();
        LocalPlayer player = mc.player;
        if (player == null) return;

        switch (state) {
            case NAVIGATING_TO_PORTAL -> handleNavigatingToPortal(player);
            case ENTERING_PORTAL -> handleEnteringPortal(mc, player);
            case NAVIGATING_IN_NETHER -> handleNavigatingInNether(player);
            case SCANNING_FOR_EXIT -> handleScanningForExit(player);
            case ENTERING_EXIT_PORTAL -> handleEnteringExitPortal(mc, player);
            case NAVIGATING_TO_DESTINATION -> handleNavigatingToDestination(player);
            default -> {}
        }
    }

    // ========== State Handlers ==========

    private void handleNavigatingToPortal(LocalPlayer player) {
        if (ticksInState > NAVIGATE_TO_PORTAL_TIMEOUT) {
            fail("Timed out navigating to entry portal");
            return;
        }

        double dist = getHorizontalDistance(player, portalX, portalZ);
        if (dist <= PORTAL_ARRIVAL_DISTANCE) {
            LOGGER.info("Arrived at entry portal, entering...");
            baritone.stop();
            previousDimension = player.level().dimension().identifier().toString();
            transition(State.ENTERING_PORTAL);
        } else if (ticksInState > 20 && !baritone.hasActiveProcess() && !baritone.isPathing()) {
            // Baritone finished but we're not close enough — retry
            baritone.gotoNear(portalX, portalY, portalZ, 2);
        }
    }

    private void handleEnteringPortal(Minecraft mc, LocalPlayer player) {
        if (ticksInState > ENTERING_PORTAL_TIMEOUT) {
            fail("Timed out entering portal");
            return;
        }

        // Check for dimension change
        String currentDim = player.level().dimension().identifier().toString();
        if (!currentDim.equals(previousDimension)) {
            LOGGER.info("Dimension changed to {}, entered nether!", currentDim);
            baritone.stop();
            mc.options.keyUp.setDown(false);

            // Start navigating in nether
            transition(State.NAVIGATING_IN_NETHER);
            baritone.gotoXZ(netherTargetX, netherTargetZ);
            return;
        }

        // Walk toward the portal center
        walkToward(mc, player, portalX, portalY, portalZ);
    }

    private void handleNavigatingInNether(LocalPlayer player) {
        if (ticksInState > NETHER_NAVIGATE_TIMEOUT) {
            fail("Timed out navigating in nether");
            return;
        }

        double dist = getHorizontalDistance(player, netherTargetX, netherTargetZ);
        if (dist <= NETHER_ARRIVAL_DISTANCE) {
            LOGGER.info("Arrived at nether target area, scanning for exit portal...");
            baritone.stop();
            transition(State.SCANNING_FOR_EXIT);
        } else if (ticksInState > 20 && !baritone.hasActiveProcess() && !baritone.isPathing()) {
            // Baritone finished but not close enough
            if (dist > NETHER_ARRIVAL_DISTANCE * 2) {
                baritone.gotoXZ(netherTargetX, netherTargetZ);
            } else {
                // Close enough, try scanning
                LOGGER.info("Baritone completed near target ({}), scanning for exit portal", (int) dist);
                baritone.stop();
                transition(State.SCANNING_FOR_EXIT);
            }
        }
    }

    private void handleScanningForExit(LocalPlayer player) {
        if (ticksInState > SCAN_TIMEOUT) {
            fail("No exit portal found within " + EXIT_SCAN_RADIUS + " blocks");
            return;
        }

        // Only scan once on entry to this state
        if (ticksInState == 1) {
            exitPortalPos = scanForPortal(player);
            if (exitPortalPos != null) {
                LOGGER.info("Found exit portal at {}, {}, {}", exitPortalPos.getX(), exitPortalPos.getY(), exitPortalPos.getZ());
                previousDimension = player.level().dimension().identifier().toString();

                // Navigate to exit portal
                double dist = getHorizontalDistance(player, exitPortalPos.getX(), exitPortalPos.getZ());
                if (dist <= PORTAL_ARRIVAL_DISTANCE) {
                    // Already close, enter directly
                    transition(State.ENTERING_EXIT_PORTAL);
                } else {
                    baritone.gotoNear(exitPortalPos.getX(), exitPortalPos.getY(), exitPortalPos.getZ(), 2);
                    // Stay in SCANNING_FOR_EXIT until we arrive, then transition
                }
            } else {
                LOGGER.warn("No exit portal found, travel will fail");
            }
        }

        // If we found a portal and are navigating to it
        if (exitPortalPos != null && ticksInState > 1) {
            double dist = getHorizontalDistance(player, exitPortalPos.getX(), exitPortalPos.getZ());
            if (dist <= PORTAL_ARRIVAL_DISTANCE) {
                LOGGER.info("Arrived at exit portal, entering...");
                baritone.stop();
                transition(State.ENTERING_EXIT_PORTAL);
            }
        }
    }

    private void handleEnteringExitPortal(Minecraft mc, LocalPlayer player) {
        if (ticksInState > ENTERING_PORTAL_TIMEOUT) {
            fail("Timed out entering exit portal");
            return;
        }

        // Check for dimension change back to overworld
        String currentDim = player.level().dimension().identifier().toString();
        if (!currentDim.equals(previousDimension)) {
            LOGGER.info("Dimension changed to {}, back in overworld!", currentDim);
            baritone.stop();
            mc.options.keyUp.setDown(false);

            // Navigate to final destination
            transition(State.NAVIGATING_TO_DESTINATION);
            baritone.gotoXZ(destX, destZ);
            return;
        }

        if (exitPortalPos != null) {
            walkToward(mc, player, exitPortalPos.getX(), exitPortalPos.getY(), exitPortalPos.getZ());
        }
    }

    private void handleNavigatingToDestination(LocalPlayer player) {
        if (ticksInState > NAVIGATE_TO_DEST_TIMEOUT) {
            fail("Timed out navigating to final destination");
            return;
        }

        // Check if Baritone completed
        if (ticksInState > 20 && !baritone.hasActiveProcess() && !baritone.isPathing()) {
            double dist = getHorizontalDistance(player, destX, destZ);
            if (dist <= 10) {
                LOGGER.info("Arrived at final destination!");
                state = State.DONE;
            } else {
                // Retry navigation
                baritone.gotoXZ(destX, destZ);
            }
        }
    }

    // ========== Portal Scanning ==========

    /**
     * Scan for nether portal blocks within EXIT_SCAN_RADIUS of the player's current position.
     * Returns the position of the nearest portal block, or null if none found.
     */
    private BlockPos scanForPortal(LocalPlayer player) {
        BlockPos playerPos = player.blockPosition();
        BlockPos nearest = null;
        double nearestDist = Double.MAX_VALUE;

        // Dynamic Y range: always scan 0-128 (normal nether) and extend upward
        // to cover the player's current Y level (handles nether roof portals)
        int scanYMin = Math.max(player.level().getMinY(), EXIT_SCAN_Y_MIN);
        int scanYMax = Math.min(player.level().getMaxY(),
                Math.max(EXIT_SCAN_Y_MAX, playerPos.getY() + 15));

        for (int x = playerPos.getX() - EXIT_SCAN_RADIUS; x <= playerPos.getX() + EXIT_SCAN_RADIUS; x++) {
            for (int z = playerPos.getZ() - EXIT_SCAN_RADIUS; z <= playerPos.getZ() + EXIT_SCAN_RADIUS; z++) {
                for (int y = scanYMin; y <= scanYMax; y++) {
                    BlockPos pos = new BlockPos(x, y, z);
                    if (player.level().getBlockState(pos).getBlock() == Blocks.NETHER_PORTAL) {
                        double dist = playerPos.distSqr(pos);
                        if (dist < nearestDist) {
                            nearestDist = dist;
                            nearest = pos;
                        }
                    }
                }
            }
        }
        return nearest;
    }

    // ========== Movement Helpers ==========

    /**
     * Walk toward a target position by holding movement keys.
     */
    private void walkToward(Minecraft mc, LocalPlayer player, int targetX, int targetY, int targetZ) {
        // Look toward the portal
        double dx = targetX + 0.5 - player.getX();
        double dz = targetZ + 0.5 - player.getZ();
        float desiredYaw = (float) Math.toDegrees(Math.atan2(-dx, dz));

        // Smooth rotation
        float currentYaw = player.getYRot();
        float diff = desiredYaw - currentYaw;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        float step = Math.max(-10f, Math.min(10f, diff));
        player.setYRot(currentYaw + step);

        // Hold forward
        mc.options.keyUp.setDown(true);

        // Check if we're standing in a portal block
        BlockPos feetPos = player.blockPosition();
        if (player.level().getBlockState(feetPos).getBlock() == Blocks.NETHER_PORTAL
                || player.level().getBlockState(feetPos.above()).getBlock() == Blocks.NETHER_PORTAL) {
            // In the portal — stop walking and wait for teleportation
            mc.options.keyUp.setDown(false);
        }
    }

    private double getHorizontalDistance(LocalPlayer player, int targetX, int targetZ) {
        double dx = targetX - player.getX();
        double dz = targetZ - player.getZ();
        return Math.sqrt(dx * dx + dz * dz);
    }

    // ========== State Management ==========

    private void transition(State newState) {
        LOGGER.debug("Nether portal state: {} -> {}", state, newState);
        state = newState;
        ticksInState = 0;
    }

    private void fail(String reason) {
        LOGGER.warn("Nether travel failed: {}", reason);
        Minecraft mc = Minecraft.getInstance();
        mc.options.keyUp.setDown(false);
        state = State.FAILED;
    }

    public void reset() {
        state = State.IDLE;
        ticksInState = 0;
        totalTicks = 0;
        exitPortalPos = null;
        Minecraft.getInstance().options.keyUp.setDown(false);
    }

    public void abort() {
        Minecraft mc = Minecraft.getInstance();
        mc.options.keyUp.setDown(false);
        state = State.FAILED;
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

    /**
     * Returns true when the bot is actively entering a portal (should suppress combat).
     */
    public boolean isInPortal() {
        return state == State.ENTERING_PORTAL || state == State.ENTERING_EXIT_PORTAL;
    }

    public State getState() {
        return state;
    }
}
