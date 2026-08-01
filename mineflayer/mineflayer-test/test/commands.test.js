const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { registerCommands, MAX_REGION_COLUMNS } = require('../src/commands.js');

// Minimal harness: a chat-emitting fake bot plus a fake JobManager that only
// records enqueue calls. Enough to exercise !bot flatten's input validation,
// which is the trust boundary we care about here.
function createHarness() {
  const bot = new EventEmitter();
  bot.username = 'bot';
  bot.chats = [];
  bot.chat = (msg) => bot.chats.push(msg);
  bot.blockAt = () => null; // unloaded world: compileFlatten emits no actions

  const enqueued = [];
  const jobManager = {
    enqueue(...args) {
      enqueued.push(args);
      return enqueued.length;
    },
  };

  registerCommands(bot, {
    jobManager,
    whitelist: new Set(['player1']),
    admins: new Set(),
    startProcessing: async () => {},
    jobState: { currentJobId: null },
  });

  return { bot, enqueued };
}

test('flatten rejects a region larger than MAX_REGION_COLUMNS without compiling it', () => {
  const { bot, enqueued } = createHarness();

  // 1000 x 1000 = 1e6 columns, well over the cap.
  bot.emit('chat', 'player1', '!bot flatten 0 0 999 999 64');

  assert.strictEqual(enqueued.length, 0, 'oversized region must not be enqueued');
  assert.ok(
    bot.chats.some((m) => m.includes('Region too large')),
    `expected a "Region too large" reply, got: ${JSON.stringify(bot.chats)}`
  );
});

test('flatten accepts a region at the cap', () => {
  const { bot, enqueued } = createHarness();

  // 100 x 100 = 10000 columns = exactly MAX_REGION_COLUMNS.
  const side = Math.sqrt(MAX_REGION_COLUMNS) - 1;
  bot.emit('chat', 'player1', `!bot flatten 0 0 ${side} ${side} 64`);

  assert.strictEqual(enqueued.length, 1, 'a region exactly at the cap must be accepted');
  assert.ok(
    bot.chats.some((m) => m.includes('queued')),
    `expected a queued confirmation, got: ${JSON.stringify(bot.chats)}`
  );
});
