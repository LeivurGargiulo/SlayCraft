// Run manually to (re)generate the .litematic fixtures used by
// litematicLoader.test.js. Not part of the automated test run.
const fs = require('node:fs');
const path = require('node:path');
const nbt = require('prismarine-nbt');
const zlib = require('node:zlib');

// Packs `values` (each < 2^bitsPerEntry) into a BigInt64Array per the
// litematica bitpacking rule: entries packed LSB-first into 64-bit words,
// an entry never spans two words (any leftover bits in a word are padding).
function packLongArray(values, bitsPerEntry) {
  const entriesPerLong = Math.floor(64 / bitsPerEntry);
  const numLongs = Math.ceil(values.length / entriesPerLong);
  const longs = new BigInt64Array(numLongs);
  for (let i = 0; i < values.length; i++) {
    const longIndex = Math.floor(i / entriesPerLong);
    const bitOffset = (i % entriesPerLong) * bitsPerEntry;
    longs[longIndex] |= BigInt(values[i]) << BigInt(bitOffset);
  }
  return Array.from(longs);
}

function buildRegion(sizeX, sizeY, sizeZ, posX, posY, posZ, paletteNames, blockIndices) {
  const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(paletteNames.length)));
  const packed = packLongArray(blockIndices, bitsPerEntry);
  return nbt.comp({
    Position: nbt.comp({ x: nbt.int(posX), y: nbt.int(posY), z: nbt.int(posZ) }),
    Size: nbt.comp({ x: nbt.int(sizeX), y: nbt.int(sizeY), z: nbt.int(sizeZ) }),
    BlockStatePalette: nbt.list(nbt.comp(paletteNames.map((name) => ({ Name: nbt.string(name) })))),
    BlockStates: nbt.longArray(packed.map((v) => [Number(v >> 32n), Number(v & 0xffffffffn)]))
  });
}

async function writeFixture(filePath, regions) {
  const root = nbt.comp({
    MinecraftDataVersion: nbt.int(3700),
    Version: nbt.int(6),
    Regions: nbt.comp(Object.fromEntries(regions.map((r, i) => [`region${i}`, r])))
  });
  const buf = nbt.writeUncompressed(root, 'big');
  fs.writeFileSync(filePath, zlib.gzipSync(buf));
}

async function main() {
  const fixturesDir = __dirname;

  // Single region, 2x1x1: air, stone
  const single = buildRegion(2, 1, 1, 0, 0, 0, ['minecraft:air', 'minecraft:stone'], [0, 1]);
  await writeFixture(path.join(fixturesDir, 'tiny-single-region.litematic'), [single]);

  // Two regions: region0 at (0,0,0) is 1x1x1 stone, region1 at offset (5,0,0) is 1x1x1 dirt
  const r0 = buildRegion(1, 1, 1, 0, 0, 0, ['minecraft:stone'], [0]);
  const r1 = buildRegion(1, 1, 1, 5, 0, 0, ['minecraft:dirt'], [0]);
  await writeFixture(path.join(fixturesDir, 'tiny-multi-region.litematic'), [r0, r1]);
}

main();
