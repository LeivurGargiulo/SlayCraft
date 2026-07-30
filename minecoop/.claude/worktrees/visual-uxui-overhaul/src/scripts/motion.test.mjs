import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTilt, computeParallaxOffset } from './motion.js';

test('computeTilt returns zero rotation at element center', () => {
  const { rx, ry } = computeTilt(50, 50, 100, 100, 8);
  assert.equal(rx, 0);
  assert.equal(ry, 0);
});

test('computeTilt tilts toward the top-left corner', () => {
  const { rx, ry } = computeTilt(0, 0, 100, 100, 8);
  assert.equal(rx, 8);
  assert.equal(ry, -8);
});

test('computeTilt tilts toward the bottom-right corner', () => {
  const { rx, ry } = computeTilt(100, 100, 100, 100, 8);
  assert.equal(rx, -8);
  assert.equal(ry, 8);
});

test('computeTilt clamps pointer positions outside element bounds', () => {
  const { rx, ry } = computeTilt(200, -50, 100, 100, 8);
  assert.ok(rx <= 8 && rx >= -8);
  assert.ok(ry <= 8 && ry >= -8);
});

test('computeParallaxOffset maps progress 0..1 to -max..max', () => {
  assert.equal(computeParallaxOffset(0, 40), -40);
  assert.equal(computeParallaxOffset(1, 40), 40);
  assert.equal(computeParallaxOffset(0.5, 40), 0);
});

test('computeParallaxOffset clamps out-of-range progress', () => {
  assert.equal(computeParallaxOffset(-0.5, 40), -40);
  assert.equal(computeParallaxOffset(1.5, 40), 40);
});
