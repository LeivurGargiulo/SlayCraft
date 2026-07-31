package com.baritoneai.tasks;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.inventory.ClickType;
import net.minecraft.world.item.ItemStack;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

public class EquipmentHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-Equipment");

    // Armor material tiers (higher = better) — keyed by prefix in registry ID
    private static final Map<String, Integer> ARMOR_TIERS = Map.of(
            "leather", 1,
            "golden", 2,
            "chainmail", 3,
            "iron", 4,
            "diamond", 5,
            "netherite", 6
    );

    // Tool material tiers — keyed by prefix in registry ID
    private static final Map<String, Integer> TOOL_TIERS = Map.of(
            "wooden", 1,
            "stone", 2,
            "golden", 2,
            "iron", 3,
            "diamond", 4,
            "netherite", 5
    );

    // Armor slot keywords in item registry IDs
    private static final Map<String, EquipmentSlot> ARMOR_SLOT_KEYWORDS = Map.of(
            "helmet", EquipmentSlot.HEAD,
            "chestplate", EquipmentSlot.CHEST,
            "leggings", EquipmentSlot.LEGS,
            "boots", EquipmentSlot.FEET
    );

    // Player inventory container slot indices for armor
    // In the player's inventoryMenu: 5=head, 6=chest, 7=legs, 8=feet
    private static final int SLOT_HEAD = 5;
    private static final int SLOT_CHEST = 6;
    private static final int SLOT_LEGS = 7;
    private static final int SLOT_FEET = 8;

    // Maps EquipmentSlot to container slot index
    private static final Map<EquipmentSlot, Integer> ARMOR_SLOT_MAP = Map.of(
            EquipmentSlot.HEAD, SLOT_HEAD,
            EquipmentSlot.CHEST, SLOT_CHEST,
            EquipmentSlot.LEGS, SLOT_LEGS,
            EquipmentSlot.FEET, SLOT_FEET
    );

    /**
     * Called periodically (every 40 ticks) from TaskStateMachine.
     * Checks and equips the best available armor and selects appropriate tools.
     */
    public void tick() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return;

        checkAndEquipBestArmor(player);
    }

    /**
     * Scan inventory for better armor pieces and equip them.
     */
    private void checkAndEquipBestArmor(LocalPlayer player) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.gameMode == null) return;

        boolean flying = player.isFallFlying();

        for (Map.Entry<EquipmentSlot, Integer> entry : ARMOR_SLOT_MAP.entrySet()) {
            EquipmentSlot slot = entry.getKey();

            // Don't touch chest slot while elytra flying
            if (slot == EquipmentSlot.CHEST && flying) continue;

            ItemStack currentArmor = player.getItemBySlot(slot);
            int currentScore = getArmorScore(currentArmor);

            // Search inventory (slots 9-44 in player container) for better armor
            int bestSlot = -1;
            int bestScore = currentScore;

            for (int i = 9; i < 45; i++) {
                ItemStack stack = player.inventoryMenu.getSlot(i).getItem();
                if (stack.isEmpty()) continue;
                if (!isArmorForSlot(stack, slot)) continue;

                int score = getArmorScore(stack);
                if (score > bestScore) {
                    bestScore = score;
                    bestSlot = i;
                }
            }

            if (bestSlot != -1) {
                LOGGER.info("Upgrading {} armor (score {} -> {})", slot.getName(), currentScore, bestScore);
                // Shift-click the better armor piece to auto-equip it
                mc.gameMode.handleInventoryMouseClick(
                        player.inventoryMenu.containerId,
                        bestSlot,
                        0,
                        ClickType.QUICK_MOVE,
                        player
                );
            }
        }
    }

    /**
     * Get the registry ID of an item stack (e.g., "minecraft:diamond_helmet").
     */
    private String getItemId(ItemStack stack) {
        return stack.getItem().builtInRegistryHolder().key().identifier().toString();
    }

    /**
     * Check if an item is armor for the given equipment slot, using registry ID matching.
     */
    private boolean isArmorForSlot(ItemStack stack, EquipmentSlot slot) {
        String itemId = getItemId(stack);

        // Special case: elytra goes in chest slot
        if (slot == EquipmentSlot.CHEST && itemId.equals("minecraft:elytra")) return true;

        // Check if item ID contains the right slot keyword (helmet, chestplate, leggings, boots)
        for (Map.Entry<String, EquipmentSlot> entry : ARMOR_SLOT_KEYWORDS.entrySet()) {
            if (itemId.contains(entry.getKey()) && entry.getValue() == slot) return true;
        }
        return false;
    }

    /**
     * Calculate armor score for comparison. Higher = better.
     * Score = materialTier * 10 + protectionEnchantLevel
     */
    private int getArmorScore(ItemStack stack) {
        if (stack.isEmpty()) return 0;

        String itemId = getItemId(stack);

        // Elytra gets a special score — between chainmail and iron
        if (itemId.equals("minecraft:elytra")) return 35;

        // Determine tier from item ID prefix
        int tier = 0;
        for (Map.Entry<String, Integer> entry : ARMOR_TIERS.entrySet()) {
            if (itemId.contains(entry.getKey())) {
                tier = entry.getValue();
                break;
            }
        }

        if (tier == 0) return 0; // Not recognized armor

        int protection = getProtectionLevel(stack);
        return tier * 10 + protection;
    }

    /**
     * Get the total Protection enchantment level on an armor piece.
     */
    private int getProtectionLevel(ItemStack stack) {
        // In 1.21.11, enchantments are stored as components
        var enchantments = stack.get(DataComponents.ENCHANTMENTS);
        if (enchantments == null) return 0;

        int totalProtection = 0;
        var entrySet = enchantments.entrySet();
        for (var entry : entrySet) {
            String enchantId = entry.getKey().unwrapKey()
                    .map(k -> k.identifier().toString())
                    .orElse("");
            if (enchantId.contains("protection")) {
                totalProtection += entry.getIntValue();
            }
        }
        return totalProtection;
    }

    /**
     * Select the best weapon/tool for a given task type and switch to it in hotbar.
     * Call this before combat or mining.
     */
    public void selectBestToolForTask(String taskType) {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return;

        int bestSlot = -1;
        float bestScore = 0;

        for (int i = 0; i < 9; i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (stack.isEmpty()) continue;

            float score = getToolScore(stack, taskType);
            if (score > bestScore) {
                bestScore = score;
                bestSlot = i;
            }
        }

        if (bestSlot != -1 && bestSlot != player.getInventory().getSelectedSlot()) {
            player.getInventory().setSelectedSlot(bestSlot);
            LOGGER.debug("Selected slot {} for task {}", bestSlot, taskType);
        }
    }

    /**
     * Score a tool for a given task. Higher = better.
     * Uses registry ID matching instead of instanceof checks (MC 1.21.11 component system).
     */
    private float getToolScore(ItemStack stack, String taskType) {
        String itemId = getItemId(stack);

        return switch (taskType) {
            case "COMBAT" -> {
                if (itemId.contains("_sword")) yield 100 + getToolTier(itemId);
                // Use endsWith to avoid matching "pickaxe" which also contains "axe"
                if (itemId.endsWith("_axe")) yield 80 + getToolTier(itemId);
                yield 0;
            }
            case "MINE" -> {
                if (itemId.contains("_pickaxe")) yield 100 + getToolTier(itemId);
                yield 0;
            }
            case "MINE_WOOD" -> {
                if (itemId.endsWith("_axe")) yield 100 + getToolTier(itemId);
                yield 0;
            }
            default -> 0;
        };
    }

    /**
     * Get a numeric tier value from a tool's registry ID.
     */
    private float getToolTier(String itemId) {
        for (Map.Entry<String, Integer> entry : TOOL_TIERS.entrySet()) {
            if (itemId.contains(entry.getKey())) {
                return entry.getValue();
            }
        }
        return 0;
    }

    /**
     * Check if elytra is currently equipped in the chest slot.
     */
    public boolean isElytraEquipped() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;
        String itemId = getItemId(player.getItemBySlot(EquipmentSlot.CHEST));
        return itemId.equals("minecraft:elytra");
    }

    /**
     * Check if player is currently flying with elytra.
     */
    public boolean isFlyingWithElytra() {
        LocalPlayer player = Minecraft.getInstance().player;
        if (player == null) return false;
        return player.isFallFlying();
    }

    /**
     * Swap an item from inventory into an armor slot.
     * Used by ElytraHandler to equip/unequip elytra.
     */
    public void equipToSlot(int inventorySlot, EquipmentSlot armorSlot) {
        LocalPlayer player = Minecraft.getInstance().player;
        Minecraft mc = Minecraft.getInstance();
        if (player == null || mc.gameMode == null) return;

        Integer containerSlot = ARMOR_SLOT_MAP.get(armorSlot);
        if (containerSlot == null) return;

        // Pick up item from inventory, place in armor slot
        mc.gameMode.handleInventoryMouseClick(
                player.inventoryMenu.containerId,
                inventorySlot,
                0,
                ClickType.PICKUP,
                player
        );
        mc.gameMode.handleInventoryMouseClick(
                player.inventoryMenu.containerId,
                containerSlot,
                0,
                ClickType.PICKUP,
                player
        );
        // If there was an existing armor piece, it's now on the cursor — place it back
        mc.gameMode.handleInventoryMouseClick(
                player.inventoryMenu.containerId,
                inventorySlot,
                0,
                ClickType.PICKUP,
                player
        );
    }
}
