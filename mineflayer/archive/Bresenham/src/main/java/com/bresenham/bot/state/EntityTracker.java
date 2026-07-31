package com.bresenham.bot.state;

import net.minecraft.entity.Entity;
import net.minecraft.entity.mob.HostileEntity;
import net.minecraft.entity.passive.PassiveEntity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.server.network.ServerPlayerEntity;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Scans and categorizes nearby entities each tick.
 */
public class EntityTracker {

    private static final double DEFAULT_SCAN_RADIUS = 32.0;

    private final List<Entity> nearbyHostiles = new ArrayList<>();
    private final List<Entity> nearbyPassives = new ArrayList<>();
    private final List<PlayerEntity> nearbyPlayers = new ArrayList<>();
    private ServerPlayerEntity trackedPlayer;

    /**
     * Update entity lists by scanning around the player.
     */
    public void update(ServerPlayerEntity player) {
        this.trackedPlayer = player;
        nearbyHostiles.clear();
        nearbyPassives.clear();
        nearbyPlayers.clear();

        if (player == null || player.getWorld() == null) return;

        List<Entity> entities = player.getWorld().getOtherEntities(
                player,
                player.getBoundingBox().expand(DEFAULT_SCAN_RADIUS)
        );

        for (Entity entity : entities) {
            if (entity instanceof HostileEntity) {
                nearbyHostiles.add(entity);
            } else if (entity instanceof PassiveEntity) {
                nearbyPassives.add(entity);
            } else if (entity instanceof PlayerEntity otherPlayer) {
                nearbyPlayers.add(otherPlayer);
            }
        }
    }

    /**
     * Get hostile entities within the given radius.
     */
    public List<Entity> getHostilesInRange(double radius) {
        if (trackedPlayer == null) return List.of();
        double radiusSq = radius * radius;
        return nearbyHostiles.stream()
                .filter(e -> e.squaredDistanceTo(trackedPlayer) <= radiusSq)
                .toList();
    }

    /**
     * Get players within the given radius.
     */
    public List<PlayerEntity> getPlayersInRange(double radius) {
        if (trackedPlayer == null) return List.of();
        double radiusSq = radius * radius;
        return nearbyPlayers.stream()
                .filter(e -> e.squaredDistanceTo(trackedPlayer) <= radiusSq)
                .toList();
    }

    /**
     * Get the nearest hostile entity, or null if none nearby.
     */
    public Entity getNearestHostile() {
        if (trackedPlayer == null || nearbyHostiles.isEmpty()) return null;
        return nearbyHostiles.stream()
                .min(Comparator.comparingDouble(e -> e.squaredDistanceTo(trackedPlayer)))
                .orElse(null);
    }

    /**
     * Get the nearest hostile within the given radius, or null if none.
     */
    public Entity getNearestHostileInRange(double radius) {
        if (trackedPlayer == null) return null;
        double radiusSq = radius * radius;
        return nearbyHostiles.stream()
                .filter(e -> e.squaredDistanceTo(trackedPlayer) <= radiusSq)
                .min(Comparator.comparingDouble(e -> e.squaredDistanceTo(trackedPlayer)))
                .orElse(null);
    }

    public List<Entity> getAllHostiles() {
        return nearbyHostiles;
    }

    public List<Entity> getAllPassives() {
        return nearbyPassives;
    }

    public List<PlayerEntity> getAllPlayers() {
        return nearbyPlayers;
    }
}
