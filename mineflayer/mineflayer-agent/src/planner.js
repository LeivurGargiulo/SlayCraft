const { getTool, validateArgs, getAllSchemas } = require('./tools/index');

const MAX_PLAN_ATTEMPTS = 3; // 1 initial + 2 retries, per the global constraint

async function planJob(jobManager, provider, worldContext) {
  const job = jobManager.getNextPlanningJob();
  if (!job) return false;

  const toolSchemas = getAllSchemas();
  let lastError = 'unknown planning error';

  for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt++) {
    try {
      const result = await provider.plan(job.task_text, worldContext, toolSchemas);

      if (result.error) {
        lastError = result.error;
        continue;
      }

      const tool = getTool(result.tool);
      if (!tool) {
        // Unknown tool name is not a retryable schema mistake - fail fast.
        jobManager.markPlanningFailed(job.id, `LLM chose an unknown tool: "${result.tool}"`);
        return true;
      }

      const validation = validateArgs(result.tool, result.args);
      if (!validation.valid) {
        lastError = `invalid args for ${result.tool}: ${validation.errors}`;
        continue;
      }

      const actions = await tool.compile(result.args, worldContext);
      jobManager.attachPlan(job.id, result.tool, JSON.stringify(result.args), actions);
      return true;
    } catch (err) {
      lastError = err.message || String(err);
    }
  }

  jobManager.markPlanningFailed(job.id, `failed to produce a valid plan after ${MAX_PLAN_ATTEMPTS} attempts: ${lastError}`);
  return true;
}

module.exports = { planJob, MAX_PLAN_ATTEMPTS };
