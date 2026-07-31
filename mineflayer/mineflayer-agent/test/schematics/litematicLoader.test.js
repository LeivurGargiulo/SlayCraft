const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadLitematic } = require('../../src/schematics/litematicLoader');

test('loadLitematic parses a single-region file, skipping air', async () => {
  const blocks = await loadLitematic(path.join(__dirname, '..', 'fixtures', 'tiny-single-region.litematic'));
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].name, 'stone');
  assert.deepStrictEqual([blocks[0].x, blocks[0].y, blocks[0].z], [1, 0, 0]);
});

test('loadLitematic flattens multiple regions into one coordinate space using each region Position offset', async () => {
  const blocks = await loadLitematic(path.join(__dirname, '..', 'fixtures', 'tiny-multi-region.litematic'));
  assert.strictEqual(blocks.length, 2);
  const byPos = Object.fromEntries(blocks.map((b) => [`${b.x},${b.y},${b.z}`, b.name]));
  assert.strictEqual(byPos['0,0,0'], 'stone');
  assert.strictEqual(byPos['5,0,0'], 'dirt');
});
