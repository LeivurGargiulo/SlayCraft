const COMMAND_PREFIX = '!agent';

function registerCommands(bot, { jobManager, whitelist, admins, startProcessing, jobState }) {
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    if (!message.startsWith(COMMAND_PREFIX)) return;

    if (!whitelist.has(username)) {
      bot.chat(`Sorry ${username}, you're not whitelisted for agent commands.`);
      console.log(`[agent] rejected command from non-whitelisted user: ${username}`);
      return;
    }

    const rest = message.slice(COMMAND_PREFIX.length).trim();
    const [maybeSubcommand, ...subArgs] = rest.split(/\s+/);

    console.log(`[agent] command from ${username}: ${rest}`);

    try {
      switch (maybeSubcommand) {
        case 'queue':
          handleQueue(bot, jobManager);
          break;
        case 'status':
          handleStatus(bot, subArgs, jobManager, jobState);
          break;
        case 'cancel':
          handleCancel(bot, subArgs, username, jobManager, admins);
          break;
        case 'stop':
          handleStop(bot, username, admins, jobManager, jobState);
          break;
        default:
          // Anything else is treated as a freeform task for the LLM planner,
          // not a recognized subcommand - e.g. "!agent build a stone wall 10 long".
          handleTask(bot, rest, username, jobManager, startProcessing);
      }
    } catch (err) {
      console.error('[agent] command error:', err);
      bot.chat(`Error running command: ${err.message}`);
    }
  });
}

function handleTask(bot, taskText, username, jobManager, startProcessing) {
  if (!taskText) {
    bot.chat('Usage: !agent <describe what you want built> | queue | status [id] | cancel <id> | stop');
    return;
  }
  const jobId = jobManager.insertPlanningJob(taskText, username);
  bot.chat(`Job #${jobId} queued for planning: "${taskText}"`);
  startProcessing().catch((err) => {
    console.error('[agent] job processing error:', err);
    bot.chat(`Job processing error: ${err.message}`);
  });
}

function handleQueue(bot, jobManager) {
  const queue = jobManager.getQueue();
  if (queue.length === 0) {
    bot.chat('Queue is empty.');
    return;
  }
  bot.chat(`Queue (${queue.length}):`);
  for (const job of queue) {
    bot.chat(`#${job.id} [${job.status}] by ${job.requested_by} - ${job.completed_actions}/${job.total_actions ?? '?'}`);
  }
}

function handleStatus(bot, args, jobManager, jobState) {
  let jobId;
  if (args.length >= 1 && args[0]) {
    jobId = Number(args[0]);
    if (Number.isNaN(jobId)) {
      bot.chat('Usage: !agent status [jobId]');
      return;
    }
  } else {
    jobId = jobState.currentJobId;
    if (jobId == null) {
      bot.chat('No job currently running. Usage: !agent status <jobId>');
      return;
    }
  }

  const status = jobManager.getStatus(jobId);
  if (!status) {
    bot.chat(`Job #${jobId} not found.`);
    return;
  }
  bot.chat(`Job #${status.id} [${status.status}] ${status.completed_actions}/${status.total_actions ?? '?'} actions complete`);
}

function handleCancel(bot, args, username, jobManager, admins) {
  if (args.length !== 1 || !args[0]) {
    bot.chat('Usage: !agent cancel <jobId>');
    return;
  }
  const jobId = Number(args[0]);
  if (Number.isNaN(jobId)) {
    bot.chat('Job id must be a number.');
    return;
  }

  try {
    jobManager.cancel(jobId, username, admins.has(username));
    bot.chat(`Job #${jobId} cancelled.`);
  } catch (err) {
    bot.chat(`Cannot cancel job #${jobId}: ${err.message}`);
  }
}

function handleStop(bot, username, admins, jobManager, jobState) {
  if (!admins.has(username)) {
    bot.chat(`Sorry ${username}, only admins can stop the current job.`);
    return;
  }
  if (jobState.currentJobId == null) {
    bot.chat('No job currently running.');
    return;
  }
  jobManager.markJobStatus(jobState.currentJobId, 'stopping');
  bot.chat(`Job #${jobState.currentJobId} will stop after its current action.`);
}

module.exports = { registerCommands };
