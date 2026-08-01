const Database = require('better-sqlite3');

class JobManager {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    // Initialize schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        status TEXT NOT NULL,
        params_json TEXT NOT NULL,
        total_actions INTEGER,
        completed_actions INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_actions (
        job_id INTEGER NOT NULL REFERENCES jobs(id),
        seq INTEGER NOT NULL,
        action TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        z INTEGER NOT NULL,
        block_type TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        PRIMARY KEY (job_id, seq)
      );
    `);

    // Prepare statements
    this.stmtInsertJob = this.db.prepare(`
      INSERT INTO jobs (type, requested_by, status, params_json, total_actions, completed_actions, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtInsertAction = this.db.prepare(`
      INSERT INTO job_actions (job_id, seq, action, x, y, z, block_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetJobById = this.db.prepare(`
      SELECT * FROM jobs WHERE id = ?
    `);

    this.stmtGetQueue = this.db.prepare(`
      SELECT * FROM jobs WHERE status IN ('queued', 'running', 'paused', 'stopping') ORDER BY created_at ASC
    `);

    this.stmtGetNextQueuedJob = this.db.prepare(`
      SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1
    `);

    this.stmtMarkRunning = this.db.prepare(`
      UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ?
    `);

    this.stmtMarkJobStatus = this.db.prepare(`
      UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?
    `);

    this.stmtMarkActionDone = this.db.prepare(`
      UPDATE job_actions SET status = 'done' WHERE job_id = ? AND seq = ?
    `);

    this.stmtMarkActionFailed = this.db.prepare(`
      UPDATE job_actions SET status = 'failed', error = ? WHERE job_id = ? AND seq = ?
    `);

    this.stmtIncrementCompleted = this.db.prepare(`
      UPDATE jobs SET completed_actions = completed_actions + 1, updated_at = ? WHERE id = ?
    `);

    this.stmtUpdateJobTimestamp = this.db.prepare(`
      UPDATE jobs SET updated_at = ? WHERE id = ?
    `);

    this.stmtGetPendingActions = this.db.prepare(`
      SELECT * FROM job_actions WHERE job_id = ? AND status = 'pending' ORDER BY seq ASC
    `);

    this.stmtGetDoneActions = this.db.prepare(`
      SELECT * FROM job_actions WHERE job_id = ? AND status = 'done' ORDER BY seq ASC
    `);

    this.stmtGetInterruptedJobs = this.db.prepare(`
      SELECT * FROM jobs WHERE status IN ('running', 'stopping')
    `);

    this.stmtCancelJob = this.db.prepare(`
      UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ?
    `);
  }

  enqueue(type, requestedBy, paramsJson, actions) {
    const now = Date.now();

    const transaction = this.db.transaction(() => {
      const jobResult = this.stmtInsertJob.run(
        type,
        requestedBy,
        'queued',
        paramsJson,
        actions.length,
        0,
        now,
        now
      );
      const jobId = jobResult.lastInsertRowid;

      // Insert all actions
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        this.stmtInsertAction.run(
          jobId,
          i,
          action.action,
          action.x,
          action.y,
          action.z,
          action.block_type || null,
          'pending'
        );
      }

      return jobId;
    });

    return transaction();
  }

  cancel(jobId, requestedBy, isAdmin) {
    const job = this.stmtGetJobById.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Only job owner or admin can cancel
    if (job.requested_by !== requestedBy && !isAdmin) {
      throw new Error('Permission denied: only job owner or admin can cancel');
    }

    const now = Date.now();
    this.stmtCancelJob.run(now, jobId);
  }

  getStatus(jobId) {
    return this.stmtGetJobById.get(jobId);
  }

  getQueue() {
    return this.stmtGetQueue.all();
  }

  getNextQueuedJob() {
    return this.stmtGetNextQueuedJob.get();
  }

  markRunning(jobId) {
    const now = Date.now();
    this.stmtMarkRunning.run(now, jobId);
  }

  markJobStatus(jobId, status) {
    const now = Date.now();
    this.stmtMarkJobStatus.run(status, now, jobId);
  }

  markActionDone(jobId, seq) {
    const now = Date.now();

    const transaction = this.db.transaction(() => {
      this.stmtMarkActionDone.run(jobId, seq);
      this.stmtIncrementCompleted.run(now, jobId);
    });

    transaction();
  }

  markActionFailed(jobId, seq, error) {
    const now = Date.now();

    const transaction = this.db.transaction(() => {
      this.stmtMarkActionFailed.run(error, jobId, seq);
      this.stmtUpdateJobTimestamp.run(now, jobId);
    });

    transaction();
  }

  getPendingActions(jobId) {
    return this.stmtGetPendingActions.all(jobId);
  }

  getDoneActions(jobId) {
    return this.stmtGetDoneActions.all(jobId);
  }

  getInterruptedJobs() {
    return this.stmtGetInterruptedJobs.all();
  }

  close() {
    this.db.close();
  }
}

module.exports = JobManager;
