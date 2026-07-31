const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const nbt = require('prismarine-nbt');

// litematica packs entries LSB-first into 64-bit words; an entry never
// spans two words (unlike anvil chunk section format). Unpacks `numEntries`
// values of `bitsPerEntry` bits each from `longArray` (array of [hi32, lo32]
// pairs, as produced by prismarine-nbt's longArray tag).
function unpackLongArray(longArray, bitsPerEntry, numEntries) {
  const entriesPerLong = Math.floor(64 / bitsPerEntry);
  const mask = (1n << BigInt(bitsPerEntry)) - 1n;
  const values = new Array(numEntries);
  for (let i = 0; i < numEntries; i++) {
    const longIndex = Math.floor(i / entriesPerLong);
    const bitOffset = (i % entriesPerLong) * bitsPerEntry;
    const [hi, lo] = longArray[longIndex];
    const word = (BigInt(hi) << 32n) | (BigInt(lo) & 0xffffffffn);
    values[i] = Number((word >> BigInt(bitOffset)) & mask);
  }
  return values;
}

function parseRegion(region) {
  const pos = region.value.Position.value;
  const size = region.value.Size.value;
  const sizeX = Math.abs(size.x.value);
  const sizeY = Math.abs(size.y.value);
  const sizeZ = Math.abs(size.z.value);

  const palette = region.value.BlockStatePalette.value.value.map((entry) => {
    const name = entry.Name.value;
    return name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;
  });

  const numEntries = sizeX * sizeY * sizeZ;
  const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(palette.length)));
  const longArray = region.value.BlockStates.value; // array of [hi32, lo32]
  const indices = unpackLongArray(longArray, bitsPerEntry, numEntries);

  const blocks = [];
  // litematica iterates y, then z, then x (x fastest) when linearizing indices.
  let i = 0;
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const paletteIndex = indices[i++];
        const name = palette[paletteIndex];
        if (name && name !== 'air') {
          blocks.push({ x: pos.x.value + x, y: pos.y.value + y, z: pos.z.value + z, name });
        }
      }
    }
  }
  return blocks;
}

async function loadLitematic(filePath) {
  const raw = await fs.readFile(filePath);
  const unzipped = zlib.gunzipSync(raw);
  const { parsed } = await nbt.parse(unzipped);

  const regions = Object.values(parsed.value.Regions.value);
  return regions.flatMap(parseRegion);
}

module.exports = { loadLitematic };
