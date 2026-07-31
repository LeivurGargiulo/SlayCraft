import 'dotenv/config';
import { GameWebSocketServer } from './server/websocketServer.js';
import { ActionPlanner } from './planner/actionPlanner.js';
import { MemoryStore } from './memory/memoryStore.js';
import { GoalManager } from './memory/goalManager.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('Main');

// ========== Validate Environment ==========

if (!process.env.GEMINI_API_KEY) {
    log.error('GEMINI_API_KEY is not set. Create a .env file from .env.example');
    process.exit(1);
}

const port = parseInt(process.env.WS_PORT || '3000');
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const botName = process.env.BOT_NAME || 'Bot';
const whitelist = (process.env.BOT_WHITELIST || '').split(',').map(s => s.trim()).filter(Boolean);
const blacklist = (process.env.BOT_BLACKLIST || '').split(',').map(s => s.trim()).filter(Boolean);

// ========== Initialize Components ==========

log.info('Starting Baritone AI Backend...');
log.info(`Gemini model: ${model}`);
log.info(`WebSocket port: ${port}`);
log.info(`Bot name: ${botName}`);

const memory = new MemoryStore();
const goalManager = new GoalManager();
const planner = new ActionPlanner(memory, goalManager, botName);
const server = new GameWebSocketServer(planner, memory, goalManager, { botName, whitelist, blacklist });

// ========== Start Server ==========

server.start(port);
log.info('Baritone AI Backend is running');
log.info('Waiting for Minecraft mod to connect...');

// ========== Graceful Shutdown ==========

function shutdown() {
    log.info('Shutting down...');
    memory.save();
    server.stop();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (err) => {
    log.error('Uncaught exception:', err);
    memory.save();
});

process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection:', reason);
});
