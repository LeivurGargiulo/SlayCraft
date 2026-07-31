const { goals } = require('mineflayer-pathfinder')
const { compileFlatten } = require('./flattenCompiler')

const COMMAND_PREFIX = '!bot'

// compileFlatten scans the whole region synchronously, so an unbounded region
// blocks the event loop long enough for the server to keepalive-kick us.
// 10000 columns = a 100x100 area, ~200k actions worst case.
const MAX_REGION_COLUMNS = 10000

/**
 * Attaches the whitelisted chat-command dispatcher to `bot`.
 *
 * @param {Object} bot - mineflayer bot instance
 * @param {Object} deps
 * @param {import('./db')} deps.jobManager
 * @param {Set<string>} deps.whitelist - usernames allowed to issue any command
 * @param {Set<string>} deps.admins - usernames allowed to cancel others' jobs / stop
 * @param {() => Promise<void>} deps.startProcessing - kicks the FIFO queue-drain loop if idle
 * @param {{currentJobId: number|null}} deps.jobState - shared mutable state
 *   written by index.js's drain loop, read here (for status/stop's default job).
 */
function registerCommands(bot, { jobManager, whitelist, admins, startProcessing, jobState }) {
  bot.on('chat', (username, message) => {
    if (username === bot.username) return // ignore self

    if (!message.startsWith(COMMAND_PREFIX)) return

    if (!whitelist.has(username)) {
      bot.chat(`Sorry ${username}, you're not whitelisted for bot commands.`)
      console.log(`[bot] rejected command from non-whitelisted user: ${username}`)
      return
    }

    const args = message.slice(COMMAND_PREFIX.length).trim().split(/\s+/)
    const cmd = args.shift()

    console.log(`[bot] command from ${username}: ${cmd} ${args.join(' ')}`)

    try {
      switch (cmd) {
        case 'goto':
          handleGoto(bot, args)
          break
        case 'flatten':
          handleFlatten(bot, args, username, jobManager, startProcessing)
          break
        case 'queue':
          handleQueue(bot, jobManager)
          break
        case 'status':
          handleStatus(bot, args, jobManager, jobState)
          break
        case 'cancel':
          handleCancel(bot, args, username, jobManager, admins)
          break
        case 'stop':
          handleStop(bot, username, admins, jobManager, jobState)
          break
        default:
          bot.chat(`Unknown command: ${cmd}. Try: goto, flatten, queue, status, cancel, stop`)
      }
    } catch (err) {
      console.error('[bot] command error:', err)
      bot.chat(`Error running command: ${err.message}`)
    }
  })
}

function handleGoto(bot, args) {
  if (args.length !== 3) {
    bot.chat('Usage: !bot goto <x> <y> <z>')
    return
  }
  const [x, y, z] = args.map(Number)
  if ([x, y, z].some(Number.isNaN)) {
    bot.chat('Coordinates must be numbers.')
    return
  }
  bot.chat(`Heading to ${x}, ${y}, ${z}...`)
  const goal = new goals.GoalBlock(x, y, z)
  bot.pathfinder.setGoal(goal)
}

function handleFlatten(bot, args, username, jobManager, startProcessing) {
  if (args.length !== 5) {
    bot.chat('Usage: !bot flatten <x1> <z1> <x2> <z2> <targetY>')
    return
  }
  const [x1, z1, x2, z2, targetY] = args.map(Number)
  if ([x1, z1, x2, z2, targetY].some(Number.isNaN)) {
    bot.chat('All arguments must be numbers.')
    return
  }

  const columns = (Math.abs(x2 - x1) + 1) * (Math.abs(z2 - z1) + 1)
  if (columns > MAX_REGION_COLUMNS) {
    bot.chat(`Region too large: ${columns} columns (max ${MAX_REGION_COLUMNS}). Split it into smaller jobs.`)
    return
  }

  const params = { x1, z1, x2, z2, targetY }
  const compiled = compileFlatten(bot, params)
  // compileFlatten returns {action, pos: {x,y,z}, blockType?}; JobManager.enqueue
  // (and its job_actions schema) wants flat x/y/z + block_type per action.
  const actions = compiled.map((a) => ({
    action: a.action,
    x: a.pos.x,
    y: a.pos.y,
    z: a.pos.z,
    block_type: a.blockType || null
  }))

  const jobId = jobManager.enqueue('flatten', username, JSON.stringify(params), actions)
  bot.chat(`Flatten job #${jobId} queued (${actions.length} actions).`)

  startProcessing().catch((err) => {
    console.error('[bot] job processing error:', err)
    bot.chat(`Job processing error: ${err.message}`)
  })
}

function handleQueue(bot, jobManager) {
  const queue = jobManager.getQueue()
  if (queue.length === 0) {
    bot.chat('Queue is empty.')
    return
  }
  bot.chat(`Queue (${queue.length}):`)
  for (const job of queue) {
    bot.chat(`#${job.id} [${job.status}] ${job.type} by ${job.requested_by} - ${job.completed_actions}/${job.total_actions}`)
  }
}

function handleStatus(bot, args, jobManager, jobState) {
  let jobId
  if (args.length >= 1) {
    jobId = Number(args[0])
    if (Number.isNaN(jobId)) {
      bot.chat('Usage: !bot status [jobId]')
      return
    }
  } else {
    jobId = jobState.currentJobId
    if (jobId == null) {
      bot.chat('No job currently running. Usage: !bot status <jobId>')
      return
    }
  }

  const status = jobManager.getStatus(jobId)
  if (!status) {
    bot.chat(`Job #${jobId} not found.`)
    return
  }
  bot.chat(`Job #${status.id} [${status.status}] ${status.completed_actions}/${status.total_actions} actions complete`)
}

function handleCancel(bot, args, username, jobManager, admins) {
  if (args.length !== 1) {
    bot.chat('Usage: !bot cancel <jobId>')
    return
  }
  const jobId = Number(args[0])
  if (Number.isNaN(jobId)) {
    bot.chat('Job id must be a number.')
    return
  }

  // JobManager.cancel is the single source of truth for the owner-or-admin
  // permission check (throws with a descriptive message otherwise) - no need
  // to duplicate that check here.
  try {
    jobManager.cancel(jobId, username, admins.has(username))
    bot.chat(`Job #${jobId} cancelled.`)
  } catch (err) {
    bot.chat(`Cannot cancel job #${jobId}: ${err.message}`)
  }
}

function handleStop(bot, username, admins, jobManager, jobState) {
  if (!admins.has(username)) {
    bot.chat(`Sorry ${username}, only admins can stop the current job.`)
    return
  }
  if (jobState.currentJobId == null) {
    bot.chat('No job currently running.')
    return
  }
  // ExecutionEngine.runJob checks the job's own status between actions and
  // exits (marking the job 'cancelled') once it sees 'stopping' - see
  // executionEngine.js's runJob loop.
  jobManager.markJobStatus(jobState.currentJobId, 'stopping')
  bot.chat(`Job #${jobState.currentJobId} will stop after its current action.`)
}

module.exports = { registerCommands, MAX_REGION_COLUMNS }
