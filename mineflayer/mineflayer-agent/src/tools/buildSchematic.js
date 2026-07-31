const { registerTool } = require('./index');
const { loadSchem } = require('../schematics/schemLoader');
const { loadLitematic } = require('../schematics/litematicLoader');

// y-axis rotation only, matches how these formats are placed in practice.
function rotate(x, z, rotation) {
  switch (rotation) {
    case 0: return { x, z };
    case 90: return { x: -z, z: x };
    case 180: return { x: -x, z: -z };
    case 270: return { x: z, z: -x };
    default: throw new Error(`unsupported rotation: ${rotation}`);
  }
}

async function compile({ sourcePath, originX, originY, originZ, rotation }) {
  const blocks = sourcePath.endsWith('.litematic')
    ? await loadLitematic(sourcePath)
    : await loadSchem(sourcePath);

  return blocks.map((b) => {
    const r = rotate(b.x, b.z, rotation);
    return {
      action: 'place',
      x: originX + r.x,
      y: originY + b.y,
      z: originZ + r.z,
      block_type: b.name
    };
  });
}

registerTool({
  name: 'build_schematic',
  description: 'Place a pre-made structure loaded from a .schem or .litematic file at the given origin, optionally rotated around the y axis.',
  argsSchema: {
    type: 'object',
    properties: {
      sourcePath: { type: 'string', minLength: 1 },
      originX: { type: 'integer' },
      originY: { type: 'integer' },
      originZ: { type: 'integer' },
      rotation: { type: 'integer', enum: [0, 90, 180, 270] }
    },
    required: ['sourcePath', 'originX', 'originY', 'originZ', 'rotation'],
    additionalProperties: false
  },
  compile
});

module.exports = { compile };
