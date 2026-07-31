const test = require('node:test');
const assert = require('node:assert');
const JobManager = require('../src/db.js');
const ExecutionEngine = require('../src/executionEngine.js');

function createTestDb() {
  return new JobManager(':memory:');
}

/**
 * Fake bot: blockAt is backed by an in-memory map keyed by "x,y,z".
 * dig removes the block from the map. placeBlock adds a block at
 * referenceBlock.position + faceVector. equip/pathfinder.goto are no-ops.
 */
function createFakeBot(blockMap) {
  const key = (pos) => `${pos.x},${pos.y},${pos.z}`;
  const equipCalls = [];

  const bot = {
    equipCalls,
    blockAt(pos) {
      return blockMap[key(pos)] ?? null;
    },
    async dig(block) {
      if (!block || block.type === 0) {
        throw new Error('cannot dig air');
      }
      delete blockMap[key(block.position)];
    },
    async equip(itemName, destination) {
      equipCalls.push({ itemName, destination });
    },
    async placeBlock(referenceBlock, faceVector) {
      const pos = {
        x: referenceBlock.position.x + faceVector.x,
        y: referenceBlock.position.y + faceVector.y,
        z: referenceBlock.position.z + faceVector.z,
      };
      blockMap[key(pos)] = { type: 1, name: 'placed', position: pos };
    },
    pathfinder: {
      async goto() {},
    },
    chat() {},
  };
  return bot;
}

// Helper: wrap a plain {type, name} into a block with .position, matching what
// bot.blockAt would normally return.
function setBlock(blockMap, pos, type, name) {
  blockMap[`${pos.x},${pos.y},${pos.z}`] = { type, name, position: pos };
}

test('full run: even break/place balance completes the job', async () => {
  const db = createTestDb();
  const blockMap = {};
  // Two dirt blocks to break above targetY
  setBlock(blockMap, { x: 0, y: 65, z: 0 }, 1, 'dirt');
  setBlock(blockMap, { x: 1, y: 65, z: 0 }, 1, 'dirt');
  // Solid floor at y=63 so places at y=64 have something to place against
  setBlock(blockMap, { x: 0, y: 63, z: 0 }, 1, 'stone');
  setBlock(blockMap, { x: 1, y: 63, z: 0 }, 1, 'stone');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'break', x: 1, y: 65, z: 0 },
    { action: 'place', x: 0, y: 64, z: 0 },
    { action: 'place', x: 1, y: 64, z: 0 },
  ]);

  const bot = createFakeBot(blockMap);
  const engine = new ExecutionEngine(bot, db);
  await engine.runJob(jobId);

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'completed', 'job should be completed');
  assert.strictEqual(status.completed_actions, 4, 'all 4 actions should be done');
  assert.strictEqual(db.getPendingActions(jobId).length, 0, 'no pending actions left');

  // Both breaks and both places actually happened in the fake world.
  assert.strictEqual(blockMap['0,65,0'], undefined, 'block at 0,65,0 should be broken');
  assert.strictEqual(blockMap['1,65,0'], undefined, 'block at 1,65,0 should be broken');
  assert.ok(blockMap['0,64,0'], 'block should be placed at 0,64,0');
  assert.ok(blockMap['1,64,0'], 'block should be placed at 1,64,0');

  db.close();
});

test('resume after crash: stock rebuild is correct and no double-execution', async () => {
  const db = createTestDb();
  const blockMap = {};
  setBlock(blockMap, { x: 0, y: 65, z: 0 }, 1, 'dirt');
  setBlock(blockMap, { x: 1, y: 65, z: 0 }, 1, 'dirt');
  setBlock(blockMap, { x: 0, y: 63, z: 0 }, 1, 'stone');
  setBlock(blockMap, { x: 1, y: 63, z: 0 }, 1, 'stone');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'break', x: 1, y: 65, z: 0 },
    // Explicit block_type here forces the engine to draw on the *live*-dug
    // "dirt" stock rather than the null-keyed rebuilt pool, so we can assert
    // equip() sees a real block name.
    { action: 'place', x: 0, y: 64, z: 0, block_type: 'dirt' },
    { action: 'place', x: 1, y: 64, z: 0 },
  ]);

  // Simulate a crash: seq 0 (break) already done before the crash. Note the
  // job_actions.block_type column for this row is whatever was set at
  // enqueue time (null for break actions from flattenCompiler) - this is the
  // real persisted shape, so the rebuild must tolerate a null-keyed stock.
  db.markActionDone(jobId, 0);
  // Manually remove the corresponding block from the fake world, mimicking
  // that the first break already physically happened pre-crash.
  delete blockMap['0,65,0'];

  const bot = createFakeBot(blockMap);
  const engine = new ExecutionEngine(bot, db);

  let digCount = 0;
  const originalDig = bot.dig.bind(bot);
  bot.dig = async (block) => {
    digCount += 1;
    return originalDig(block);
  };

  await engine.runJob(jobId);

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'completed', 'job should be completed after resume');
  assert.strictEqual(status.completed_actions, 4, 'all 4 actions done (1 pre-crash + 3 resumed)');
  assert.strictEqual(digCount, 1, 'only the still-pending break should be dug (no double-execution)');

  const doneActions = db.getDoneActions(jobId);
  assert.strictEqual(doneActions.length, 4, 'all 4 actions marked done');
  assert.ok(blockMap['0,64,0'], 'place at 0,64,0 should have happened using rebuilt stock');
  assert.ok(blockMap['1,64,0'], 'place at 1,64,0 should have happened using rebuilt stock');

  // Regression check: stock must be keyed by a real Map (not a plain object),
  // so a `null` block_type is never coerced into the string "null" and handed
  // to bot.equip - that string is not a real item name and would fail equip
  // for real in mineflayer.
  assert.strictEqual(bot.equipCalls.length, 2, 'both place actions should have equipped an item');
  assert.ok(
    bot.equipCalls.some((c) => c.itemName === 'dirt'),
    'the place action requesting "dirt" should equip the real block name'
  );
  assert.ok(
    bot.equipCalls.every((c) => c.itemName !== 'null'),
    'equip should never be called with the coerced string "null"'
  );

  db.close();
});

test('stock exhaustion: place with no matching stock fails with exact error, engine continues', async () => {
  const db = createTestDb();
  const blockMap = {};
  // No break actions at all - stock starts empty. Solid floor so a
  // placement failure is due to stock, not a missing reference block.
  setBlock(blockMap, { x: 0, y: 63, z: 0 }, 1, 'stone');
  setBlock(blockMap, { x: 1, y: 63, z: 0 }, 1, 'stone');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'place', x: 0, y: 64, z: 0 },
    { action: 'place', x: 1, y: 64, z: 0 },
  ]);

  const bot = createFakeBot(blockMap);
  const engine = new ExecutionEngine(bot, db);
  await engine.runJob(jobId);

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'failed', 'job should be marked failed when an action failed');

  const pending = db.getPendingActions(jobId);
  assert.strictEqual(pending.length, 0, 'both actions should be resolved (failed), none left pending');

  // Fetch raw rows to check the exact error string on both failed actions.
  const rows = db.db.prepare('SELECT * FROM job_actions WHERE job_id = ? ORDER BY seq').all(jobId);
  assert.strictEqual(rows.length, 2);
  for (const row of rows) {
    assert.strictEqual(row.status, 'failed', `seq ${row.seq} should be failed`);
    assert.strictEqual(
      row.error,
      'no fill block available (inventory exhausted)',
      `seq ${row.seq} should have the exact stock-exhaustion error`
    );
  }

  // Engine kept going past the first failure instead of aborting the job.
  assert.strictEqual(blockMap['0,64,0'], undefined, 'no block should have been placed at 0,64,0');
  assert.strictEqual(blockMap['1,64,0'], undefined, 'no block should have been placed at 1,64,0');

  db.close();
});
