const test = require('node:test');
const assert = require('node:assert');
const { Vec3 } = require('vec3');
require('../../src/tools/flatten');
const { getTool, validateArgs } = require('../../src/tools/index');

function fakeWorldContext(blockMap) {
  return {
    blockAt: (pos) => blockMap[`${pos.x},${pos.y},${pos.z}`] ?? null
  };
}

test('flatten_region tool is registered', () => {
  const tool = getTool('flatten_region');
  assert.ok(tool);
});

test('flatten_region compile emits break then place actions like the existing flattenCompiler', () => {
  const blockMap = {};
  blockMap['0,65,0'] = { type: 1 }; // solid block above target -> break
  blockMap['0,64,0'] = { type: 0 }; // air at target -> place
  const worldContext = fakeWorldContext(blockMap);

  const tool = getTool('flatten_region');
  const actions = tool.compile({ x1: 0, z1: 0, x2: 0, z2: 0, targetY: 64 }, worldContext);

  const breaks = actions.filter((a) => a.action === 'break');
  const places = actions.filter((a) => a.action === 'place');
  assert.strictEqual(breaks.length, 1);
  assert.deepStrictEqual([breaks[0].x, breaks[0].y, breaks[0].z], [0, 65, 0]);
  assert.strictEqual(places.length, 1);
  assert.deepStrictEqual([places[0].x, places[0].y, places[0].z], [0, 64, 0]);
});

test('flatten_region compile rejects an oversized region', () => {
  const { compile } = require('../../src/tools/flatten');
  const worldContext = fakeWorldContext({});
  assert.throws(() => compile({ x1: 0, z1: 0, x2: 200, z2: 200, targetY: 64 }, worldContext), /region too large/);
});
