import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Memory');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_FILE = path.join(__dirname, 'memory.json');

const DEFAULT_MEMORY = {
    knownPlayers: {},
    homeLocation: null,
    baseLocation: null,
    importantLocations: {},
    resourceCache: {},
    conversationHistory: [],
    botPersonality: 'helpful, friendly, and eager to assist. Speaks casually like a real player.',
    lastKnownState: null,
    idleMode: 'stay_put',
    portalPairs: []
};

export class MemoryStore {
    constructor() {
        this.data = this.load();
    }

    load() {
        try {
            if (fs.existsSync(MEMORY_FILE)) {
                const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
                const parsed = JSON.parse(raw);
                return { ...DEFAULT_MEMORY, ...parsed };
            }
        } catch (e) {
            log.error('Failed to load memory, using defaults:', e.message);
        }
        return { ...DEFAULT_MEMORY };
    }

    save() {
        try {
            fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.data, null, 2));
        } catch (e) {
            log.error('Failed to save memory:', e.message);
        }
    }

    // ========== Player Tracking ==========

    updatePlayer(name, info) {
        this.data.knownPlayers[name] = {
            ...this.data.knownPlayers[name],
            ...info,
            lastSeen: Date.now()
        };
        this.save();
    }

    getPlayer(name) {
        return this.data.knownPlayers[name] || null;
    }

    // ========== Conversation History (ring buffer of 20) ==========

    addConversation(sender, message, botResponse) {
        this.data.conversationHistory.push({
            sender,
            message,
            botResponse,
            timestamp: Date.now()
        });

        // Keep only the last 20 entries
        if (this.data.conversationHistory.length > 20) {
            this.data.conversationHistory = this.data.conversationHistory.slice(-20);
        }
        this.save();
    }

    getRecentConversations(count = 5) {
        return this.data.conversationHistory.slice(-count);
    }

    // ========== Locations ==========

    setHome(x, y, z) {
        this.data.homeLocation = { x: Math.round(x), y: Math.round(y), z: Math.round(z) };
        log.info(`Home set to ${x}, ${y}, ${z}`);
        this.save();
    }

    setLocation(name, x, y, z) {
        this.data.importantLocations[name] = {
            x: Math.round(x),
            y: Math.round(y),
            z: Math.round(z)
        };
        this.save();
    }

    // ========== Base Location ==========

    setBase(x, y, z) {
        this.data.baseLocation = { x: Math.round(x), y: Math.round(y), z: Math.round(z) };
        log.info(`Base set to ${x}, ${y}, ${z}`);
        this.save();
    }

    getBase() {
        return this.data.baseLocation;
    }

    // ========== Idle Mode ==========

    setIdleMode(mode) {
        this.data.idleMode = mode;
        log.info(`Idle mode set to: ${mode}`);
        this.save();
    }

    getIdleMode() {
        return this.data.idleMode || 'stay_put';
    }

    // ========== Portal Pairs ==========

    addPortalPair(overworld, nether) {
        if (!this.data.portalPairs) this.data.portalPairs = [];

        // Deduplicate: if a pair exists within 16 blocks of both sides, update it
        const existing = this.data.portalPairs.find(p => {
            const owDist = Math.sqrt(
                (p.overworld.x - overworld.x) ** 2 + (p.overworld.z - overworld.z) ** 2
            );
            const nDist = Math.sqrt(
                (p.nether.x - nether.x) ** 2 + (p.nether.z - nether.z) ** 2
            );
            return owDist < 16 && nDist < 16;
        });

        if (existing) {
            existing.overworld = overworld;
            existing.nether = nether;
            existing.lastUsed = Date.now();
            log.info(`Updated portal pair: OW(${overworld.x},${overworld.y},${overworld.z}) <-> N(${nether.x},${nether.y},${nether.z})`);
        } else {
            this.data.portalPairs.push({
                overworld,
                nether,
                discoveredAt: Date.now(),
                lastUsed: Date.now()
            });
            log.info(`New portal pair: OW(${overworld.x},${overworld.y},${overworld.z}) <-> N(${nether.x},${nether.y},${nether.z})`);
        }
        this.save();
    }

    getPortalPairs() {
        return this.data.portalPairs || [];
    }

    /**
     * Find the nearest portal pair where the overworld side is within maxDist of (x, z).
     */
    findNearestOverworldPortal(x, z, maxDist = 200) {
        const pairs = this.getPortalPairs();
        let nearest = null;
        let nearestDist = maxDist;

        for (const pair of pairs) {
            const dist = Math.sqrt(
                (pair.overworld.x - x) ** 2 + (pair.overworld.z - z) ** 2
            );
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = pair;
            }
        }
        return nearest;
    }

    /**
     * Find the nearest portal pair where the overworld side is closest to the destination.
     */
    findNearestExitPair(destX, destZ, maxDist = 500) {
        const pairs = this.getPortalPairs();
        let nearest = null;
        let nearestDist = maxDist;

        for (const pair of pairs) {
            const dist = Math.sqrt(
                (pair.overworld.x - destX) ** 2 + (pair.overworld.z - destZ) ** 2
            );
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = pair;
            }
        }
        return nearest;
    }

    // ========== Resource Cache ==========

    updateResource(resourceName, location, count) {
        this.data.resourceCache[resourceName] = {
            lastSeenAt: location,
            count,
            lastUpdated: Date.now()
        };
        this.save();
    }

    // ========== Context for Gemini Prompt ==========

    getContextForPrompt() {
        return {
            knownPlayers: this.data.knownPlayers,
            homeLocation: this.data.homeLocation,
            baseLocation: this.data.baseLocation,
            importantLocations: this.data.importantLocations,
            recentConversations: this.getRecentConversations(5),
            personality: this.data.botPersonality,
            idleMode: this.data.idleMode,
            knownPortals: (this.data.portalPairs || []).map(p => ({
                overworld: p.overworld,
                nether: p.nether
            }))
        };
    }

    // ========== State Tracking ==========

    updateLastKnownState(worldState) {
        this.data.lastKnownState = worldState;
        // Don't save on every state update — too frequent
    }
}
