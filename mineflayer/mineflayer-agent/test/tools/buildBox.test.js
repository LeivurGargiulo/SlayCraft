const test = require('node:test');
const assert = require('node:assert');
require('../../src/tools/buildBox');
const { getTool, validateArgs } = require('../../src/tools/index');

test('build_box tool registered with bounded dimensions', () => {
  assert.strictEqual(validateArgs('build_box', { x: 0, y: 64, z: 0, width: 3, height: 3, depth: 3, block: 'stone', hollow: true }).valid, true);
  assert.strictEqual(validateArgs('build_box', { x: 0, y: 64, z: 0, width: 200, height: 3, depth: 3, block: 'stone', hollow: true }).valid, false);
});

test('build_box compile hollow=true only places the shell', () => {
  const tool = getTool('build_box');
  const actions = tool.compile({ x: 0, y: 0, z: 0, width: 3, height: 3, depth: 3, block: 'stone', hollow: true });
  // 3x3x3 solid = 27, hollow removes the single interior cell = 26
  assert.strictEqual(actions.length, 26);
  assert.ok(!actions.some((a) => a.x === 1 && a.y === 1 && a.z === 1));
});

test('build_box compile hollow=false fills every cell', () => {
  const tool = getTool('build_box');
  const actions = tool.compile({ x: 0, y: 0, z: 0, width: 2, height: 2, depth: 2, block: 'dirt', hollow: false });
  assert.strictEqual(actions.length, 8);
  assert.ok(actions.every((a) => a.block_type === 'dirt'));
});
