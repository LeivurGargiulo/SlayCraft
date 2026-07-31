const test = require('node:test');
const assert = require('node:assert');
const JobManager = require('../src/db.js');

// Test helper to create a fresh in-memory database for each test
function createTestDb() {
  return new JobManager(':memory:');
}

test('enqueue and getQueue', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{"x":0,"y":64,"z":0}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'break', x: 1, y: 65, z: 0 },
  ]);

  assert.ok(jobId > 0, 'enqueue should return a positive job ID');

  const queue = db.getQueue();
  assert.strictEqual(queue.length, 1, 'queue should have one job');
  assert.strictEqual(queue[0].id, jobId, 'job id should match');
  assert.strictEqual(queue[0].type, 'flatten', 'job type should be flatten');
  assert.strictEqual(queue[0].requested_by, 'player1', 'requested_by should match');
  assert.strictEqual(queue[0].status, 'queued', 'job status should be queued');
  assert.strictEqual(queue[0].total_actions, 2, 'total_actions should match action count');
  assert.strictEqual(queue[0].completed_actions, 0, 'completed_actions should be 0');
  assert.ok(queue[0].created_at > 0, 'created_at should be set');
  assert.ok(queue[0].updated_at > 0, 'updated_at should be set');

  db.close();
});

test('enqueue creates job_actions in sequence', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'place', x: 0, y: 60, z: 0, block_type: 'stone' },
  ]);

  const pendingActions = db.getPendingActions(jobId);
  assert.strictEqual(pendingActions.length, 2, 'should have 2 pending actions');
  assert.strictEqual(pendingActions[0].seq, 0, 'first action seq should be 0');
  assert.strictEqual(pendingActions[0].action, 'break', 'first action should be break');
  assert.strictEqual(pendingActions[0].x, 0, 'first action x should match');
  assert.strictEqual(pendingActions[0].y, 65, 'first action y should match');
  assert.strictEqual(pendingActions[0].z, 0, 'first action z should match');
  assert.strictEqual(pendingActions[0].block_type, null, 'break action block_type should be null');
  assert.strictEqual(pendingActions[0].status, 'pending', 'action status should be pending');

  assert.strictEqual(pendingActions[1].seq, 1, 'second action seq should be 1');
  assert.strictEqual(pendingActions[1].action, 'place', 'second action should be place');
  assert.strictEqual(pendingActions[1].block_type, 'stone', 'place action block_type should match');

  db.close();
});

test('markRunning updates job status', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', []);
  db.markRunning(jobId);

  const job = db.getStatus(jobId);
  assert.strictEqual(job.status, 'running', 'job status should be running');

  db.close();
});

test('getInterruptedJobs returns jobs with running status', async (t) => {
  const db = createTestDb();

  const jobId1 = db.enqueue('flatten', 'player1', '{}', []);
  const jobId2 = db.enqueue('flatten', 'player2', '{}', []);

  // Mark first job as running
  db.markRunning(jobId1);

  const interrupted = db.getInterruptedJobs();
  assert.strictEqual(interrupted.length, 1, 'should have 1 interrupted job');
  assert.strictEqual(interrupted[0].id, jobId1, 'interrupted job id should match');
  assert.strictEqual(interrupted[0].status, 'running', 'interrupted job status should be running');

  db.close();
});

test('markActionDone updates action status', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'break', x: 1, y: 65, z: 0 },
  ]);

  db.markActionDone(jobId, 0);

  const doneActions = db.getDoneActions(jobId);
  assert.strictEqual(doneActions.length, 1, 'should have 1 done action');
  assert.strictEqual(doneActions[0].seq, 0, 'done action seq should be 0');
  assert.strictEqual(doneActions[0].status, 'done', 'done action status should be done');

  const pendingActions = db.getPendingActions(jobId);
  assert.strictEqual(pendingActions.length, 1, 'should have 1 pending action');
  assert.strictEqual(pendingActions[0].seq, 1, 'pending action seq should be 1');

  db.close();
});

test('markActionFailed sets error message', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
  ]);

  db.markActionFailed(jobId, 0, 'block is bedrock');

  const job = db.getStatus(jobId);
  const doneActions = db.getDoneActions(jobId);
  assert.strictEqual(doneActions.length, 0, 'failed action should not be in done actions');

  // Get all actions to check failed
  const allActions = db.db.prepare('SELECT * FROM job_actions WHERE job_id = ?').all(jobId);
  assert.strictEqual(allActions.length, 1, 'should have 1 action');
  assert.strictEqual(allActions[0].status, 'failed', 'action status should be failed');
  assert.strictEqual(allActions[0].error, 'block is bedrock', 'error message should match');

  db.close();
});

test('getDoneActions and getPendingActions filter correctly', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
    { action: 'break', x: 1, y: 65, z: 0 },
    { action: 'break', x: 2, y: 65, z: 0 },
  ]);

  db.markActionDone(jobId, 0);
  db.markActionDone(jobId, 2);

  const doneActions = db.getDoneActions(jobId);
  const pendingActions = db.getPendingActions(jobId);

  assert.strictEqual(doneActions.length, 2, 'should have 2 done actions');
  assert.strictEqual(pendingActions.length, 1, 'should have 1 pending action');
  assert.strictEqual(pendingActions[0].seq, 1, 'pending action should be seq 1');

  db.close();
});

test('cancel allows owner to cancel', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', []);
  db.cancel(jobId, 'player1', false);

  const job = db.getStatus(jobId);
  assert.strictEqual(job.status, 'cancelled', 'job status should be cancelled');

  db.close();
});

test('cancel allows admin to cancel anyone job', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', []);
  db.cancel(jobId, 'player2', true);

  const job = db.getStatus(jobId);
  assert.strictEqual(job.status, 'cancelled', 'job status should be cancelled');

  db.close();
});

test('cancel denies non-owner, non-admin', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', []);

  assert.throws(
    () => db.cancel(jobId, 'player2', false),
    /Permission denied/,
    'should throw permission error'
  );

  const job = db.getStatus(jobId);
  assert.strictEqual(job.status, 'queued', 'job status should still be queued');

  db.close();
});

test('cancel throws on non-existent job', async (t) => {
  const db = createTestDb();

  assert.throws(
    () => db.cancel(999, 'player1', false),
    /not found/,
    'should throw not found error'
  );

  db.close();
});

test('getNextQueuedJob returns first queued job', async (t) => {
  const db = createTestDb();

  const jobId1 = db.enqueue('flatten', 'player1', '{}', []);
  const jobId2 = db.enqueue('flatten', 'player2', '{}', []);

  db.markRunning(jobId1);

  const next = db.getNextQueuedJob();
  assert.strictEqual(next.id, jobId2, 'next queued job should be jobId2');
  assert.strictEqual(next.status, 'queued', 'job status should be queued');

  db.close();
});

test('getNextQueuedJob returns null when no queued jobs', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', []);
  db.markRunning(jobId);

  const next = db.getNextQueuedJob();
  assert.strictEqual(next, undefined, 'should return undefined when no queued jobs');

  db.close();
});

test('markJobStatus updates job status', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', []);
  db.markJobStatus(jobId, 'paused');

  const job = db.getStatus(jobId);
  assert.strictEqual(job.status, 'paused', 'job status should be paused');

  db.close();
});

test('getStatus returns full job record', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{"x":0,"y":64,"z":0}', [
    { action: 'break', x: 0, y: 65, z: 0 },
  ]);

  const job = db.getStatus(jobId);
  assert.ok(job, 'job should exist');
  assert.strictEqual(job.id, jobId, 'id should match');
  assert.strictEqual(job.type, 'flatten', 'type should match');
  assert.strictEqual(job.requested_by, 'player1', 'requested_by should match');
  assert.strictEqual(job.status, 'queued', 'status should be queued');
  assert.strictEqual(job.params_json, '{"x":0,"y":64,"z":0}', 'params_json should match');
  assert.strictEqual(job.total_actions, 1, 'total_actions should match');
  assert.strictEqual(job.completed_actions, 0, 'completed_actions should be 0');

  db.close();
});

test('getQueue includes queued, running, and paused jobs in created_at order', async (t) => {
  const db = createTestDb();

  const jobId1 = db.enqueue('flatten', 'player1', '{}', []);
  const jobId2 = db.enqueue('flatten', 'player2', '{}', []);
  const jobId3 = db.enqueue('flatten', 'player3', '{}', []);

  db.markRunning(jobId2);
  db.markJobStatus(jobId3, 'paused');

  const queue = db.getQueue();
  assert.strictEqual(queue.length, 3, 'queue should have 3 jobs');
  assert.strictEqual(queue[0].id, jobId1, 'first job should be jobId1');
  assert.strictEqual(queue[1].id, jobId2, 'second job should be jobId2');
  assert.strictEqual(queue[2].id, jobId3, 'third job should be jobId3');

  db.close();
});

test('enqueue transaction rolls back on error', async (t) => {
  const db = createTestDb();

  // This should fail because we're missing required fields
  assert.throws(
    () => {
      db.enqueue('flatten', 'player1', '{}', [
        { action: 'break', x: 0, z: 0 }, // missing y
      ]);
    },
    'enqueue should throw on invalid action'
  );

  const queue = db.getQueue();
  assert.strictEqual(queue.length, 0, 'no job should be created on transaction error');

  db.close();
});

test('database persistence across method calls', async (t) => {
  const db = createTestDb();

  const jobId = db.enqueue('flatten', 'player1', '{}', [
    { action: 'break', x: 0, y: 65, z: 0 },
  ]);

  db.markRunning(jobId);
  db.markActionDone(jobId, 0);

  // Verify state is persisted
  const job = db.getStatus(jobId);
  assert.strictEqual(job.status, 'running', 'job status should be running');

  const doneActions = db.getDoneActions(jobId);
  assert.strictEqual(doneActions.length, 1, 'should have 1 done action');

  db.close();
});
