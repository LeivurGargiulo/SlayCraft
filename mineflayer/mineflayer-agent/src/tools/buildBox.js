const { registerTool } = require('./index');

const MAX_DIM = 50;

function compile({ x, y, z, width, height, depth, block, hollow }) {
  const actions = [];
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      for (let dz = 0; dz < depth; dz++) {
        const onShell = dx === 0 || dx === width - 1 || dy === 0 || dy === height - 1 || dz === 0 || dz === depth - 1;
        if (hollow && !onShell) continue;
        actions.push({ action: 'place', x: x + dx, y: y + dy, z: z + dz, block_type: block });
      }
    }
  }
  return actions;
}

registerTool({
  name: 'build_box',
  description: 'Build a rectangular box (hollow shell or fully solid) of a given block type, starting at corner (x,y,z) with the given width (x), height (y), and depth (z).',
  argsSchema: {
    type: 'object',
    properties: {
      x: { type: 'integer' },
      y: { type: 'integer' },
      z: { type: 'integer' },
      width: { type: 'integer', minimum: 1, maximum: MAX_DIM },
      height: { type: 'integer', minimum: 1, maximum: MAX_DIM },
      depth: { type: 'integer', minimum: 1, maximum: MAX_DIM },
      block: { type: 'string', minLength: 1 },
      hollow: { type: 'boolean' }
    },
    required: ['x', 'y', 'z', 'width', 'height', 'depth', 'block', 'hollow'],
    additionalProperties: false
  },
  compile
});

module.exports = { compile };
