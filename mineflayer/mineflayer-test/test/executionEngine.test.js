const test = require('node:test');
const assert = require('node:assert');
const { Vec3 } = require('vec3');
const JobManager = require('../src/db.js');
const ExecutionEngine = require('../src/executionEngine.js');

function createTestDb() {
  return new JobManager(':memory:');
}

/**
 * Fake bot: blockAt is backed by an in-memory map keyed by "x,y,z".
 * dig removes the block from the map and adds the drop to the fake inventory.
 * placeBlock adds a block at referenceBlock.position + faceVector and consumes
 * one of the currently-equipped item. pathfinder.goto is a no-op.
 *
 * Both blockAt and equip assert on the shape of what the engine hands them,
 * because the real mineflayer APIs are strict about it: blockAt needs a Vec3
 * (a plain {x,y,z} throws), and equip needs an Item object or numeric id
 * (a name string throws).
 *
 * @param {Object} blockMap
 * @param {Object} initialInventory - {itemName: count} the bot starts holding
 */
function createFakeBot(blockMap, initialInventory = {}) {
  const key = (pos) => `${pos.x},${pos.y},${pos.z}`;
  const equipCalls = [];
  const gotoCalls = [];
  const counts = new Map(Object.entries(initialInventory));
  let equipped = null;

  const bot = {
    equipCalls,
    gotoCalls,
    world: {
      getBlock(pos) {
        return blockMap[key(pos)] ?? null;
      },
    },
    inventory: {
      items() {
        return [...counts]
          .filter(([, count]) => count > 0)
          .map(([name, count]) => ({ name, count, type: 1, slot: 36 }));
      },
    },
    blockAt(pos) {
      assert.ok(pos instanceof Vec3, 'blockAt must be called with a Vec3, not a plain object');
      return blockMap[key(pos)] ?? null;
    },
    async dig(block) {
      if (!block || block.type === 0) {
        throw new Error('cannot dig air');
      }
      delete blockMap[key(block.position)];
      counts.set(block.name, (counts.get(block.name) ?? 0) + 1);
    },
    async equip(item, destination) {
      assert.ok(
        item && typeof item === 'object',
        'equip must be called with an inventory Item object, not a name string'
      );
      equipCalls.push({ item, destination });
      equipped = item;
    },
    async placeBlock(referenceBlock, faceVector) {
      if (!equipped) throw new Error('nothing equipped');
      const pos = {
        x: referenceBlock.position.x + faceVector.x,
        y: referenceBlock.position.y + faceVector.y,
        z: referenceBlock.position.z + faceVector.z,
      };
      blockMap[key(pos)] = { type: 1, name: equipped.name, position: pos, shapes: [[0, 0, 0, 1, 1, 1]] };
      counts.set(equipped.name, counts.get(equipped.name) - 1);
    },
    pathfinder: {
      async goto(goal) {
        gotoCalls.push(goal);
      },
    },
    chat() {},
    // Minimal stand-in for prismarine-registry's blocksByName: only names
    // that are actually placeable blocks in these tests. 'iron_shovel' is
    // deliberately absent - it's a tool, not a block.
    registry: {
      blocksByName: { dirt: {}, stone: {} },
    },
  };
  return bot;
}

// Helper: wrap a plain {type, name} into a block with .position, matching what
// bot.blockAt would normally return.
function setBlock(blockMap, pos, type, name) {
  // shapes: a full-cube AABB, matching prismarine-block's shape for a solid
  // block - GoalPlaceBlock's constructor (goals.js) needs this to compute
  // which faces are placeable against.
  blockMap[`${pos.x},${pos.y},${pos.z}`] = { type, name, position: pos, shapes: [[0, 0, 0, 1, 1, 1]] };
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

  // The bot is still physically holding the block it dug before the crash,
  // so the fake inventory is seeded to match the rebuilt stock.
  const bot = createFakeBot(blockMap, { dirt: 1 });
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

  // Regression checks on what reaches bot.equip:
  // - a real inventory Item object (asserted inside the fake equip), never a
  //   name string, which real mineflayer rejects;
  // - stock keyed by a real Map (not a plain object), so a `null` block_type is
  //   never coerced into the string "null" and looked up as an item name. The
  //   null-keyed place falls back to whatever is actually in inventory.
  assert.strictEqual(bot.equipCalls.length, 2, 'both place actions should have equipped an item');
  assert.ok(
    bot.equipCalls.every((c) => typeof c.item === 'object' && c.item !== null),
    'equip must always receive an Item object'
  );
  assert.ok(
    bot.equipCalls.some((c) => c.item.name === 'dirt'),
    'the place action requesting "dirt" should equip the real dirt item'
  );
  assert.ok(
    bot.equipCalls.every((c) => c.item.name !== 'null'),
    'equip should never be handed an item named by the coerced string "null"'
  );

  db.close();
});

test('place-only job succeeds when the bot already carries stock from a prior job', async () => {
  const db = createTestDb();
  const blockMap = {};
  // Solid floor so the place has somewhere to attach to; no breakable blocks
  // at all - this job (unlike earlier jobs on the same region) has nothing
  // left to dig, only fill.
  setBlock(blockMap, { x: 0, y: 63, z: 0 }, 1, 'stone');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'place', x: 0, y: 64, z: 0 },
  ]);

  // The bot is already holding dirt from an earlier job's digging, not from
  // anything done in this job.
  const bot = createFakeBot(blockMap, { dirt: 3 });
  const engine = new ExecutionEngine(bot, db);
  await engine.runJob(jobId);

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'completed', 'a place-only job must succeed using real carried-over inventory, not a per-job stock counter');
  assert.ok(blockMap['0,64,0'], 'the block should actually have been placed');

  db.close();
});

test('place skips a non-block tool in inventory and equips the actual block instead', async () => {
  const db = createTestDb();
  const blockMap = {};
  setBlock(blockMap, { x: 0, y: 63, z: 0 }, 1, 'stone');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'place', x: 0, y: 64, z: 0 },
  ]);

  // Shovel sorts before dirt in inventory.items() - a naive "first slot"
  // fallback would equip the tool and try to place air with it forever.
  const bot = createFakeBot(blockMap, { iron_shovel: 1, dirt: 3 });
  const engine = new ExecutionEngine(bot, db);
  await engine.runJob(jobId);

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'completed', 'the place must succeed by skipping the tool and using the real block');
  assert.strictEqual(bot.equipCalls.length, 1);
  assert.strictEqual(bot.equipCalls[0].item.name, 'dirt', 'must equip dirt, never the shovel');

  db.close();
});

test('place walks to a GoalPlaceBlock, never a bare GoalNear that lets the bot stand in the target cell', async () => {
  const { goals } = require('mineflayer-pathfinder');
  const db = createTestDb();
  const blockMap = {};
  setBlock(blockMap, { x: 0, y: 63, z: 0 }, 1, 'stone');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'place', x: 0, y: 64, z: 0 },
  ]);

  const bot = createFakeBot(blockMap, { dirt: 1 });
  const engine = new ExecutionEngine(bot, db);
  await engine.runJob(jobId);

  assert.strictEqual(bot.gotoCalls.length, 1);
  assert.ok(
    bot.gotoCalls[0] instanceof goals.GoalPlaceBlock,
    'a place action must walk to a GoalPlaceBlock, which refuses to end inside the target cell - a bare GoalNear(pos, 1) is satisfied by standing directly on the block being placed, which the server silently rejects'
  );

  db.close();
});

test('stop requested mid-job: runJob exits early and marks the job cancelled', async () => {
  const db = createTestDb();
  const blockMap = {};
  setBlock(blockMap, { x: 0, y: 65, z: 0 }, 1, 'dirt');
  setBlock(blockMap, { x: 1, y: 65, z: 0 }, 1, 'dirt');
  setBlock(blockMap, { x: 2, y: 65, z: 0 }, 1, 'dirt');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'break', x: 1, y: 65, z: 0 },
    { action: 'break', x: 2, y: 65, z: 0 },
  ]);

  const bot = createFakeBot(blockMap);

  // Wrap dig so that after the first action completes, a "stop" request
  // arrives (mimicking commands.js's stop handler calling markJobStatus
  // between actions) - the loop must not start the 2nd/3rd action.
  const originalDig = bot.dig.bind(bot);
  let digCount = 0;
  bot.dig = async (block) => {
    digCount += 1;
    const result = await originalDig(block);
    if (digCount === 1) {
      db.markJobStatus(jobId, 'stopping');
    }
    return result;
  };

  const engine = new ExecutionEngine(bot, db);
  await engine.runJob(jobId);

  assert.strictEqual(digCount, 1, 'only the first action should have run before the stop was seen');

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'cancelled', 'job should end cancelled, not completed/failed');
  assert.strictEqual(status.completed_actions, 1, 'only the one completed action should be counted');

  const pending = db.getPendingActions(jobId);
  assert.strictEqual(pending.length, 2, 'the remaining 2 actions should still be pending, untouched');

  db.close();
});

test('cancel mid-job: runJob exits early and leaves the job cancelled (not overwritten)', async () => {
  const db = createTestDb();
  const blockMap = {};
  setBlock(blockMap, { x: 0, y: 65, z: 0 }, 1, 'dirt');
  setBlock(blockMap, { x: 1, y: 65, z: 0 }, 1, 'dirt');
  setBlock(blockMap, { x: 2, y: 65, z: 0 }, 1, 'dirt');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'break', x: 1, y: 65, z: 0 },
    { action: 'break', x: 2, y: 65, z: 0 },
  ]);

  const bot = createFakeBot(blockMap);

  // The owner cancels their own currently-running job after the first action.
  const originalDig = bot.dig.bind(bot);
  let digCount = 0;
  bot.dig = async (block) => {
    digCount += 1;
    const result = await originalDig(block);
    if (digCount === 1) {
      db.cancel(jobId, 'player1', false);
    }
    return result;
  };

  const engine = new ExecutionEngine(bot, db);
  await engine.runJob(jobId);

  assert.strictEqual(digCount, 1, 'only the first action should have run before the cancel was seen');

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'cancelled', 'cancelled must NOT be overwritten with completed/failed');
  assert.strictEqual(db.getPendingActions(jobId).length, 2, 'remaining actions stay pending, untouched');

  db.close();
});

test('abort (disconnect): runJob exits without further db writes and leaves the job running', async () => {
  const db = createTestDb();
  const blockMap = {};
  setBlock(blockMap, { x: 0, y: 65, z: 0 }, 1, 'dirt');
  setBlock(blockMap, { x: 1, y: 65, z: 0 }, 1, 'dirt');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'break', x: 1, y: 65, z: 0 },
  ]);
  db.markRunning(jobId);

  const bot = createFakeBot(blockMap);
  const engine = new ExecutionEngine(bot, db);

  const originalDig = bot.dig.bind(bot);
  let digCount = 0;
  bot.dig = async (block) => {
    digCount += 1;
    const result = await originalDig(block);
    engine.abort(); // mimics index.js's 'end' handler on disconnect
    return result;
  };

  await engine.runJob(jobId);

  assert.strictEqual(digCount, 1, 'the loop must stop as soon as it is aborted');

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'running',
    'abort must not set a terminal status - getInterruptedJobs() requeues it on reconnect');
  assert.ok(
    db.getInterruptedJobs().some((j) => j.id === jobId),
    'the aborted job must be picked up by the crash-resume requeue'
  );

  db.close();
});

test('stuck pathfinding: a goto() that never resolves times out and fails the action instead of hanging the job', async () => {
  const db = createTestDb();
  const blockMap = {};
  setBlock(blockMap, { x: 0, y: 65, z: 0 }, 1, 'dirt');

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
  ]);

  const bot = createFakeBot(blockMap);
  let stopCalled = false;
  bot.pathfinder.goto = () => new Promise(() => {}); // never resolves/rejects
  bot.pathfinder.stop = () => { stopCalled = true; };

  const engine = new ExecutionEngine(bot, db, { pathfindTimeoutMs: 20 });
  await engine.runJob(jobId);

  assert.ok(stopCalled, 'a stuck goto() must be force-stopped via bot.pathfinder.stop()');

  const status = db.getStatus(jobId);
  assert.strictEqual(status.status, 'failed', 'the job must resolve as failed, not hang forever');

  const rows = db.db.prepare('SELECT * FROM job_actions WHERE job_id = ?').all(jobId);
  assert.strictEqual(rows[0].status, 'failed');
  assert.match(rows[0].error, /timed out/i);

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
