const test = require('node:test');
const assert = require('node:assert');
const { registerCommands } = require('../src/commands');

function fakeBot() {
  const chatLog = [];
  const handlers = {};
  return {
    username: 'AgentBot',
    chat: (msg) => chatLog.push(msg),
    chatLog,
    on: (event, handler) => { handlers[event] = handler; },
    emitChat: (username, message) => handlers.chat(username, message)
  };
}

function fakeJobManager() {
  const jobs = new Map();
  let nextId = 1;
  return {
    jobs,
    insertPlanningJob: (taskText, requestedBy) => {
      const id = nextId++;
      jobs.set(id, { id, task_text: taskText, requested_by: requestedBy, status: 'planning', completed_actions: 0, total_actions: null });
      return id;
    },
    getQueue: () => Array.from(jobs.values()),
    getStatus: (id) => jobs.get(id),
    cancel: (id, requestedBy, isAdmin) => {
      const job = jobs.get(id);
      if (!job) throw new Error(`Job ${id} not found`);
      if (job.requested_by !== requestedBy && !isAdmin) throw new Error('Permission denied: only job owner or admin can cancel');
      job.status = 'cancelled';
    },
    markJobStatus: (id, status) => { jobs.get(id).status = status; }
  };
}

test('rejects commands from non-whitelisted users', () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  registerCommands(bot, { jobManager, whitelist: new Set(['alice']), admins: new Set(), startProcessing: async () => {}, jobState: { currentJobId: null } });

  bot.emitChat('mallory', '!agent build a wall');
  assert.strictEqual(jobManager.jobs.size, 0);
  assert.match(bot.chatLog[0], /not whitelisted/);
});

test('!agent <text> creates a planning job and kicks startProcessing', async () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  let started = false;
  registerCommands(bot, { jobManager, whitelist: new Set(['alice']), admins: new Set(), startProcessing: async () => { started = true; }, jobState: { currentJobId: null } });

  bot.emitChat('alice', '!agent build a stone wall 10 long');
  assert.strictEqual(jobManager.jobs.size, 1);
  const job = jobManager.jobs.get(1);
  assert.strictEqual(job.task_text, 'build a stone wall 10 long');
  assert.strictEqual(job.requested_by, 'alice');
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(started, true);
});

test('!agent status <id> reports job status', () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  registerCommands(bot, { jobManager, whitelist: new Set(['alice']), admins: new Set(), startProcessing: async () => {}, jobState: { currentJobId: null } });

  bot.emitChat('alice', '!agent build a wall');
  bot.emitChat('alice', '!agent status 1');
  assert.match(bot.chatLog[bot.chatLog.length - 1], /#1/);
});

test('!agent cancel <id> enforces owner-or-admin via jobManager.cancel', () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  registerCommands(bot, { jobManager, whitelist: new Set(['alice', 'mallory']), admins: new Set(), startProcessing: async () => {}, jobState: { currentJobId: null } });

  bot.emitChat('alice', '!agent build a wall');
  bot.emitChat('mallory', '!agent cancel 1');
  assert.match(bot.chatLog[bot.chatLog.length - 1], /Cannot cancel/);
  assert.strictEqual(jobManager.jobs.get(1).status, 'planning');
});

test('!agent stop requires admin', () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  const jobState = { currentJobId: 1 };
  registerCommands(bot, { jobManager, whitelist: new Set(['alice']), admins: new Set(), startProcessing: async () => {}, jobState });

  bot.emitChat('alice', '!agent stop');
  assert.match(bot.chatLog[bot.chatLog.length - 1], /only admins/);
});
