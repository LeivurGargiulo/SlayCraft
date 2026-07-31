import { RECIPES, RAW_MATERIALS, PLANKS_VARIANTS, LOG_VARIANTS } from '../data/recipes.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RecipeResolver');

export class RecipeResolver {

    /**
     * Resolve a crafting request into an ordered list of steps.
     * Each step is either a MINE action or a CRAFT action.
     *
     * @param {string} targetItem - The item to craft (e.g. 'minecraft:diamond_pickaxe')
     * @param {number} targetCount - How many to craft
     * @param {Array} inventory - Current inventory [{item, count, slot}, ...]
     * @returns {Array|null} Ordered step list, or null if recipe not found
     */
    resolve(targetItem, targetCount, inventory) {
        const recipe = this.findRecipe(targetItem);
        if (!recipe) {
            log.warn(`No recipe found for ${targetItem}`);
            return null;
        }

        // Build an inventory map for tracking available items
        const available = this._buildInventoryMap(inventory);
        const steps = [];

        try {
            this._resolveRecursive(targetItem, targetCount, available, steps, new Set());
        } catch (e) {
            log.error(`Error resolving recipe for ${targetItem}: ${e.message}`);
            return null;
        }

        log.info(`Resolved ${targetItem} x${targetCount} into ${steps.length} steps`);
        return steps;
    }

    /**
     * Recursively resolve a crafting dependency chain.
     */
    _resolveRecursive(item, count, available, steps, visiting) {
        // Prevent infinite recursion
        if (visiting.has(item)) {
            throw new Error(`Circular dependency detected for ${item}`);
        }

        // Check if we already have enough
        const have = this._getAvailable(item, available);
        if (have >= count) {
            return;
        }

        const needed = count - have;

        // If it's a raw material, emit a MINE action
        if (this.isRawMaterial(item)) {
            const mineBlock = this._getMineBlock(item);
            if (mineBlock) {
                steps.push({
                    type: 'MINE',
                    block: mineBlock,
                    quantity: needed
                });
                // Assume mining will provide the materials
                available.set(item, (available.get(item) || 0) + needed);
            }
            return;
        }

        const recipe = this.findRecipe(item);
        if (!recipe) {
            // Can't craft and can't mine — treat as raw material
            log.warn(`No recipe for ${item}, treating as raw material`);
            const mineBlock = this._getMineBlock(item);
            if (mineBlock) {
                steps.push({ type: 'MINE', block: mineBlock, quantity: needed });
                available.set(item, (available.get(item) || 0) + needed);
            }
            return;
        }

        visiting.add(item);

        // Calculate how many crafts we need (accounting for output count)
        const craftsNeeded = Math.ceil(needed / recipe.count);

        // If the recipe needs a crafting table and we don't have one, resolve that first
        if (recipe.needsTable && !this._getAvailable('minecraft:crafting_table', available)) {
            this._resolveRecursive('minecraft:crafting_table', 1, available, steps, new Set(visiting));
        }

        // Resolve each ingredient
        for (const [ingredient, amountPerCraft] of Object.entries(recipe.ingredients)) {
            const totalNeeded = amountPerCraft * craftsNeeded;
            this._resolveRecursive(ingredient, totalNeeded, available, steps, new Set(visiting));

            // Consume ingredients from available
            const currentAvail = this._getAvailable(ingredient, available);
            available.set(ingredient, Math.max(0, currentAvail - totalNeeded));
        }

        // Emit the CRAFT action
        steps.push({
            type: 'CRAFT',
            item: item,
            count: craftsNeeded,
            needsTable: recipe.needsTable,
            grid: recipe.grid
        });

        // Add crafted items to available
        const produced = craftsNeeded * recipe.count;
        available.set(item, (available.get(item) || 0) + produced);

        visiting.delete(item);
    }

    /**
     * Find a recipe for the given item.
     * Handles direct lookup.
     */
    findRecipe(item) {
        return RECIPES[item] || null;
    }

    /**
     * Check if an item is a raw material (must be mined/found, not crafted).
     */
    isRawMaterial(item) {
        return RAW_MATERIALS.has(item);
    }

    /**
     * Check if we can craft an item with the current inventory.
     */
    canCraft(item, inventory) {
        const recipe = this.findRecipe(item);
        if (!recipe) return false;

        const available = this._buildInventoryMap(inventory);
        for (const [ingredient, amount] of Object.entries(recipe.ingredients)) {
            if (this._getAvailable(ingredient, available) < amount) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get missing materials for a recipe.
     * @returns {Object} Map of {itemId: countNeeded}
     */
    getMissingMaterials(item, count, inventory) {
        const recipe = this.findRecipe(item);
        if (!recipe) return null;

        const available = this._buildInventoryMap(inventory);
        const craftsNeeded = Math.ceil(count / recipe.count);
        const missing = {};

        for (const [ingredient, amountPerCraft] of Object.entries(recipe.ingredients)) {
            const totalNeeded = amountPerCraft * craftsNeeded;
            const have = this._getAvailable(ingredient, available);
            if (have < totalNeeded) {
                missing[ingredient] = totalNeeded - have;
            }
        }

        return missing;
    }

    /**
     * Get a list of all craftable items.
     */
    getCraftableItems() {
        return Object.keys(RECIPES);
    }

    /**
     * Build an inventory map from the world state inventory array.
     */
    _buildInventoryMap(inventory) {
        const map = new Map();
        if (!inventory) return map;

        for (const item of inventory) {
            const id = item.item || item.itemId;
            if (id) {
                map.set(id, (map.get(id) || 0) + (item.count || 1));
            }
        }
        return map;
    }

    /**
     * Get available count for an item, considering variants.
     * E.g., if recipe needs oak_planks, any planks type will work for crafting.
     */
    _getAvailable(item, available) {
        // Direct match
        const direct = available.get(item) || 0;
        if (direct > 0) return direct;

        // Check planks variants
        if (PLANKS_VARIANTS.includes(item)) {
            for (const variant of PLANKS_VARIANTS) {
                const count = available.get(variant) || 0;
                if (count > 0) return count;
            }
        }

        // Check log variants
        if (LOG_VARIANTS.includes(item)) {
            for (const variant of LOG_VARIANTS) {
                const count = available.get(variant) || 0;
                if (count > 0) return count;
            }
        }

        return 0;
    }

    /**
     * Map an item ID to the block that should be mined to obtain it.
     */
    _getMineBlock(item) {
        const mineMap = {
            'minecraft:oak_log': 'minecraft:oak_log',
            'minecraft:birch_log': 'minecraft:birch_log',
            'minecraft:spruce_log': 'minecraft:spruce_log',
            'minecraft:dark_oak_log': 'minecraft:dark_oak_log',
            'minecraft:jungle_log': 'minecraft:jungle_log',
            'minecraft:acacia_log': 'minecraft:acacia_log',
            'minecraft:cobblestone': 'minecraft:stone',
            'minecraft:stone': 'minecraft:stone',
            'minecraft:deepslate': 'minecraft:deepslate',
            'minecraft:coal': 'minecraft:coal_ore',
            'minecraft:diamond': 'minecraft:diamond_ore',
            'minecraft:iron_ingot': 'minecraft:iron_ore',
            'minecraft:gold_ingot': 'minecraft:gold_ore',
            'minecraft:emerald': 'minecraft:emerald_ore',
            'minecraft:lapis_lazuli': 'minecraft:lapis_ore',
            'minecraft:redstone': 'minecraft:redstone_ore',
            'minecraft:copper_ingot': 'minecraft:copper_ore',
            'minecraft:sand': 'minecraft:sand',
            'minecraft:gravel': 'minecraft:gravel',
            'minecraft:dirt': 'minecraft:dirt',
            'minecraft:obsidian': 'minecraft:obsidian',
            'minecraft:sugar_cane': 'minecraft:sugar_cane',
            'minecraft:flint': 'minecraft:gravel'
        };

        return mineMap[item] || item;
    }
}
