/**
 * Hardcoded recipe database for common survival Minecraft items.
 * Each recipe defines ingredients, crafting grid layout, output count,
 * and whether a crafting table (3x3) is required.
 */

export const RECIPES = {
    // ==================== BASIC ====================

    'minecraft:oak_planks': {
        ingredients: { 'minecraft:oak_log': 1 },
        grid: [['minecraft:oak_log']],
        count: 4,
        needsTable: false
    },
    'minecraft:birch_planks': {
        ingredients: { 'minecraft:birch_log': 1 },
        grid: [['minecraft:birch_log']],
        count: 4,
        needsTable: false
    },
    'minecraft:spruce_planks': {
        ingredients: { 'minecraft:spruce_log': 1 },
        grid: [['minecraft:spruce_log']],
        count: 4,
        needsTable: false
    },
    'minecraft:dark_oak_planks': {
        ingredients: { 'minecraft:dark_oak_log': 1 },
        grid: [['minecraft:dark_oak_log']],
        count: 4,
        needsTable: false
    },
    'minecraft:jungle_planks': {
        ingredients: { 'minecraft:jungle_log': 1 },
        grid: [['minecraft:jungle_log']],
        count: 4,
        needsTable: false
    },
    'minecraft:acacia_planks': {
        ingredients: { 'minecraft:acacia_log': 1 },
        grid: [['minecraft:acacia_log']],
        count: 4,
        needsTable: false
    },

    'minecraft:stick': {
        ingredients: { 'minecraft:oak_planks': 2 },
        grid: [
            ['minecraft:oak_planks'],
            ['minecraft:oak_planks']
        ],
        count: 4,
        needsTable: false
    },

    'minecraft:crafting_table': {
        ingredients: { 'minecraft:oak_planks': 4 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:oak_planks'],
            ['minecraft:oak_planks', 'minecraft:oak_planks']
        ],
        count: 1,
        needsTable: false
    },

    'minecraft:furnace': {
        ingredients: { 'minecraft:cobblestone': 8 },
        grid: [
            ['minecraft:cobblestone', 'minecraft:cobblestone', 'minecraft:cobblestone'],
            ['minecraft:cobblestone', null, 'minecraft:cobblestone'],
            ['minecraft:cobblestone', 'minecraft:cobblestone', 'minecraft:cobblestone']
        ],
        count: 1,
        needsTable: true
    },

    'minecraft:chest': {
        ingredients: { 'minecraft:oak_planks': 8 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:oak_planks', 'minecraft:oak_planks'],
            ['minecraft:oak_planks', null, 'minecraft:oak_planks'],
            ['minecraft:oak_planks', 'minecraft:oak_planks', 'minecraft:oak_planks']
        ],
        count: 1,
        needsTable: true
    },

    'minecraft:torch': {
        ingredients: { 'minecraft:coal': 1, 'minecraft:stick': 1 },
        grid: [
            ['minecraft:coal'],
            ['minecraft:stick']
        ],
        count: 4,
        needsTable: false
    },

    'minecraft:ladder': {
        ingredients: { 'minecraft:stick': 7 },
        grid: [
            ['minecraft:stick', null, 'minecraft:stick'],
            ['minecraft:stick', 'minecraft:stick', 'minecraft:stick'],
            ['minecraft:stick', null, 'minecraft:stick']
        ],
        count: 3,
        needsTable: true
    },

    // ==================== WOODEN TOOLS ====================

    'minecraft:wooden_pickaxe': {
        ingredients: { 'minecraft:oak_planks': 3, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:oak_planks', 'minecraft:oak_planks'],
            [null, 'minecraft:stick', null],
            [null, 'minecraft:stick', null]
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:wooden_axe': {
        ingredients: { 'minecraft:oak_planks': 3, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:oak_planks'],
            ['minecraft:oak_planks', 'minecraft:stick'],
            [null, 'minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:wooden_shovel': {
        ingredients: { 'minecraft:oak_planks': 1, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:oak_planks'],
            ['minecraft:stick'],
            ['minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:wooden_sword': {
        ingredients: { 'minecraft:oak_planks': 2, 'minecraft:stick': 1 },
        grid: [
            ['minecraft:oak_planks'],
            ['minecraft:oak_planks'],
            ['minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:wooden_hoe': {
        ingredients: { 'minecraft:oak_planks': 2, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:oak_planks'],
            [null, 'minecraft:stick'],
            [null, 'minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== STONE TOOLS ====================

    'minecraft:stone_pickaxe': {
        ingredients: { 'minecraft:cobblestone': 3, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:cobblestone', 'minecraft:cobblestone', 'minecraft:cobblestone'],
            [null, 'minecraft:stick', null],
            [null, 'minecraft:stick', null]
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:stone_axe': {
        ingredients: { 'minecraft:cobblestone': 3, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:cobblestone', 'minecraft:cobblestone'],
            ['minecraft:cobblestone', 'minecraft:stick'],
            [null, 'minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:stone_shovel': {
        ingredients: { 'minecraft:cobblestone': 1, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:cobblestone'],
            ['minecraft:stick'],
            ['minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:stone_sword': {
        ingredients: { 'minecraft:cobblestone': 2, 'minecraft:stick': 1 },
        grid: [
            ['minecraft:cobblestone'],
            ['minecraft:cobblestone'],
            ['minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== IRON TOOLS ====================

    'minecraft:iron_pickaxe': {
        ingredients: { 'minecraft:iron_ingot': 3, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot'],
            [null, 'minecraft:stick', null],
            [null, 'minecraft:stick', null]
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:iron_axe': {
        ingredients: { 'minecraft:iron_ingot': 3, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:iron_ingot', 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', 'minecraft:stick'],
            [null, 'minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:iron_shovel': {
        ingredients: { 'minecraft:iron_ingot': 1, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:iron_ingot'],
            ['minecraft:stick'],
            ['minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:iron_sword': {
        ingredients: { 'minecraft:iron_ingot': 2, 'minecraft:stick': 1 },
        grid: [
            ['minecraft:iron_ingot'],
            ['minecraft:iron_ingot'],
            ['minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== DIAMOND TOOLS ====================

    'minecraft:diamond_pickaxe': {
        ingredients: { 'minecraft:diamond': 3, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:diamond', 'minecraft:diamond', 'minecraft:diamond'],
            [null, 'minecraft:stick', null],
            [null, 'minecraft:stick', null]
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:diamond_axe': {
        ingredients: { 'minecraft:diamond': 3, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:diamond', 'minecraft:diamond'],
            ['minecraft:diamond', 'minecraft:stick'],
            [null, 'minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:diamond_shovel': {
        ingredients: { 'minecraft:diamond': 1, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:diamond'],
            ['minecraft:stick'],
            ['minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:diamond_sword': {
        ingredients: { 'minecraft:diamond': 2, 'minecraft:stick': 1 },
        grid: [
            ['minecraft:diamond'],
            ['minecraft:diamond'],
            ['minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== IRON ARMOR ====================

    'minecraft:iron_helmet': {
        ingredients: { 'minecraft:iron_ingot': 5 },
        grid: [
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:iron_chestplate': {
        ingredients: { 'minecraft:iron_ingot': 8 },
        grid: [
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:iron_leggings': {
        ingredients: { 'minecraft:iron_ingot': 7 },
        grid: [
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:iron_boots': {
        ingredients: { 'minecraft:iron_ingot': 4 },
        grid: [
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== DIAMOND ARMOR ====================

    'minecraft:diamond_helmet': {
        ingredients: { 'minecraft:diamond': 5 },
        grid: [
            ['minecraft:diamond', 'minecraft:diamond', 'minecraft:diamond'],
            ['minecraft:diamond', null, 'minecraft:diamond']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:diamond_chestplate': {
        ingredients: { 'minecraft:diamond': 8 },
        grid: [
            ['minecraft:diamond', null, 'minecraft:diamond'],
            ['minecraft:diamond', 'minecraft:diamond', 'minecraft:diamond'],
            ['minecraft:diamond', 'minecraft:diamond', 'minecraft:diamond']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:diamond_leggings': {
        ingredients: { 'minecraft:diamond': 7 },
        grid: [
            ['minecraft:diamond', 'minecraft:diamond', 'minecraft:diamond'],
            ['minecraft:diamond', null, 'minecraft:diamond'],
            ['minecraft:diamond', null, 'minecraft:diamond']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:diamond_boots': {
        ingredients: { 'minecraft:diamond': 4 },
        grid: [
            ['minecraft:diamond', null, 'minecraft:diamond'],
            ['minecraft:diamond', null, 'minecraft:diamond']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== OTHER EQUIPMENT ====================

    'minecraft:shield': {
        ingredients: { 'minecraft:oak_planks': 6, 'minecraft:iron_ingot': 1 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:iron_ingot', 'minecraft:oak_planks'],
            ['minecraft:oak_planks', 'minecraft:oak_planks', 'minecraft:oak_planks'],
            [null, 'minecraft:oak_planks', null]
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:bow': {
        ingredients: { 'minecraft:stick': 3, 'minecraft:string': 3 },
        grid: [
            [null, 'minecraft:stick', 'minecraft:string'],
            ['minecraft:stick', null, 'minecraft:string'],
            [null, 'minecraft:stick', 'minecraft:string']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:arrow': {
        ingredients: { 'minecraft:flint': 1, 'minecraft:stick': 1, 'minecraft:feather': 1 },
        grid: [
            ['minecraft:flint'],
            ['minecraft:stick'],
            ['minecraft:feather']
        ],
        count: 4,
        needsTable: true
    },
    'minecraft:fishing_rod': {
        ingredients: { 'minecraft:stick': 3, 'minecraft:string': 2 },
        grid: [
            [null, null, 'minecraft:stick'],
            [null, 'minecraft:stick', 'minecraft:string'],
            ['minecraft:stick', null, 'minecraft:string']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:shears': {
        ingredients: { 'minecraft:iron_ingot': 2 },
        grid: [
            [null, 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', null]
        ],
        count: 1,
        needsTable: false
    },

    // ==================== TRANSPORT ====================

    'minecraft:oak_boat': {
        ingredients: { 'minecraft:oak_planks': 5 },
        grid: [
            ['minecraft:oak_planks', null, 'minecraft:oak_planks'],
            ['minecraft:oak_planks', 'minecraft:oak_planks', 'minecraft:oak_planks']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:rail': {
        ingredients: { 'minecraft:iron_ingot': 6, 'minecraft:stick': 1 },
        grid: [
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', 'minecraft:stick', 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot']
        ],
        count: 16,
        needsTable: true
    },
    'minecraft:minecart': {
        ingredients: { 'minecraft:iron_ingot': 5 },
        grid: [
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== UTILITY ====================

    'minecraft:bucket': {
        ingredients: { 'minecraft:iron_ingot': 3 },
        grid: [
            ['minecraft:iron_ingot', null, 'minecraft:iron_ingot'],
            [null, 'minecraft:iron_ingot', null]
        ],
        count: 1,
        needsTable: true
    },

    'minecraft:bed': {
        ingredients: { 'minecraft:white_wool': 3, 'minecraft:oak_planks': 3 },
        grid: [
            ['minecraft:white_wool', 'minecraft:white_wool', 'minecraft:white_wool'],
            ['minecraft:oak_planks', 'minecraft:oak_planks', 'minecraft:oak_planks']
        ],
        count: 1,
        needsTable: true
    },

    'minecraft:oak_door': {
        ingredients: { 'minecraft:oak_planks': 6 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:oak_planks'],
            ['minecraft:oak_planks', 'minecraft:oak_planks'],
            ['minecraft:oak_planks', 'minecraft:oak_planks']
        ],
        count: 3,
        needsTable: true
    },

    'minecraft:oak_fence': {
        ingredients: { 'minecraft:oak_planks': 4, 'minecraft:stick': 2 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:stick', 'minecraft:oak_planks'],
            ['minecraft:oak_planks', 'minecraft:stick', 'minecraft:oak_planks']
        ],
        count: 3,
        needsTable: true
    },

    'minecraft:oak_fence_gate': {
        ingredients: { 'minecraft:stick': 4, 'minecraft:oak_planks': 2 },
        grid: [
            ['minecraft:stick', 'minecraft:oak_planks', 'minecraft:stick'],
            ['minecraft:stick', 'minecraft:oak_planks', 'minecraft:stick']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== STORAGE BLOCKS ====================

    'minecraft:iron_block': {
        ingredients: { 'minecraft:iron_ingot': 9 },
        grid: [
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot'],
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:gold_block': {
        ingredients: { 'minecraft:gold_ingot': 9 },
        grid: [
            ['minecraft:gold_ingot', 'minecraft:gold_ingot', 'minecraft:gold_ingot'],
            ['minecraft:gold_ingot', 'minecraft:gold_ingot', 'minecraft:gold_ingot'],
            ['minecraft:gold_ingot', 'minecraft:gold_ingot', 'minecraft:gold_ingot']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:diamond_block': {
        ingredients: { 'minecraft:diamond': 9 },
        grid: [
            ['minecraft:diamond', 'minecraft:diamond', 'minecraft:diamond'],
            ['minecraft:diamond', 'minecraft:diamond', 'minecraft:diamond'],
            ['minecraft:diamond', 'minecraft:diamond', 'minecraft:diamond']
        ],
        count: 1,
        needsTable: true
    },

    // ==================== ADVANCED CRAFTING ====================

    'minecraft:anvil': {
        ingredients: { 'minecraft:iron_block': 3, 'minecraft:iron_ingot': 4 },
        grid: [
            ['minecraft:iron_block', 'minecraft:iron_block', 'minecraft:iron_block'],
            [null, 'minecraft:iron_ingot', null],
            ['minecraft:iron_ingot', 'minecraft:iron_ingot', 'minecraft:iron_ingot']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:brewing_stand': {
        ingredients: { 'minecraft:blaze_rod': 1, 'minecraft:cobblestone': 3 },
        grid: [
            [null, 'minecraft:blaze_rod', null],
            ['minecraft:cobblestone', 'minecraft:cobblestone', 'minecraft:cobblestone']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:bookshelf': {
        ingredients: { 'minecraft:oak_planks': 6, 'minecraft:book': 3 },
        grid: [
            ['minecraft:oak_planks', 'minecraft:oak_planks', 'minecraft:oak_planks'],
            ['minecraft:book', 'minecraft:book', 'minecraft:book'],
            ['minecraft:oak_planks', 'minecraft:oak_planks', 'minecraft:oak_planks']
        ],
        count: 1,
        needsTable: true
    },
    'minecraft:book': {
        ingredients: { 'minecraft:paper': 3, 'minecraft:leather': 1 },
        grid: [
            ['minecraft:paper'],
            ['minecraft:paper'],
            ['minecraft:paper', 'minecraft:leather']
        ],
        count: 1,
        needsTable: false
    },
    'minecraft:paper': {
        ingredients: { 'minecraft:sugar_cane': 3 },
        grid: [
            ['minecraft:sugar_cane', 'minecraft:sugar_cane', 'minecraft:sugar_cane']
        ],
        count: 3,
        needsTable: true
    },

    'minecraft:glass_pane': {
        ingredients: { 'minecraft:glass': 6 },
        grid: [
            ['minecraft:glass', 'minecraft:glass', 'minecraft:glass'],
            ['minecraft:glass', 'minecraft:glass', 'minecraft:glass']
        ],
        count: 16,
        needsTable: true
    },
    'minecraft:glass_bottle': {
        ingredients: { 'minecraft:glass': 3 },
        grid: [
            ['minecraft:glass', null, 'minecraft:glass'],
            [null, 'minecraft:glass', null]
        ],
        count: 3,
        needsTable: true
    },

    'minecraft:bread': {
        ingredients: { 'minecraft:wheat': 3 },
        grid: [
            ['minecraft:wheat', 'minecraft:wheat', 'minecraft:wheat']
        ],
        count: 1,
        needsTable: true
    }
};

/**
 * Items that are raw materials — they must be mined/found, not crafted.
 * The recipe resolver uses this to know when to emit MINE actions.
 */
export const RAW_MATERIALS = new Set([
    'minecraft:oak_log', 'minecraft:birch_log', 'minecraft:spruce_log',
    'minecraft:dark_oak_log', 'minecraft:jungle_log', 'minecraft:acacia_log',
    'minecraft:cobblestone', 'minecraft:stone', 'minecraft:deepslate',
    'minecraft:coal', 'minecraft:iron_ingot', 'minecraft:gold_ingot',
    'minecraft:diamond', 'minecraft:emerald', 'minecraft:lapis_lazuli',
    'minecraft:redstone', 'minecraft:copper_ingot',
    'minecraft:sand', 'minecraft:gravel', 'minecraft:dirt',
    'minecraft:clay_ball', 'minecraft:leather', 'minecraft:string',
    'minecraft:feather', 'minecraft:flint', 'minecraft:sugar_cane',
    'minecraft:wheat', 'minecraft:white_wool', 'minecraft:glass',
    'minecraft:blaze_rod', 'minecraft:netherite_ingot',
    'minecraft:obsidian'
]);

/**
 * Map of generic ingredient names to acceptable alternatives.
 * When checking inventory, any of these variants satisfy the requirement.
 * The key is used in recipes; the values are all acceptable item IDs.
 */
export const PLANKS_VARIANTS = [
    'minecraft:oak_planks', 'minecraft:birch_planks', 'minecraft:spruce_planks',
    'minecraft:dark_oak_planks', 'minecraft:jungle_planks', 'minecraft:acacia_planks',
    'minecraft:mangrove_planks', 'minecraft:cherry_planks', 'minecraft:bamboo_planks',
    'minecraft:crimson_planks', 'minecraft:warped_planks'
];

export const LOG_VARIANTS = [
    'minecraft:oak_log', 'minecraft:birch_log', 'minecraft:spruce_log',
    'minecraft:dark_oak_log', 'minecraft:jungle_log', 'minecraft:acacia_log',
    'minecraft:mangrove_log', 'minecraft:cherry_log'
];
