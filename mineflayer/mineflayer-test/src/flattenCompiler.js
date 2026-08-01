const { Vec3 } = require('vec3');

const BREAK_SCAN_HEIGHT = 10;
const FILL_SCAN_DEPTH = 10;

/**
 * Compiles a flatten job into an ordered list of break and place actions.
 *
 * For each column (x, z) in the region [x1,x2] x [z1,z2]:
 * 1. Scans from targetY + BREAK_SCAN_HEIGHT down to targetY + 1, emitting break actions
 *    (top-down) for each non-air block.
 * 2. Scans from targetY - FILL_SCAN_DEPTH + 1 up to targetY, emitting place actions
 *    (bottom-to-top) for each block confirmed to be air. targetY itself is included,
 *    otherwise a column that is air exactly at the target level is left as a
 *    1-block-deep pit in the finished surface.
 *
 * `bot.blockAt` returning null means "chunk not loaded / unknown", NOT "air": the
 * break scan skips it (nothing known to break) and the fill scan skips it too
 * (placing against unseen terrain is how you get bogus actions).
 *
 * Returns all break actions first, then all place actions, maintaining deterministic
 * column iteration order (x first, then z).
 *
 * @param {Object} bot - A mineflayer bot instance (only bot.blockAt is used)
 * @param {Object} params - Parameters for the flatten job
 * @param {number} params.x1 - One x corner of the region (inclusive, any order)
 * @param {number} params.z1 - One z corner of the region (inclusive, any order)
 * @param {number} params.x2 - Other x corner of the region (inclusive, any order)
 * @param {number} params.z2 - Other z corner of the region (inclusive, any order)
 * @param {number} params.targetY - Target Y level to flatten to
 * @returns {Array} Array of actions: {action: 'break'|'place', pos: {x,y,z}, blockType?}
 */
function compileFlatten(bot, { x1, z1, x2, z2, targetY }) {
  // Corners may be given in any order; normalize so the loops always run.
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);

  const breaks = [];
  const places = [];

  // First pass: emit all break actions (top-down, per column)
  // Iterate over columns in deterministic order (x first, then z)
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      // Break scan: top-down from targetY + BREAK_SCAN_HEIGHT to targetY + 1
      for (let y = targetY + BREAK_SCAN_HEIGHT; y >= targetY + 1; y--) {
        const block = bot.blockAt(new Vec3(x, y, z));
        if (block && block.type !== 0) {
          breaks.push({
            action: 'break',
            pos: { x, y, z }
          });
        }
      }
    }
  }

  // Second pass: emit all place actions (bottom-to-top, per column)
  // Same column iteration order as breaks
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      // Place scan: bottom-to-top from targetY - FILL_SCAN_DEPTH + 1 to targetY
      for (let y = targetY - FILL_SCAN_DEPTH + 1; y <= targetY; y++) {
        const block = bot.blockAt(new Vec3(x, y, z));
        // Only confirmed air (a real block object of type 0) gets filled.
        if (block && block.type === 0) {
          places.push({
            action: 'place',
            pos: { x, y, z }
          });
        }
      }
    }
  }

  return breaks.concat(places);
}

module.exports = { compileFlatten, BREAK_SCAN_HEIGHT, FILL_SCAN_DEPTH };
