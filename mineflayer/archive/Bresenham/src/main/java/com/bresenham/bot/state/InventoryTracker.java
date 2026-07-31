package com.bresenham.bot.state;

import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.component.DataComponentTypes;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.item.Items;
import net.minecraft.item.PickaxeItem;
import net.minecraft.item.SwordItem;

/**
 * Monitors and provides helpers for inventory state.
 */
public class InventoryTracker {

    private PlayerInventory inventory;

    public void update(PlayerInventory inventory) {
        this.inventory = inventory;
    }

    public boolean hasItem(Item item) {
        if (inventory == null) return false;
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (!stack.isEmpty() && stack.getItem() == item) {
                return true;
            }
        }
        return false;
    }

    public int getItemCount(Item item) {
        if (inventory == null) return 0;
        int count = 0;
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (!stack.isEmpty() && stack.getItem() == item) {
                count += stack.getCount();
            }
        }
        return count;
    }

    /**
     * @return true if the player has any type of pickaxe
     */
    public boolean hasPickaxe() {
        if (inventory == null) return false;
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (!stack.isEmpty() && stack.getItem() instanceof PickaxeItem) {
                return true;
            }
        }
        return false;
    }

    /**
     * @return true if the player has any type of sword
     */
    public boolean hasSword() {
        if (inventory == null) return false;
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (!stack.isEmpty() && stack.getItem() instanceof SwordItem) {
                return true;
            }
        }
        return false;
    }

    /**
     * @return true if the player has any food items
     */
    public boolean hasFood() {
        if (inventory == null) return false;
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (!stack.isEmpty() && stack.get(DataComponentTypes.FOOD) != null) {
                return true;
            }
        }
        return false;
    }

    /**
     * Find the first food item in the inventory.
     * @return the slot index, or -1 if no food found
     */
    public int findFoodSlot() {
        if (inventory == null) return -1;
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (!stack.isEmpty() && stack.get(DataComponentTypes.FOOD) != null) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Find the first ItemStack of the given item.
     * @return the stack, or ItemStack.EMPTY if not found
     */
    public ItemStack findItem(Item item) {
        if (inventory == null) return ItemStack.EMPTY;
        for (int i = 0; i < inventory.size(); i++) {
            ItemStack stack = inventory.getStack(i);
            if (!stack.isEmpty() && stack.getItem() == item) {
                return stack;
            }
        }
        return ItemStack.EMPTY;
    }

    /**
     * Get the remaining durability of a tool.
     * @return remaining uses, or -1 if the item has no durability
     */
    public int getToolDurability(ItemStack stack) {
        if (stack.isEmpty() || stack.getMaxDamage() == 0) return -1;
        return stack.getMaxDamage() - stack.getDamage();
    }

    public PlayerInventory getInventory() {
        return inventory;
    }
}
