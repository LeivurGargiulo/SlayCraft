const { registerTool } = require('./index');

const MAX_LENGTH = 200;
const MAX_HEIGHT = 50;

function compile({ x, y, z, length, height, block, orientation }) {
  const actions = [];
  for (let i = 0; i < length; i++) {
    for (let h = 0; h < height; h++) {
      const pos = orientation === 'x'
        ? { x: x + i, y: y + h, z }
        : { x, y: y + h, z: z + i };
      actions.push({ action: 'place', x: pos.x, y: pos.y, z: pos.z, block_type: block });
    }
  }
  return actions;
}

registerTool({
  name: 'build_wall',
  description: 'Build a straight vertical wall of a given block type, starting at (x,y,z), running `length` blocks along the x or z axis and `height` blocks tall.',
  argsSchema: {
    type: 'object',
    properties: {
      x: { type: 'integer' },
      y: { type: 'integer' },
      z: { type: 'integer' },
      length: { type: 'integer', minimum: 1, maximum: MAX_LENGTH },
      height: { type: 'integer', minimum: 1, maximum: MAX_HEIGHT },
      block: { type: 'string', minLength: 1 },
      orientation: { type: 'string', enum: ['x', 'z'] }
    },
    required: ['x', 'y', 'z', 'length', 'height', 'block', 'orientation'],
    additionalProperties: false
  },
  compile
});

module.exports = { compile };
