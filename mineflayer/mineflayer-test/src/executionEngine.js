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

    let stopped = false;

    try {
      for (const row of pending) {
        // Checked once per action (cheap - jobs table already has this row
        // cached by sqlite) so `!bot stop` (which sets status to 'stopping')
        // takes effect between actions instead of running the whole queued
        // action list to completion.
        if (this.jobManager.getStatus(jobId).status === 'stopping') {
          stopped = true;
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

    if (stopped) {
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
    const pos = { x: row.x, y: row.y, z: row.z };
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

    const pos = { x: row.x, y: row.y, z: row.z };
    try {
      const reference = this._findPlacementReference(pos);
      if (!reference) {
        throw new Error(`no solid neighbor block to place against at ${pos.x},${pos.y},${pos.z}`);
      }
      await this.bot.pathfinder.goto(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      await this.bot.equip(blockType, 'hand');
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
