const test = require('node:test');
const assert = require('node:assert');
const { Vec3 } = require('vec3');
const { compileFlatten, BREAK_SCAN_HEIGHT, FILL_SCAN_DEPTH } = require('../src/flattenCompiler');

/**
 * Create a fake bot with blockAt backed by an in-memory map.
 * blockMap is {"x,y,z" -> block} where block is {type: N}; an absent entry is
 * null, i.e. "chunk not loaded / unknown" (NOT air - air is an explicit
 * {type: 0}).
 *
 * blockAt asserts it received a real Vec3: mineflayer's blockAt calls methods
 * on the position, so passing a plain {x,y,z} throws against a real server.
 * Asserting here catches that regression at unit-test time.
 */
function createFakeBot(blockMap) {
  return {
    blockAt(pos) {
      assert.ok(pos instanceof Vec3, 'blockAt must be called with a Vec3, not a plain object');
      const key = `${pos.x},${pos.y},${pos.z}`;
      return blockMap[key] ?? null;
    }
  };
}

// Marks a column's fill range [targetY - FILL_SCAN_DEPTH + 1, targetY] as
// explicit air, which is what a loaded-but-empty column really looks like.
function fillWithAir(blockMap, x, z, fromY, toY) {
  for (let y = fromY; y <= toY; y++) {
    blockMap[`${x},${y},${z}`] = { type: 0 };
  }
}

test('all break, no place (column entirely above targetY)', () => {
  const targetY = 0;
  // Column at (0, 0) with blocks at y=1 to y=10 (above targetY)
  // and solid blocks below targetY so no places needed
  const blockMap = {};
  for (let y = 1; y <= 10; y++) {
    blockMap[`0,${y},0`] = { type: 1 }; // Stone blocks above targetY
  }
  // Fill targetY and below with solid blocks (no air to place)
  for (let y = 0; y >= -10; y--) {
    blockMap[`0,${y},0`] = { type: 1 };
  }

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  // Should have 10 break actions (from above), 0 place actions (no air below)
  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  assert.strictEqual(breaks.length, 10, 'Should have 10 break actions');
  assert.strictEqual(places.length, 0, 'Should have 0 place actions');

  // Verify breaks are top-down (y from 10 down to 1)
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(breaks[i].pos.y, 10 - i, `Break ${i} should be at y=${10 - i}`);
  }
});

test('all place, no break (column is confirmed air through the fill range)', () => {
  const targetY = 0;
  const blockMap = {};
  // Explicit air across the whole fill range: targetY-9 .. targetY
  fillWithAir(blockMap, 0, 0, targetY - FILL_SCAN_DEPTH + 1, targetY);

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  assert.strictEqual(breaks.length, 0, 'Should have 0 break actions');
  assert.strictEqual(places.length, FILL_SCAN_DEPTH, `Should have ${FILL_SCAN_DEPTH} place actions`);

  // Verify places are bottom-to-top, ending at targetY itself
  for (let i = 0; i < FILL_SCAN_DEPTH; i++) {
    assert.strictEqual(places[i].pos.y, targetY - FILL_SCAN_DEPTH + 1 + i,
      `Place ${i} should be at y=${targetY - FILL_SCAN_DEPTH + 1 + i}`);
  }
});

test('unloaded column (blockAt returns null everywhere) produces zero actions', () => {
  const targetY = 0;
  // Empty blockMap => blockAt always null => nothing is known, so nothing to
  // break AND nothing confirmed air to fill.
  const bot = createFakeBot({});
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  assert.strictEqual(actions.length, 0, 'An unloaded/unknown column must produce no actions at all');
});

test('air exactly at targetY is filled', () => {
  const targetY = 64;
  const blockMap = {};
  blockMap[`0,${targetY},0`] = { type: 0 };      // air at the target surface
  blockMap[`0,${targetY - 1},0`] = { type: 1 };  // solid immediately below

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  const places = actions.filter(a => a.action === 'place');
  assert.strictEqual(places.length, 1, 'exactly one place action');
  assert.strictEqual(places[0].pos.y, targetY, 'the place must be at targetY itself, not below it');
});

test('reversed coordinates are normalized (x1 > x2, z1 > z2)', () => {
  const targetY = 0;
  const blockMap = {
    '0,1,0': { type: 1 },
    '1,1,1': { type: 1 }
  };

  const normal = compileFlatten(createFakeBot(blockMap), { x1: 0, z1: 0, x2: 1, z2: 1, targetY });
  const reversed = compileFlatten(createFakeBot(blockMap), { x1: 1, z1: 1, x2: 0, z2: 0, targetY });

  assert.ok(normal.length > 0, 'sanity: the normalized call produces actions');
  assert.deepStrictEqual(reversed, normal, 'reversed corners must produce the same actions');
});

test('mixed column (both breaks and places)', () => {
  const targetY = 0;
  // Column at (0, 0):
  // - Blocks at y=5 to y=8 (above targetY, should break)
  // - Explicit air at y=-5 to y=-1 (below targetY, should place)
  const blockMap = {};
  for (let y = 5; y <= 8; y++) {
    blockMap[`0,${y},0`] = { type: 1 }; // Stone
  }
  fillWithAir(blockMap, 0, 0, -5, -1);

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  assert.strictEqual(breaks.length, 4, 'Should have 4 break actions');
  assert.strictEqual(places.length, 5, 'Should have 5 place actions (only the confirmed-air cells)');

  // Verify all breaks come before all places in the array
  const lastBreakIndex = actions.findLastIndex(a => a.action === 'break');
  const firstPlaceIndex = actions.findIndex(a => a.action === 'place');
  assert(lastBreakIndex < firstPlaceIndex, 'All breaks should come before all places in the action array');
});

test('multi-column ordering (deterministic x then z iteration)', () => {
  const targetY = 0;
  // Create 2x2 grid of columns with blocks at different heights
  const blockMap = {
    // (0, 0): block at y=1
    '0,1,0': { type: 1 },
    // (0, 1): block at y=2
    '0,2,1': { type: 1 },
    // (1, 0): block at y=3
    '1,3,0': { type: 1 },
    // (1, 1): block at y=4
    '1,4,1': { type: 1 }
  };
  // One confirmed-air cell (at targetY) per column, so each column contributes
  // exactly one place and column ordering is observable in the place list too.
  for (const [x, z] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    blockMap[`${x},${targetY},${z}`] = { type: 0 };
  }

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 1, z2: 1, targetY });

  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  assert.strictEqual(breaks.length, 4, 'Should have 4 break actions');
  assert.strictEqual(places.length, 4, 'Should have one place per column');

  // Verify iteration order: columns should be (0,0), (0,1), (1,0), (1,1)
  // Each column has 1 break action
  assert.strictEqual(breaks[0].pos.x, 0, 'First break should be at x=0');
  assert.strictEqual(breaks[0].pos.z, 0, 'First break should be at z=0');
  assert.strictEqual(breaks[0].pos.y, 1, 'First break should be at y=1');

  assert.strictEqual(breaks[1].pos.x, 0, 'Second break should be at x=0');
  assert.strictEqual(breaks[1].pos.z, 1, 'Second break should be at z=1');
  assert.strictEqual(breaks[1].pos.y, 2, 'Second break should be at y=2');

  assert.strictEqual(breaks[2].pos.x, 1, 'Third break should be at x=1');
  assert.strictEqual(breaks[2].pos.z, 0, 'Third break should be at z=0');
  assert.strictEqual(breaks[2].pos.y, 3, 'Third break should be at y=3');

  assert.strictEqual(breaks[3].pos.x, 1, 'Fourth break should be at x=1');
  assert.strictEqual(breaks[3].pos.z, 1, 'Fourth break should be at z=1');
  assert.strictEqual(breaks[3].pos.y, 4, 'Fourth break should be at y=4');

  assert.deepStrictEqual(
    places.map((p) => [p.pos.x, p.pos.z]),
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    'places follow the same x-then-z column order'
  );

  // Verify all breaks come before all places in the full array
  const lastBreakIdx = actions.findLastIndex(a => a.action === 'break');
  const firstPlaceIdx = actions.findIndex(a => a.action === 'place');
  assert(lastBreakIdx < firstPlaceIdx, 'All breaks should globally precede all places');
});

test('scan ranges are correct', () => {
  const targetY = 50;
  const blockMap = {};

  // Place blocks to test boundary conditions
  blockMap['0,61,0'] = { type: 1 }; // Above BREAK range (should NOT break)
  blockMap['0,60,0'] = { type: 1 }; // At top of BREAK range (should break)
  blockMap['0,51,0'] = { type: 1 }; // At bottom of BREAK range (should break)
  blockMap['0,50,0'] = { type: 1 }; // At targetY (should NOT break)

  // Fill-range boundaries: air at the top (targetY) and bottom
  // (targetY - FILL_SCAN_DEPTH + 1) of the range should place; one below
  // should not.
  blockMap['0,41,0'] = { type: 0 }; // bottom of FILL range (should place)
  blockMap['0,40,0'] = { type: 0 }; // below FILL range (should NOT place)

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  // Should only break at y=60 and y=51 (within range 60 to 51)
  assert.strictEqual(breaks.length, 2, 'Should have 2 break actions');
  const breakYs = breaks.map(b => b.pos.y).sort((a, b) => b - a);
  assert.deepStrictEqual(breakYs, [60, 51], 'Breaks should be at y=60 and y=51');

  assert.deepStrictEqual(places.map(p => p.pos.y), [41],
    'Only the in-range air cell should be filled (y=40 is below the fill range)');
});

test('block.type === 0 is treated as air', () => {
  const targetY = 0;
  // Explicitly mark blocks as air (type 0)
  const blockMap = {
    '0,-1,0': { type: 0 }, // Explicitly air
    '0,-2,0': { type: 0 }, // Explicitly air
    '0,1,0': { type: 0 }   // Explicitly air above targetY
  };

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  // No breaks since all blocks above are type 0 (air)
  assert.strictEqual(breaks.length, 0, 'Should have 0 break actions');

  // Only the two explicit-air cells place; the rest of the column is unknown.
  assert.deepStrictEqual(places.map(p => p.pos.y), [-2, -1],
    'Should place at the two explicitly-air cells only');
});
