import { createLogger } from '../utils/logger.js';

const log = createLogger('Validator');

const VALID_ACTION_TYPES = [
    'GOTO', 'MINE', 'FOLLOW_PLAYER', 'STOP', 'EAT',
    'ATTACK_NEAREST_HOSTILE', 'BUILD_STRUCTURE', 'CHAT',
    'EXPLORE', 'IDLE', 'CRAFT', 'FLY_TO', 'BOAT_TO',
    'STORE_ITEMS', 'NETHER_TRAVEL', 'RETRIEVE_FROM_CHEST'
];

const VALID_PRIORITIES = ['low', 'medium', 'high', 'emergency'];
const COORD_LIMIT = 30000000; // Minecraft world border
function clampCoord(v) { return Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, Math.round(v))); }

export class ActionValidator {
    /**
     * Validate and sanitize a Gemini response.
     * Returns the validated response or null if invalid.
     */
    validate(response) {
        if (!response || typeof response !== 'object') {
            log.warn('Response is not an object');
            return null;
        }

        // Validate intent
        if (!response.intent || typeof response.intent !== 'string') {
            log.warn('Missing or invalid intent field');
            return null;
        }

        // Fix priority if invalid
        if (!VALID_PRIORITIES.includes(response.priority)) {
            log.debug(`Invalid priority "${response.priority}", defaulting to "medium"`);
            response.priority = 'medium';
        }

        // Validate actions array
        if (!Array.isArray(response.actions)) {
            log.warn('Actions field is not an array');
            return null;
        }

        // Validate each action
        const validActions = [];
        for (const action of response.actions) {
            const validated = this.validateAction(action);
            if (validated) {
                validActions.push(validated);
            }
        }

        // It's OK to have 0 actions (chat-only response)
        if (validActions.length === 0 && response.actions.length > 0) {
            log.warn('All actions were invalid');
            return null;
        }

        // Validate chat_response
        let chatResponse = null;
        if (response.chat_response && typeof response.chat_response === 'string') {
            chatResponse = response.chat_response.substring(0, 256);
        }

        return {
            intent: response.intent,
            priority: response.priority,
            actions: validActions,
            chat_response: chatResponse
        };
    }

    /**
     * Validate a single action object.
     */
    validateAction(action) {
        if (!action || typeof action !== 'object' || !action.type) {
            log.debug('Invalid action: missing or no type');
            return null;
        }

        if (!VALID_ACTION_TYPES.includes(action.type)) {
            log.warn(`Unknown action type: "${action.type}"`);
            return null;
        }

        switch (action.type) {
            case 'GOTO': {
                // Must have at least x and z, or a player name
                if (action.player && typeof action.player === 'string') {
                    return { type: 'GOTO', player: action.player };
                }
                // Coerce string coordinates to numbers (Gemini sometimes returns "100" instead of 100)
                const gotoX = Number(action.x);
                const gotoZ = Number(action.z);
                if (isNaN(gotoX) || isNaN(gotoZ)) {
                    log.warn('GOTO action missing x/z coordinates or player');
                    return null;
                }
                return {
                    type: 'GOTO',
                    x: clampCoord(gotoX),
                    y: action.y != null ? clampCoord(Number(action.y)) : undefined,
                    z: clampCoord(gotoZ)
                };
            }

            case 'MINE': {
                if (typeof action.block !== 'string' || action.block.length === 0) {
                    log.warn('MINE action missing block name');
                    return null;
                }
                const mineQty = action.quantity != null ? Number(action.quantity) : NaN;
                return {
                    type: 'MINE',
                    block: action.block,
                    quantity: !isNaN(mineQty) ? Math.max(0, Math.round(mineQty)) : undefined
                };
            }

            case 'FOLLOW_PLAYER':
                if (typeof action.player !== 'string' || action.player.length === 0) {
                    log.warn('FOLLOW_PLAYER action missing player name');
                    return null;
                }
                return { type: 'FOLLOW_PLAYER', player: action.player };

            case 'BUILD_STRUCTURE':
                if (typeof action.schematic !== 'string' || action.schematic.length === 0) {
                    log.warn('BUILD_STRUCTURE action missing schematic name');
                    return null;
                }
                return { type: 'BUILD_STRUCTURE', schematic: action.schematic };

            case 'CHAT':
                if (typeof action.message !== 'string' || action.message.length === 0) {
                    log.warn('CHAT action missing message');
                    return null;
                }
                return { type: 'CHAT', message: action.message.substring(0, 256) };

            case 'EXPLORE': {
                const expX = action.centerX != null ? Number(action.centerX) : NaN;
                const expZ = action.centerZ != null ? Number(action.centerZ) : NaN;
                return {
                    type: 'EXPLORE',
                    centerX: !isNaN(expX) ? Math.round(expX) : undefined,
                    centerZ: !isNaN(expZ) ? Math.round(expZ) : undefined
                };
            }

            case 'CRAFT':
                if (typeof action.item !== 'string' || action.item.length === 0) {
                    log.warn('CRAFT action missing item name');
                    return null;
                }
                return {
                    type: 'CRAFT',
                    item: action.item,
                    count: typeof action.count === 'number' ? Math.max(1, Math.round(action.count)) : 1
                };

            case 'FLY_TO': {
                const flyX = Number(action.x);
                const flyZ = Number(action.z);
                if (isNaN(flyX) || isNaN(flyZ)) {
                    log.warn('FLY_TO action missing x/z coordinates');
                    return null;
                }
                return {
                    type: 'FLY_TO',
                    x: clampCoord(flyX),
                    y: action.y != null ? clampCoord(Number(action.y)) : 100,
                    z: clampCoord(flyZ)
                };
            }

            case 'BOAT_TO': {
                const boatX = Number(action.x);
                const boatZ = Number(action.z);
                if (isNaN(boatX) || isNaN(boatZ)) {
                    log.warn('BOAT_TO action missing x/z coordinates');
                    return null;
                }
                return {
                    type: 'BOAT_TO',
                    x: clampCoord(boatX),
                    z: clampCoord(boatZ)
                };
            }

            case 'NETHER_TRAVEL': {
                const ntPortalX = Number(action.portalX);
                const ntPortalZ = Number(action.portalZ);
                const ntDestX = Number(action.destX);
                const ntDestZ = Number(action.destZ);
                if (isNaN(ntPortalX) || isNaN(ntPortalZ)) {
                    log.warn('NETHER_TRAVEL action missing portalX/portalZ');
                    return null;
                }
                if (isNaN(ntDestX) || isNaN(ntDestZ)) {
                    // Graceful degradation: convert to GOTO targeting the portal
                    log.warn('NETHER_TRAVEL missing destX/destZ, converting to GOTO toward portal');
                    return {
                        type: 'GOTO',
                        x: clampCoord(ntPortalX),
                        y: action.portalY != null ? clampCoord(Number(action.portalY)) : undefined,
                        z: clampCoord(ntPortalZ)
                    };
                }
                return {
                    type: 'NETHER_TRAVEL',
                    portalX: clampCoord(ntPortalX),
                    portalY: action.portalY != null ? clampCoord(Number(action.portalY)) : undefined,
                    portalZ: clampCoord(ntPortalZ),
                    netherTargetX: action.netherTargetX != null ? clampCoord(Number(action.netherTargetX)) : undefined,
                    netherTargetZ: action.netherTargetZ != null ? clampCoord(Number(action.netherTargetZ)) : undefined,
                    destX: clampCoord(ntDestX),
                    destZ: clampCoord(ntDestZ)
                };
            }

            case 'STOP':
            case 'EAT':
            case 'ATTACK_NEAREST_HOSTILE':
            case 'IDLE':
            case 'STORE_ITEMS':
                return { type: action.type };

            case 'RETRIEVE_FROM_CHEST': {
                if (!action.item) {
                    log.warn('RETRIEVE_FROM_CHEST missing item');
                    return null;
                }
                const validated = { type: 'RETRIEVE_FROM_CHEST', item: String(action.item) };
                if (action.quantity != null) validated.quantity = Math.max(1, Math.round(Number(action.quantity)));
                return validated;
            }

            default:
                return null;
        }
    }
}
