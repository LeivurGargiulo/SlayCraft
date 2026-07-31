const { goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

const PROGRESS_INTERVAL_MS = 10000;
const NO_STOCK_ERROR = 'no fill block available (inventory exhausted)';

// Candidate neighbor offsets to find a solid block to place against, tried in order.
const FACE_OFFSETS = [
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/**
 * Generic runner for a queued job's action list (break/place). Not specific to any
 * one compiler (flatten, future schematic, ...) - it only knows about the
 * job_actions row shape produced by JobManager.
 */
class ExecutionEngine {
  constructor(bot, jobManager) {
    this.bot = bot;
    this.jobManager = jobManager;
    this.aborted = false;
  }

  // Called on bot disconnect, before the JobManager's db is closed: tells the
  // running job's loop and its progress interval to stop touching the db.
  // Deliberately does NOT set a terminal job status - the job stays 'running'
  // so the next startup's getInterruptedJobs() requeue resumes it.
  abort() {
    this.aborted = true;
  }

  async runJob(jobId) {
    this.aborted = false;
    const stock = this._rebuildStock(jobId);
    const pending = this.jobManager.getPendingActions(jobId);

    const interval = setInterval(() => {
      if (this.aborted) return;
      const status = this.jobManager.getStatus(jobId);
      this.bot.chat(`Job ${jobId}: ${status.completed_actions}/${status.total_actions} actions complete`);
    }, PROGRESS_INTERVAL_MS);

    // null = ran to completion; otherwise the status that stopped us.
    let stoppedBy = null;

    try {
      for (const row of pending) {
        if (this.aborted) {
          return; // finally still clears the interval; no db writes on this path
        }

        // Checked once per action (cheap - jobs table already has this row
        // cached by sqlite) so `!bot stop` ('stopping') and `!bot cancel`
        // ('cancelled') both take effect between actions instead of running
        // the whole queued action list to completion.
        const status = this.jobManager.getStatus(jobId).status;
        if (status === 'stopping' || status === 'cancelled') {
          stoppedBy = status;
          break;
        }

        if (row.action === 'break') {
          await this._runBreak(jobId, row, stock);
        } else if (row.action === 'place') {
          await this._runPlace(jobId, row, stock);
        }
      }
    } finally {
      clearInterval(interval);
    }

    if (stoppedBy === 'cancelled') {
      // Already cancelled explicitly - don't overwrite it.
      return;
    }
    if (stoppedBy === 'stopping') {
      this.jobManager.markJobStatus(jobId, 'cancelled');
      return;
    }

    const failed = this._hasFailedActions(jobId);
    this.jobManager.markJobStatus(jobId, failed ? 'failed' : 'completed');
  }

  // Rebuilds the in-memory fill-stock map from actions already marked done,
  // so a resumed job (after a crash) starts with the correct counts instead
  // of a separately-persisted (and driftable) counter. Uses a Map (not a
  // plain object) so a `null` block_type (flatten never sets one) stays the
  // actual value `null` instead of being coerced to the string "null" as an
  // object key would - otherwise a resumed place action could try to equip
  // the literal string "null" as an item name.
  _rebuildStock(jobId) {
    const stock = new Map();
    for (const row of this.jobManager.getDoneActions(jobId)) {
      if (row.action === 'break') {
        stock.set(row.block_type, (stock.get(row.block_type) ?? 0) + 1);
      } else if (row.action === 'place') {
        stock.set(row.block_type, (stock.get(row.block_type) ?? 0) - 1);
      }
    }
    return stock;
  }

  async _runBreak(jobId, row, stock) {
    const pos = new Vec3(row.x, row.y, row.z);
    try {
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      const block = this.bot.blockAt(pos);
      await this.bot.dig(block);
      const blockType = block ? block.name : row.block_type;
      stock.set(blockType, (stock.get(blockType) ?? 0) + 1);
      this.jobManager.markActionDone(jobId, row.seq);
    } catch (err) {
      this.jobManager.markActionFailed(jobId, row.seq, err.message);
    }
  }

  async _runPlace(jobId, row, stock) {
    const blockType = this._pickStockedBlockType(row.block_type, stock);
    if (blockType === undefined) {
      this.jobManager.markActionFailed(jobId, row.seq, NO_STOCK_ERROR);
      return;
    }

    // mineflayer's equip() needs a real inventory Item, never a name string.
    // The in-memory stock map counts *broken block* names, which don't always
    // match the item actually dropped (stone -> cobblestone, grass_block ->
    // dirt), so an exact-name miss is normal: fall back to whatever placeable
    // item we're actually holding. The stock map stays a pure counter.
    // ponytail: no drop-table mapping; fall back to any inventory item. Add a
    // real block->drop table only if fill-material fidelity ever matters.
    const item = this._resolveInventoryItem(blockType);
    if (!item) {
      this.jobManager.markActionFailed(jobId, row.seq, NO_STOCK_ERROR);
      return;
    }

    const pos = new Vec3(row.x, row.y, row.z);
    try {
      const reference = this._findPlacementReference(pos);
      if (!reference) {
        throw new Error(`no solid neighbor block to place against at ${pos.x},${pos.y},${pos.z}`);
      }
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      await this.bot.equip(item, 'hand');
      await this.bot.placeBlock(reference.referenceBlock, reference.faceVector);
      stock.set(blockType, stock.get(blockType) - 1);
      this.jobManager.markActionDone(jobId, row.seq);
    } catch (err) {
      this.jobManager.markActionFailed(jobId, row.seq, err.message);
    }
  }

  // Prefers the action's own requested block_type if we have stock for it,
  // otherwise falls back to whatever stocked type is available. Returns
  // `undefined` (not `null`) when nothing is stocked, since `null` is itself
  // a legitimate stock key (flatten's compiler never sets a block_type).
  _pickStockedBlockType(preferredType, stock) {
    if (stock.get(preferredType) > 0) {
      return preferredType;
    }
    for (const [type, count] of stock) {
      if (count > 0) return type;
    }
    return undefined;
  }

  // Resolves the Item to equip: the requested name if we're really holding it,
  // otherwise any item in inventory (see _runPlace). Returns undefined when the
  // inventory is genuinely empty, which the caller treats as stock exhaustion.
  _resolveInventoryItem(blockType) {
    const items = this.bot.inventory.items();
    return items.find((i) => i.name === blockType) ?? items[0];
  }

  // Finds a solid neighbor block adjacent to pos to place against, and the
  // face vector (from that neighbor toward pos) mineflayer's placeBlock expects.
  _findPlacementReference(pos) {
    for (const offset of FACE_OFFSETS) {
      const block = this.bot.blockAt(new Vec3(pos.x + offset.x, pos.y + offset.y, pos.z + offset.z));
      if (block && block.type !== 0) {
        return { referenceBlock: block, faceVector: new Vec3(-offset.x, -offset.y, -offset.z) };
      }
    }
    return null;
  }

  _hasFailedActions(jobId) {
    const row = this.jobManager.db
      .prepare('SELECT COUNT(*) as cnt FROM job_actions WHERE job_id = ? AND status = ?')
      .get(jobId, 'failed');
    return row.cnt > 0;
  }
}

module.exports = ExecutionEngine;
