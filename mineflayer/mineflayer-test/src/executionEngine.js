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
  }

  async runJob(jobId) {
    const stock = this._rebuildStock(jobId);
    const pending = this.jobManager.getPendingActions(jobId);

    const interval = setInterval(() => {
      const status = this.jobManager.getStatus(jobId);
      this.bot.chat(`Job ${jobId}: ${status.completed_actions}/${status.total_actions} actions complete`);
    }, PROGRESS_INTERVAL_MS);

    try {
      for (const row of pending) {
        if (row.action === 'break') {
          await this._runBreak(jobId, row, stock);
        } else if (row.action === 'place') {
          await this._runPlace(jobId, row, stock);
        }
      }
    } finally {
      clearInterval(interval);
    }

    const failed = this._hasFailedActions(jobId);
    this.jobManager.markJobStatus(jobId, failed ? 'failed' : 'completed');
  }

  // Rebuilds the in-memory fill-stock map from actions already marked done,
  // so a resumed job (after a crash) starts with the correct counts instead
  // of a separately-persisted (and driftable) counter.
  _rebuildStock(jobId) {
    const stock = {};
    for (const row of this.jobManager.getDoneActions(jobId)) {
      if (row.action === 'break') {
        stock[row.block_type] = (stock[row.block_type] ?? 0) + 1;
      } else if (row.action === 'place') {
        stock[row.block_type] = (stock[row.block_type] ?? 0) - 1;
      }
    }
    return stock;
  }

  async _runBreak(jobId, row, stock) {
    const pos = { x: row.x, y: row.y, z: row.z };
    try {
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      const block = this.bot.blockAt(pos);
      await this.bot.dig(block);
      const blockType = block ? block.name : row.block_type;
      stock[blockType] = (stock[blockType] ?? 0) + 1;
      this.jobManager.markActionDone(jobId, row.seq);
    } catch (err) {
      this.jobManager.markActionFailed(jobId, row.seq, err.message);
    }
  }

  async _runPlace(jobId, row, stock) {
    const blockType = this._pickStockedBlockType(row.block_type, stock);
    if (blockType === null) {
      this.jobManager.markActionFailed(jobId, row.seq, NO_STOCK_ERROR);
      return;
    }

    const pos = { x: row.x, y: row.y, z: row.z };
    try {
      const reference = this._findPlacementReference(pos);
      if (!reference) {
        throw new Error(`no solid neighbor block to place against at ${pos.x},${pos.y},${pos.z}`);
      }
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      await this.bot.equip(blockType, 'hand');
      await this.bot.placeBlock(reference.referenceBlock, reference.faceVector);
      stock[blockType] -= 1;
      this.jobManager.markActionDone(jobId, row.seq);
    } catch (err) {
      this.jobManager.markActionFailed(jobId, row.seq, err.message);
    }
  }

  // Prefers the action's own requested block_type if we have stock for it,
  // otherwise falls back to whatever stocked type is available.
  _pickStockedBlockType(preferredType, stock) {
    if (preferredType != null && stock[preferredType] > 0) {
      return preferredType;
    }
    const fallback = Object.keys(stock).find((type) => stock[type] > 0);
    return fallback !== undefined ? fallback : null;
  }

  // Finds a solid neighbor block adjacent to pos to place against, and the
  // face vector (from that neighbor toward pos) mineflayer's placeBlock expects.
  _findPlacementReference(pos) {
    for (const offset of FACE_OFFSETS) {
      const refPos = { x: pos.x + offset.x, y: pos.y + offset.y, z: pos.z + offset.z };
      const block = this.bot.blockAt(refPos);
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
