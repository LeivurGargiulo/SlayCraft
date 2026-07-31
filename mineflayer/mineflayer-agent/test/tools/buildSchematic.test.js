const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');
const mcData = require('minecraft-data')('1.21.4');
require('../../src/tools/buildSchematic');
const { getTool, validateArgs } = require('../../src/tools/index');

// palette maps index -> block state id; blocks maps cell index -> palette index,
// matching Schematic's internal (y*size.z + z)*size.x + x ordering (see Task 5).
function writeTinySchem(filePath) {
  const size = new Vec3(2, 1, 1);
  const offset = new Vec3(0, 0, 0);
  const palette = [mcData.blocksByName.stone.defaultState, mcData.blocksByName.dirt.defaultState];
  const paletteIndices = [0, 1];
  const schematic = new Schematic('1.21.4', size, offset, palette, paletteIndices);
  return schematic.write().then((buf) => fs.writeFileSync(filePath, buf));
}

test('build_schematic tool registered, requires source path and origin', () => {
  assert.strictEqual(validateArgs('build_schematic', { sourcePath: 'x.schem', originX: 0, originY: 64, originZ: 0, rotation: 0 }).valid, true);
  assert.strictEqual(validateArgs('build_schematic', { sourcePath: 'x.schem', originX: 0, originY: 64, originZ: 0, rotation: 45 }).valid, false);
});

test('build_schematic compile translates a loaded schematic to the placement origin, rotation 0', async () => {
  const tool = getTool('build_schematic');
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'tiny.schem');
  await writeTinySchem(fixturePath);

  try {
    const actions = await tool.compile({ sourcePath: fixturePath, originX: 100, originY: 64, originZ: 200, rotation: 0 });
    assert.strictEqual(actions.length, 2);
    const byPos = Object.fromEntries(actions.map((a) => [`${a.x},${a.y},${a.z}`, a.block_type]));
    assert.strictEqual(byPos['100,64,200'], 'stone');
    assert.strictEqual(byPos['101,64,200'], 'dirt');
  } finally {
    fs.unlinkSync(fixturePath);
  }
});

test('build_schematic compile rotation 90 rotates blocks around the origin (x,z) -> (-z,x)', async () => {
  const tool = getTool('build_schematic');
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'tiny-rot.schem');
  await writeTinySchem(fixturePath);

  try {
    const actions = await tool.compile({ sourcePath: fixturePath, originX: 0, originY: 0, originZ: 0, rotation: 90 });
    const byPos = Object.fromEntries(actions.map((a) => [`${a.x},${a.y},${a.z}`, a.block_type]));
    // (1,0,0) relative -> 90deg y-rotation (x,z)->(-z,x) -> (0,0,1)
    assert.strictEqual(byPos['0,0,0'], 'stone');
    assert.strictEqual(byPos['0,0,1'], 'dirt');
  } finally {
    fs.unlinkSync(fixturePath);
  }
});
