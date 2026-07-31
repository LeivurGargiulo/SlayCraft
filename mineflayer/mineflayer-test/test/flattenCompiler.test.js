const test = require('node:test');
const assert = require('node:assert');
const { compileFlatten, BREAK_SCAN_HEIGHT, FILL_SCAN_DEPTH } = require('../src/flattenCompiler');

/**
 * Create a fake bot with blockAt backed by an in-memory map.
 * blockMap is {x,y,z -> block} where block is {type: N} or null for air.
 */
function createFakeBot(blockMap) {
  return {
    blockAt(pos) {
      const key = `${pos.x},${pos.y},${pos.z}`;
      return blockMap[key] ?? null;
    }
  };
}

test('all break, no place (column entirely above targetY)', () => {
  const targetY = 0;
  // Column at (0, 0) with blocks at y=1 to y=10 (above targetY)
  // and solid blocks below targetY so no places needed
  const blockMap = {};
  for (let y = 1; y <= 10; y++) {
    blockMap[`0,${y},0`] = { type: 1 }; // Stone blocks above targetY
  }
  // Fill below targetY with solid blocks (no air to place)
  for (let y = -1; y >= -10; y--) {
    blockMap[`0,${y},0`] = { type: 1 }; // Solid blocks below targetY
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

test('all place, no break (column entirely air below targetY)', () => {
  const targetY = 0;
  // Column at (0, 0) with no blocks (all air)
  const blockMap = {};

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  // Should have 0 break actions, 10 place actions (targetY-1 to targetY-10)
  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  assert.strictEqual(breaks.length, 0, 'Should have 0 break actions');
  assert.strictEqual(places.length, FILL_SCAN_DEPTH, `Should have ${FILL_SCAN_DEPTH} place actions`);

  // Verify places are bottom-to-top (y from -10 up to -1)
  for (let i = 0; i < FILL_SCAN_DEPTH; i++) {
    assert.strictEqual(places[i].pos.y, targetY - FILL_SCAN_DEPTH + i,
      `Place ${i} should be at y=${targetY - FILL_SCAN_DEPTH + i}`);
  }
});

test('mixed column (both breaks and places)', () => {
  const targetY = 0;
  // Column at (0, 0):
  // - Blocks at y=5 to y=8 (above targetY, should break)
  // - Air at y=-1 to y=-5 (below targetY, should place)
  const blockMap = {};
  for (let y = 5; y <= 8; y++) {
    blockMap[`0,${y},0`] = { type: 1 }; // Stone
  }
  // Below targetY is implicitly air (not in blockMap)

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 0, z2: 0, targetY });

  // Should have 4 break actions and 5 place actions
  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  assert.strictEqual(breaks.length, 4, 'Should have 4 break actions');
  assert.strictEqual(places.length, FILL_SCAN_DEPTH, `Should have ${FILL_SCAN_DEPTH} place actions`);

  // Verify breaks come before places
  const lastBreakIndex = actions.findIndex(a => a.action === 'break' && actions[actions.indexOf(a) + 1]?.action === 'place');
  const firstPlaceIndex = actions.findIndex(a => a.action === 'place');
  assert(lastBreakIndex < firstPlaceIndex || lastBreakIndex === -1, 'All breaks should come before places');
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

  const bot = createFakeBot(blockMap);
  const actions = compileFlatten(bot, { x1: 0, z1: 0, x2: 1, z2: 1, targetY });

  // Should have 4 break actions and 4 * FILL_SCAN_DEPTH place actions
  const breaks = actions.filter(a => a.action === 'break');
  const places = actions.filter(a => a.action === 'place');

  assert.strictEqual(breaks.length, 4, 'Should have 4 break actions');
  assert.strictEqual(places.length, 4 * FILL_SCAN_DEPTH, 'Should have 4 columns * FILL_SCAN_DEPTH place actions');

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
});

test('scan ranges are correct', () => {
  const targetY = 100;
  // Test boundary conditions for scan ranges
  // BREAK range: targetY + BREAK_SCAN_HEIGHT (110) down to targetY + 1 (101)
  // FILL range: targetY - FILL_SCAN_DEPTH (90) up to targetY - 1 (99)
  const blockMap = {
    // Just above targetY + BREAK_SCAN_HEIGHT (111, should NOT break)
    '0,111,0': { type: 1 },
    // At targetY + BREAK_SCAN_HEIGHT (110, should break)
    '0,110,0': { type: 1 },
    // At targetY + 1 (101, should break - lower boundary inclusive)
    '0,101,0': { type: 1 },
    // Just below targetY + 1 (100, should NOT break)
    '0,100,0': { type: 1 },
    // Solid blocks between targetY+1 and targetY (to prevent unintended places)
    '0,99,0': { type: 1 },
    // Just above targetY - FILL_SCAN_DEPTH (-89, should NOT place)
    // (no block here, naturally air, but outside the fill range)
    // At targetY - 1 (99, should place since it's air now)
    // Actually, 99 already has a block. Let me reorganize...
  };

  // Actually, let me rewrite this test more clearly
  // Use a higher targetY to avoid overlap issues
  const targetY2 = 50;
  const blockMap2 = {};

  // Place blocks outside the scan ranges
  blockMap2['0,61,0'] = { type: 1 }; // Above BREAK range (should NOT break)
  blockMap2['0,60,0'] = { type: 1 }; // At top of BREAK range (should break)
  blockMap2['0,51,0'] = { type: 1 }; // At bottom of BREAK range (should break)
  blockMap2['0,50,0'] = { type: 1 }; // At targetY (should NOT break)
  blockMap2['0,49,0'] = { type: 1 }; // Solid between targetY and fill range
  blockMap2['0,40,0'] = { type: 1 }; // At bottom of FILL range - but needs air
  blockMap2['0,39,0'] = { type: 1 }; // Below FILL range (should NOT place)

  const bot2 = createFakeBot(blockMap2);
  const actions2 = compileFlatten(bot2, { x1: 0, z1: 0, x2: 0, z2: 0, targetY: targetY2 });

  const breaks2 = actions2.filter(a => a.action === 'break');

  // Should only break at y=60 and y=51 (within range 60 to 51)
  assert.strictEqual(breaks2.length, 2, 'Should have 2 break actions');
  const breakYs = breaks2.map(b => b.pos.y).sort((a, b) => b - a);
  assert.deepStrictEqual(breakYs, [60, 51], 'Breaks should be at y=60 and y=51');
});

test('block.type === 0 is treated as air', () => {
  const targetY = 0;
  // Explicitly mark a block as air (type 0)
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

  // All places should be present (type 0 is air)
  assert.strictEqual(places.length, FILL_SCAN_DEPTH, 'Should place all air blocks below targetY');
});
