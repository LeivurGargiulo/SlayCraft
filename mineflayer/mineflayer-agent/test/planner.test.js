const test = require('node:test');
const assert = require('node:assert');
const { planJob } = require('../src/planner');
const { registerTool } = require('../src/tools/index');

registerTool({
  name: 'planner_test_tool',
  description: 'test tool',
  argsSchema: {
    type: 'object',
    properties: { n: { type: 'integer', minimum: 1 } },
    required: ['n'],
    additionalProperties: false
  },
  compile: (args) => [{ action: 'place', x: args.n, y: 0, z: 0, block_type: 'stone' }]
});

function fakeJobManager(jobRow) {
  const calls = { attachPlan: null, markPlanningFailed: null };
  return {
    calls,
    getNextPlanningJob: () => jobRow,
    attachPlan: (jobId, toolName, argsJson, actions) => { calls.attachPlan = { jobId, toolName, argsJson, actions }; },
    markPlanningFailed: (jobId, error) => { calls.markPlanningFailed = { jobId, error }; }
  };
}

test('planJob attaches a plan when the provider returns valid args on the first try', async () => {
  const jm = fakeJobManager({ id: 1, task_text: 'place a block', requested_by: 'alice' });
  const provider = { plan: async () => ({ tool: 'planner_test_tool', args: { n: 5 } }) };

  const processed = await planJob(jm, provider, {});
  assert.strictEqual(processed, true);
  assert.strictEqual(jm.calls.attachPlan.jobId, 1);
  assert.strictEqual(jm.calls.attachPlan.toolName, 'planner_test_tool');
  assert.strictEqual(jm.calls.attachPlan.actions.length, 1);
  assert.strictEqual(jm.calls.markPlanningFailed, null);
});

test('planJob retries on invalid args, then succeeds', async () => {
  const jm = fakeJobManager({ id: 2, task_text: 'place a block', requested_by: 'alice' });
  let calls = 0;
  const provider = {
    plan: async () => {
      calls++;
      return calls === 1 ? { tool: 'planner_test_tool', args: { n: -1 } } : { tool: 'planner_test_tool', args: { n: 5 } };
    }
  };

  const processed = await planJob(jm, provider, {});
  assert.strictEqual(processed, true);
  assert.strictEqual(calls, 2);
  assert.ok(jm.calls.attachPlan);
});

test('planJob fails the job after exhausting retries on invalid args', async () => {
  const jm = fakeJobManager({ id: 3, task_text: 'place a block', requested_by: 'alice' });
  const provider = { plan: async () => ({ tool: 'planner_test_tool', args: { n: -1 } }) };

  const processed = await planJob(jm, provider, {});
  assert.strictEqual(processed, true);
  assert.strictEqual(jm.calls.attachPlan, null);
  assert.strictEqual(jm.calls.markPlanningFailed.jobId, 3);
  assert.ok(jm.calls.markPlanningFailed.error.length > 0);
});

test('planJob fails the job immediately when the provider returns an unknown tool name', async () => {
  const jm = fakeJobManager({ id: 4, task_text: 'do something odd', requested_by: 'alice' });
  const provider = { plan: async () => ({ tool: 'no_such_tool', args: {} }) };

  await planJob(jm, provider, {});
  assert.ok(jm.calls.markPlanningFailed);
  assert.match(jm.calls.markPlanningFailed.error, /no_such_tool/);
});

test('planJob returns false when there is no planning job', async () => {
  const jm = fakeJobManager(undefined);
  const provider = { plan: async () => { throw new Error('should not be called'); } };
  const processed = await planJob(jm, provider, {});
  assert.strictEqual(processed, false);
});
