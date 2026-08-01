const fs = require('node:fs');
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');

// Returns Block[] = {x, y, z, name} in schematic-local coordinates (relative
// to the schematic's own (0,0,0) corner, not any world position — callers
// translate to a placement origin).
async function loadSchem(filePath) {
  const buffer = fs.readFileSync(filePath);
  const schematic = await Schematic.read(buffer, '1.21.4');
  const blocks = [];
  const size = schematic.size;
  for (let x = 0; x < size.x; x++) {
    for (let y = 0; y < size.y; y++) {
      for (let z = 0; z < size.z; z++) {
        const block = schematic.getBlock(new Vec3(x, y, z));
        if (!block || block.name === 'air') continue;
        blocks.push({ x, y, z, name: block.name });
      }
    }
  }
  return blocks;
}

module.exports = { loadSchem };
