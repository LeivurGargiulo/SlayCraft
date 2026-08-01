const path = require('path');
require('dotenv').config();
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const JobManager = require('./src/db');
const ExecutionEngine = require('./src/executionEngine');
const { registerCommands } = require('./src/commands');
const { getProvider } = require('./src/llm/provider');
const { planJob } = require('./src/planner');

// Registers every tool as a side effect of requiring it (registerTool call at module load).
require('./src/tools/flatten');
require('./src/tools/buildWall');
require('./src/tools/buildBox');
require('./src/tools/buildSchematic');

// ---- CONFIG ----
const HOST = 'localhost';
const PORT = 25564;
const MC_VERSION = '1.21.11';
const AUTH = 'microsoft';
const BOT_USERNAME = 'BjornViking206'; // <-- fill in

const WHITELIST = new Set([
  'SlayerL99' // <-- fill in your real in-game name
]);

const ADMINS = new Set([
  'SlayerL99'
]);

const DB_PATH = path.join(__dirname, 'jobs.db');
const LLM_PROVIDER_NAME = process.env.LLM_PROVIDER || 'gemini';

function createBot() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: BOT_USERNAME,
    auth: AUTH,
    version: MC_VERSION,
    checkTimeoutInterval: 150000
  });

  bot.loadPlugin(pathfinder);

  const jobManager = new JobManager(DB_PATH);
  const executionEngine = new ExecutionEngine(bot, jobManager);
  const provider = getProvider(LLM_PROVIDER_NAME);

  const jobState = { currentJobId: null };
  let processing = false;

  function worldContextFor() {
    return {
      botPosition: bot.entity ? { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z } : null,
      inventory: bot.inventory ? bot.inventory.items().map((i) => ({ name: i.name, count: i.count })) : [],
      blockAt: (pos) => bot.blockAt(pos)
    };
  }

  // Two-stage drain: first resolve every pending plan (LLM calls, cheap and
  // fast to fail), then run every queued job's actual block work. Keeps the
  // planning stage from blocking behind a long-running execution job.
  async function startProcessing() {
    if (processing) return;
    processing = true;
    try {
      while (await planJob(jobManager, provider, worldContextFor())) {
        // keep draining the planning queue
      }

      let job = jobManager.getNextQueuedJob();
      while (job) {
        jobManager.markRunning(job.id);
        jobState.currentJobId = job.id;
        try {
          await executionEngine.runJob(job.id);
        } catch (err) {
          console.error(`[agent] job ${job.id} crashed:`, err);
          jobManager.markJobStatus(job.id, 'failed');
        }
        jobState.currentJobId = null;
        job = jobManager.getNextQueuedJob();
      }
    } finally {
      processing = false;
    }
  }

  bot.once('spawn', () => {
    console.log('[agent] spawned in world');
    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);
    bot.chat('LLM agent online.');

    const interrupted = jobManager.getInterruptedJobs();
    for (const job of interrupted) {
      console.log(`[agent] requeuing interrupted job #${job.id}`);
      jobManager.markJobStatus(job.id, 'queued');
    }

    startProcessing().catch((err) => console.error('[agent] job processing error:', err));
  });

  registerCommands(bot, { jobManager, whitelist: WHITELIST, admins: ADMINS, startProcessing, jobState });

  bot.on('kicked', (reason) => console.log('[agent] kicked:', reason));
  bot.on('error', (err) => console.log('[agent] error:', err.message));
  bot.on('end', (reason) => {
    console.log('[agent] disconnected, reason:', reason);
    executionEngine.abort();
    jobManager.close();
    console.log('[agent] reconnecting in 5s...');
    setTimeout(createBot, 5000);
  });

  return bot;
}

createBot();
