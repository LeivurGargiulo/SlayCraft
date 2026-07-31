const BREAK_SCAN_HEIGHT = 10;
const FILL_SCAN_DEPTH = 10;

/**
 * Compiles a flatten job into an ordered list of break and place actions.
 *
 * For each column (x, z) in the region [x1,x2] x [z1,z2]:
 * 1. Scans from targetY + BREAK_SCAN_HEIGHT down to targetY + 1, emitting break actions
 *    (top-down) for each non-air block.
 * 2. Scans from targetY - FILL_SCAN_DEPTH up to targetY - 1, emitting place actions
 *    (bottom-to-top) for each air block.
 *
 * Returns all break actions first, then all place actions, maintaining deterministic
 * column iteration order (x first, then z).
 *
 * @param {Object} bot - A mineflayer bot instance (only bot.blockAt is used)
 * @param {Object} params - Parameters for the flatten job
 * @param {number} params.x1 - Minimum x coordinate (inclusive)
 * @param {number} params.z1 - Minimum z coordinate (inclusive)
 * @param {number} params.x2 - Maximum x coordinate (inclusive)
 * @param {number} params.z2 - Maximum z coordinate (inclusive)
 * @param {number} params.targetY - Target Y level to flatten to
 * @returns {Array} Array of actions: {action: 'break'|'place', pos: {x,y,z}, blockType?}
 */
function compileFlatten(bot, { x1, z1, x2, z2, targetY }) {
  const actions = [];

  // Iterate over columns in deterministic order (x first, then z)
  for (let x = x1; x <= x2; x++) {
    for (let z = z1; z <= z2; z++) {
      // Break scan: top-down from targetY + BREAK_SCAN_HEIGHT to targetY + 1
      for (let y = targetY + BREAK_SCAN_HEIGHT; y >= targetY + 1; y--) {
        const block = bot.blockAt({ x, y, z });
        // Non-air blocks are either blocks with type !== 0 or null check
        if (block && block.type !== 0) {
          actions.push({
            action: 'break',
            pos: { x, y, z }
          });
        }
      }

      // Place scan: bottom-to-top from targetY - FILL_SCAN_DEPTH to targetY - 1
      for (let y = targetY - FILL_SCAN_DEPTH; y <= targetY - 1; y++) {
        const block = bot.blockAt({ x, y, z });
        // Air blocks are either null or blocks with type === 0
        if (!block || block.type === 0) {
          actions.push({
            action: 'place',
            pos: { x, y, z }
          });
        }
      }
    }
  }

  return actions;
}

module.exports = { compileFlatten, BREAK_SCAN_HEIGHT, FILL_SCAN_DEPTH };
