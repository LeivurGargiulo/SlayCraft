import { createLogger } from './logger.js';

const log = createLogger('InventoryAnalyzer');

const TOTAL_INVENTORY_SLOTS = 36;
const NEARLY_FULL_THRESHOLD = 31;  // 5 or fewer empty slots

export class InventoryAnalyzer {
    /**
     * Analyze inventory from worldState.
     * @returns {{ usedSlots: number, emptySlots: number, isNearlyFull: boolean }}
     */
    static analyze(worldState) {
        if (!worldState || !worldState.inventory) {
            return { usedSlots: 0, emptySlots: TOTAL_INVENTORY_SLOTS, isNearlyFull: false };
        }

        // Use usedInventorySlots if available (sent by mod), otherwise count unique slots
        let usedSlots;
        if (typeof worldState.usedInventorySlots === 'number') {
            usedSlots = worldState.usedInventorySlots;
        } else {
            const occupiedSlots = new Set();
            for (const item of worldState.inventory) {
                if (item.slot !== undefined && item.slot >= 0) {
                    occupiedSlots.add(item.slot);
                }
            }
            usedSlots = occupiedSlots.size;
        }

        const emptySlots = TOTAL_INVENTORY_SLOTS - usedSlots;
        const isNearlyFull = usedSlots >= NEARLY_FULL_THRESHOLD;

        if (isNearlyFull) {
            log.info(`Inventory nearly full: ${usedSlots}/${TOTAL_INVENTORY_SLOTS} slots used`);
        }

        return { usedSlots, emptySlots, isNearlyFull };
    }
}
