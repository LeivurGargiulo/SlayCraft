package com.baritoneai.baritone;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;

public class PathingHelper {

    private static BlockPos lastPos = null;
    private static int stuckTicks = 0;

    /**
     * Calculate distance from the player to a position.
     */
    public static double distanceTo(double x, double y, double z) {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return Double.MAX_VALUE;
        return player.position().distanceTo(new Vec3(x, y, z));
    }

    /**
     * Check if the player has been stuck (same block position) for N ticks.
     * Should be called every tick.
     */
    public static boolean isStuck(int thresholdTicks) {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;

        BlockPos currentPos = player.blockPosition();
        if (currentPos.equals(lastPos)) {
            stuckTicks++;
        } else {
            stuckTicks = 0;
            lastPos = currentPos;
        }
        return stuckTicks >= thresholdTicks;
    }

    /**
     * Reset stuck detection state.
     */
    public static void resetStuckDetection() {
        lastPos = null;
        stuckTicks = 0;
    }

    /**
     * Get the player's current block position.
     */
    public static BlockPos getPlayerBlockPos() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return BlockPos.ZERO;
        return player.blockPosition();
    }

    /**
     * Check if the player's health is critically low.
     */
    public static boolean isLowHealth(float threshold) {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;
        return player.getHealth() <= threshold;
    }
}
