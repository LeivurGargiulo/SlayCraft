const test = require('node:test');
const assert = require('node:assert');
require('../../src/tools/buildWall');
const { getTool, validateArgs } = require('../../src/tools/index');

test('build_wall tool registered with bounded length/height', () => {
  assert.strictEqual(validateArgs('build_wall', { x: 0, y: 64, z: 0, length: 10, height: 3, block: 'stone', orientation: 'x' }).valid, true);
  assert.strictEqual(validateArgs('build_wall', { x: 0, y: 64, z: 0, length: 10000, height: 3, block: 'stone', orientation: 'x' }).valid, false);
});

test('build_wall compile generates a length x height sheet along the x axis', () => {
  const tool = getTool('build_wall');
  const actions = tool.compile({ x: 0, y: 64, z: 0, length: 2, height: 2, block: 'stone', orientation: 'x' });
  assert.strictEqual(actions.length, 4);
  assert.ok(actions.every((a) => a.action === 'place' && a.block_type === 'stone'));
  const coords = actions.map((a) => `${a.x},${a.y},${a.z}`).sort();
  assert.deepStrictEqual(coords, ['0,64,0', '0,65,0', '1,64,0', '1,65,0']);
});

test('build_wall compile orientation z runs along the z axis', () => {
  const tool = getTool('build_wall');
  const actions = tool.compile({ x: 0, y: 64, z: 0, length: 2, height: 1, block: 'stone', orientation: 'z' });
  const coords = actions.map((a) => `${a.x},${a.y},${a.z}`).sort();
  assert.deepStrictEqual(coords, ['0,64,0', '0,64,1']);
});
