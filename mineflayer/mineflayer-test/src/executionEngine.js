const { goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');

const PROGRESS_INTERVAL_MS = 10000;
const NO_STOCK_ERROR = 'no fill block available (inventory exhausted)';
const DEFAULT_PATHFIND_TIMEOUT_MS = 30000;

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
  constructor(bot, jobManager, { pathfindTimeoutMs = DEFAULT_PATHFIND_TIMEOUT_MS } = {}) {
    this.bot = bot;
    this.jobManager = jobManager;
    this.aborted = false;
    this.pathfindTimeoutMs = pathfindTimeoutMs;
  }

  // mineflayer-pathfinder's goto() can hang forever on awkward/unreachable
  // terrain (searchRadius is unbounded by default, and a 'partial'-status
  // path_update never triggers goto.js's own resolve/reject listeners). Force
  // a bound here so a stuck action fails and gets recorded instead of
  // freezing the whole job - bot.pathfinder.stop() is what the library itself
  // uses to cleanly reject an in-flight goto() (via its 'path_stop' listener).
  async _gotoWithTimeout(goal) {
    const gotoPromise = this.bot.pathfinder.goto(goal);
    // Swallow a late rejection/resolution from the abandoned goto() call so
    // it never surfaces as an unhandled rejection once we've already timed out.
    gotoPromise.catch(() => {});

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        this.bot.pathfinder.stop(); // best-effort: ask pathfinder to actually stop moving
        reject(new Error(`pathfinding timed out after ${this.pathfindTimeoutMs}ms`));
      }, this.pathfindTimeoutMs);
    });

    try {
      await Promise.race([gotoPromise, timeout]);
    } finally {
      clearTimeout(timer);
    }
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
    const pending = this.jobManager.getPendingActions(jobId);

    const interval = setInterval(() => {
      if (this.aborted) return;
      const status = this.jobManager.getStatus(jobId);
      const line = `Job ${jobId}: ${status.completed_actions}/${status.total_actions} actions complete`;
      this.bot.chat(line);
      console.log(`[executionEngine] ${line}`);
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
          await this._runBreak(jobId, row);
        } else if (row.action === 'place') {
          await this._runPlace(jobId, row);
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

  async _runBreak(jobId, row) {
    const pos = new Vec3(row.x, row.y, row.z);
    try {
      await this._gotoWithTimeout(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      const block = this.bot.blockAt(pos);
      await this.bot.dig(block);
      this.jobManager.markActionDone(jobId, row.seq);
    } catch (err) {
      console.error(`[executionEngine] job ${jobId} seq ${row.seq} (${row.action}) failed: ${err.message}`);
      this.jobManager.markActionFailed(jobId, row.seq, err.message);
    }
  }

  async _runPlace(jobId, row) {
    // mineflayer's equip() needs a real inventory Item, never a name string.
    // Resolved against the bot's actual live inventory (not a per-job
    // simulated counter) - stock carried over from an earlier job, or
    // manually given items, is real stock, and a job with no break actions
    // of its own (region already flattened by a prior job) must still be
    // able to fill using it. An exact block-type match is preferred but not
    // required, since the broken block's name doesn't always match its drop
    // (stone -> cobblestone, grass_block -> dirt).
    // ponytail: no drop-table mapping; fall back to any inventory item. Add a
    // real block->drop table only if fill-material fidelity ever matters.
    const item = this._resolveInventoryItem(row.block_type);
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
      await this._gotoWithTimeout(new goals.GoalNear(pos.x, pos.y, pos.z, 1));
      await this.bot.equip(item, 'hand');
      await this.bot.placeBlock(reference.referenceBlock, reference.faceVector);
      this.jobManager.markActionDone(jobId, row.seq);
    } catch (err) {
      console.error(`[executionEngine] job ${jobId} seq ${row.seq} (${row.action}) failed: ${err.message}`);
      this.jobManager.markActionFailed(jobId, row.seq, err.message);
    }
  }

  // Resolves the Item to equip: the requested name if we're really holding it,
  // otherwise any *placeable block* in inventory (see _runPlace) - never a
  // tool. Returns undefined when no placeable block is held, which the
  // caller treats as stock exhaustion.
  _resolveInventoryItem(blockType) {
    const items = this.bot.inventory.items();
    const isBlock = (item) => this.bot.registry.blocksByName[item.name] !== undefined;
    return items.find((i) => i.name === blockType) ?? items.find(isBlock);
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
