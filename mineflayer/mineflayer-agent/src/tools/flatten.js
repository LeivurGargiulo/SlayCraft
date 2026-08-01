const { Vec3 } = require('vec3');
const { registerTool } = require('./index');

const BREAK_SCAN_HEIGHT = 10;
const FILL_SCAN_DEPTH = 10;
const MAX_REGION_SIDE = 100; // (x2-x1) or (z2-z1) span cap; 100x100 = 10000 columns, matches existing bot's MAX_REGION_COLUMNS

function compile({ x1, z1, x2, z2, targetY }, worldContext) {
  if (Math.abs(x2 - x1) > MAX_REGION_SIDE || Math.abs(z2 - z1) > MAX_REGION_SIDE) {
    throw new Error(`region too large: max ${MAX_REGION_SIDE} blocks per side`);
  }

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);

  const breaks = [];
  const places = [];

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = targetY + BREAK_SCAN_HEIGHT; y >= targetY + 1; y--) {
        const block = worldContext.blockAt(new Vec3(x, y, z));
        if (block && block.type !== 0) {
          breaks.push({ action: 'break', x, y, z, block_type: null });
        }
      }
    }
  }

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = targetY - FILL_SCAN_DEPTH + 1; y <= targetY; y++) {
        const block = worldContext.blockAt(new Vec3(x, y, z));
        if (block && block.type === 0) {
          places.push({ action: 'place', x, y, z, block_type: null });
        }
      }
    }
  }

  return breaks.concat(places);
}

registerTool({
  name: 'flatten_region',
  description: 'Flatten a rectangular x/z region to a single target Y level by breaking blocks above it and filling air below it.',
  argsSchema: {
    type: 'object',
    properties: {
      x1: { type: 'integer' },
      z1: { type: 'integer' },
      x2: { type: 'integer' },
      z2: { type: 'integer' },
      targetY: { type: 'integer', minimum: -64, maximum: 320 }
    },
    required: ['x1', 'z1', 'x2', 'z2', 'targetY'],
    additionalProperties: false
  },
  compile
});

module.exports = { compile, MAX_REGION_SIDE };
