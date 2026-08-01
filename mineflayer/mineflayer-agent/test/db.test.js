const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const JobManager = require('../src/db');

function tmpDbPath() {
  return path.join(__dirname, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function cleanup(dbPath) {
  for (const suffix of ['', '-shm', '-wal']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

test('insertPlanningJob creates a job in planning status, returned by getNextPlanningJob', () => {
  const dbPath = tmpDbPath();
  const jm = new JobManager(dbPath);
  try {
    const jobId = jm.insertPlanningJob('build a stone wall', 'alice');
    const job = jm.getNextPlanningJob();
    assert.strictEqual(job.id, jobId);
    assert.strictEqual(job.status, 'planning');
    assert.strictEqual(job.task_text, 'build a stone wall');
    assert.strictEqual(job.requested_by, 'alice');
  } finally {
    jm.close();
    cleanup(dbPath);
  }
});

test('attachPlan moves a planning job to queued with actions attached', () => {
  const dbPath = tmpDbPath();
  const jm = new JobManager(dbPath);
  try {
    const jobId = jm.insertPlanningJob('flatten here', 'alice');
    jm.attachPlan(jobId, 'flatten_region', JSON.stringify({ x1: 0, z1: 0, x2: 1, z2: 1, targetY: 64 }), [
      { action: 'break', x: 0, y: 65, z: 0, block_type: null },
      { action: 'place', x: 0, y: 64, z: 0, block_type: 'dirt' }
    ]);
    const status = jm.getStatus(jobId);
    assert.strictEqual(status.status, 'queued');
    assert.strictEqual(status.tool_name, 'flatten_region');
    assert.strictEqual(status.total_actions, 2);
    const pending = jm.getPendingActions(jobId);
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].action, 'break');
    assert.strictEqual(pending[1].block_type, 'dirt');
  } finally {
    jm.close();
    cleanup(dbPath);
  }
});

test('markPlanningFailed sets status failed and stores the error', () => {
  const dbPath = tmpDbPath();
  const jm = new JobManager(dbPath);
  try {
    const jobId = jm.insertPlanningJob('do something impossible', 'alice');
    jm.markPlanningFailed(jobId, 'LLM could not produce valid args after 2 retries');
    const status = jm.getStatus(jobId);
    assert.strictEqual(status.status, 'failed');
    assert.strictEqual(status.error, 'LLM could not produce valid args after 2 retries');
  } finally {
    jm.close();
    cleanup(dbPath);
  }
});
