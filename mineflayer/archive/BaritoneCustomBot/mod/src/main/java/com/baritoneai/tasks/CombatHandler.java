package com.baritoneai.tasks;

import com.baritoneai.chat.ChatSender;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class CombatHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Combat");
    private static final double AGGRO_RANGE = 8.0;
    private static final double ATTACK_RANGE = 4.0;
    private static final int ATTACK_COOLDOWN_TICKS = 12;
    private static final int PLAYER_AGGRO_DURATION = 200; // 10 seconds of retaliation

    private int cooldownCounter = 0;
    private boolean inCombat = false;
    private EquipmentHandler equipmentHandler;

    // Player self-defense tracking
    private final Set<String> aggressorPlayers = new HashSet<>();
    private int playerAggroTimer = 0;

    public void setEquipmentHandler(EquipmentHandler equipmentHandler) {
        this.equipmentHandler = equipmentHandler;
    }

    /**
     * Called every tick to update internal state.
     */
    public void tick() {
        if (cooldownCounter > 0) {
            cooldownCounter--;
        }

        // Decay player aggro timer
        if (playerAggroTimer > 0) {
            playerAggroTimer--;
            if (playerAggroTimer <= 0) {
                aggressorPlayers.clear();
            }
        }

        // Check if a player has attacked us
        checkPlayerAggression();

        // Auto-exit combat if no threats nearby and no player aggressors
        if (inCombat && !hasThreatsNearby() && aggressorPlayers.isEmpty()) {
            inCombat = false;
            LOGGER.info("Combat ended - no more threats");
        }
    }

    /**
     * Detect if a player has recently attacked the bot.
     */
    private void checkPlayerAggression() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return;

        LivingEntity lastAttacker = player.getLastHurtByMob();
        if (lastAttacker instanceof Player attacker && attacker != player) {
            String attackerName = attacker.getName().getString();
            if (!aggressorPlayers.contains(attackerName)) {
                aggressorPlayers.add(attackerName);
                playerAggroTimer = PLAYER_AGGRO_DURATION;
                inCombat = true;
                LOGGER.info("Player {} attacked us! Defending.", attackerName);
                ChatSender.sendChat("Hey " + attackerName + "! Stop hitting me, I'll fight back!");
            } else {
                // Already tracking this player, refresh timer
                playerAggroTimer = PLAYER_AGGRO_DURATION;
            }
        }
    }

    /**
     * Check if there are hostile mobs actively threatening the player.
     */
    public boolean checkForThreats() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;

        // Check hostile mobs
        List<Monster> nearby = player.level().getEntitiesOfClass(
                Monster.class,
                player.getBoundingBox().inflate(AGGRO_RANGE)
        );

        boolean hostileThreats = nearby.stream().anyMatch(m ->
                m.distanceTo(player) < AGGRO_RANGE &&
                        m.isAlive() &&
                        (m.getTarget() == player || m.distanceTo(player) < 5.0)
        );

        // Check player aggressors nearby
        boolean playerThreats = !aggressorPlayers.isEmpty() && hasAggressorNearby(player);

        return hostileThreats || playerThreats;
    }

    /**
     * Check if any aggressor player is nearby.
     */
    private boolean hasAggressorNearby(LocalPlayer player) {
        AABB scanBox = player.getBoundingBox().inflate(AGGRO_RANGE);
        List<Player> players = player.level().getEntitiesOfClass(Player.class, scanBox);
        return players.stream().anyMatch(p ->
                p != player &&
                        p.isAlive() &&
                        aggressorPlayers.contains(p.getName().getString())
        );
    }

    /**
     * Attack the nearest hostile mob or aggressor player within attack range.
     */
    public void attackNearest() {
        LocalPlayer player = Minecraft.getInstance().player;
        Minecraft mc = Minecraft.getInstance();
        if (player == null || mc.gameMode == null) return;

        AABB attackBox = player.getBoundingBox().inflate(ATTACK_RANGE);

        // Find nearest aggressor player first (prioritize self-defense)
        LivingEntity target = null;

        if (!aggressorPlayers.isEmpty()) {
            List<Player> nearbyPlayers = player.level().getEntitiesOfClass(Player.class, attackBox);
            target = nearbyPlayers.stream()
                    .filter(p -> p != player && p.isAlive() &&
                            aggressorPlayers.contains(p.getName().getString()))
                    .min(Comparator.comparingDouble(p -> p.distanceTo(player)))
                    .orElse(null);
        }

        // Fall back to nearest hostile mob
        if (target == null) {
            List<Monster> nearbyMonsters = player.level().getEntitiesOfClass(Monster.class, attackBox);
            target = nearbyMonsters.stream()
                    .filter(Monster::isAlive)
                    .min(Comparator.comparingDouble(m -> m.distanceTo(player)))
                    .orElse(null);
        }

        if (target != null) {
            inCombat = true;

            // Auto-select best weapon for combat
            if (equipmentHandler != null) {
                equipmentHandler.selectBestToolForTask("COMBAT");
            }

            // Look at the target
            player.lookAt(
                    net.minecraft.commands.arguments.EntityAnchorArgument.Anchor.EYES,
                    target.getEyePosition()
            );

            // Only attack if cooldown is ready and attack strength is full
            if (cooldownCounter <= 0 && player.getAttackStrengthScale(0) >= 0.9f) {
                mc.gameMode.attack(player, target);
                player.swing(InteractionHand.MAIN_HAND);
                cooldownCounter = ATTACK_COOLDOWN_TICKS;
                LOGGER.debug("Attacked {} (hp: {})", target.getName().getString(), target.getHealth());
            }
        }
    }

    /**
     * Check if threats are still nearby (used to end combat state).
     */
    private boolean hasThreatsNearby() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;

        List<Monster> nearby = player.level().getEntitiesOfClass(
                Monster.class,
                player.getBoundingBox().inflate(AGGRO_RANGE)
        );

        return nearby.stream().anyMatch(m -> m.isAlive() && m.distanceTo(player) < AGGRO_RANGE);
    }

    public boolean isInCombat() {
        return inCombat;
    }

    public void resetCombat() {
        inCombat = false;
        cooldownCounter = 0;
        aggressorPlayers.clear();
        playerAggroTimer = 0;
    }

    /**
     * Check if the bot is currently defending against a player.
     */
    public boolean isDefendingAgainstPlayer() {
        return !aggressorPlayers.isEmpty();
    }
}
