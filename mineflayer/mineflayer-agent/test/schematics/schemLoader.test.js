const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');
const mcData = require('minecraft-data')('1.21.4');
const { loadSchem } = require('../../src/schematics/schemLoader');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'tiny.schem');

test('loadSchem reads back a 2x1x1 schematic written by prismarine-schematic', async () => {
  // Build a tiny 2x1x1 schematic: stone at (0,0,0), dirt at (1,0,0).
  // palette maps index -> block state id; blocks maps cell index -> palette index,
  // matching Schematic's internal (y*size.z + z)*size.x + x ordering.
  const size = new Vec3(2, 1, 1);
  const offset = new Vec3(0, 0, 0);
  const palette = [mcData.blocksByName.stone.defaultState, mcData.blocksByName.dirt.defaultState];
  const paletteIndices = [0, 1];
  const schematic = new Schematic('1.21.4', size, offset, palette, paletteIndices);
  const buf = await schematic.write();
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, buf);

  try {
    const blocks = await loadSchem(FIXTURE_PATH);
    assert.strictEqual(blocks.length, 2);
    const byPos = Object.fromEntries(blocks.map((b) => [`${b.x},${b.y},${b.z}`, b.name]));
    assert.strictEqual(byPos['0,0,0'], 'stone');
    assert.strictEqual(byPos['1,0,0'], 'dirt');
  } finally {
    if (fs.existsSync(FIXTURE_PATH)) fs.unlinkSync(FIXTURE_PATH);
  }
});
