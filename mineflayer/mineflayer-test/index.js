const path = require('path')
const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const JobManager = require('./src/db')
const ExecutionEngine = require('./src/executionEngine')
const { registerCommands } = require('./src/commands')

// ---- CONFIG ----
const HOST = 'localhost'
const PORT = 25564
const MC_VERSION = '1.21.11'
const AUTH = 'microsoft' // spare account will OAuth device-code on first run
const BOT_USERNAME = 'BjornViking206' // <-- fill in

// Whitelist: only these in-game usernames can issue bot commands
const WHITELIST = new Set([
  'SlayerL99' // <-- fill in your real in-game name
])

// Admins: subset of WHITELIST allowed to cancel others' jobs and !bot stop
const ADMINS = new Set([
  'SlayerL99'
])

const DB_PATH = path.join(__dirname, 'jobs.db')

// ---- DEBUG LOGGING ----
// Set to true to see every packet in/out, plus keepalive timing.
// This is noisy — only turn on while actively diagnosing a connection issue.
const DEBUG_PACKETS = false

// Track keepalive timing so we can see exactly how long it's been since the
// last packet of any kind, right up until the timeout fires.
let lastPacketTime = Date.now()
let lastKeepAliveReceived = null
let lastKeepAliveResponded = null

function createBot() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: BOT_USERNAME,
    auth: AUTH,
    version: MC_VERSION,
    // Server runs the `packetfixer` mod with keepAliveTimeout=120 (seconds) in
    // config/packetfixer.properties, so it only sends a keep_alive roughly
    // every 120s instead of vanilla's 15s. node-minecraft-protocol's client
    // watchdog defaults to a fixed 30s and doesn't adapt to the server's
    // actual cadence, so it always fires first. Match it with margin.
    checkTimeoutInterval: 150000
  })

  bot.loadPlugin(pathfinder)

  const jobManager = new JobManager(DB_PATH)
  const executionEngine = new ExecutionEngine(bot, jobManager)

  // Shared with commands.js: which job is currently running, for `!bot
  // status` with no id and as the target of `!bot stop` (which sets the
  // job's own status to 'stopping' via jobManager - ExecutionEngine.runJob
  // checks for that between actions and exits early).
  const jobState = { currentJobId: null }

  let processing = false

  // Pops and runs queued jobs one at a time (FIFO) until the queue is empty.
  // No-ops if a drain is already in flight, so it's safe to call from every
  // command that might need to kick a stalled queue.
  async function startProcessing() {
    if (processing) return
    processing = true
    try {
      let job = jobManager.getNextQueuedJob()
      while (job) {
        jobManager.markRunning(job.id)
        jobState.currentJobId = job.id
        try {
          await executionEngine.runJob(job.id)
        } catch (err) {
          console.error(`[bot] job ${job.id} crashed:`, err)
          jobManager.markJobStatus(job.id, 'failed')
        }
        jobState.currentJobId = null
        job = jobManager.getNextQueuedJob()
      }
    } finally {
      processing = false
    }
  }

  if (DEBUG_PACKETS) {
    // Log every raw packet the client receives, with a running "time since
    // last packet" so we can see if things go quiet before the timeout.
    bot._client.on('packet', (data, meta) => {
      const now = Date.now()
      const gap = now - lastPacketTime
      lastPacketTime = now

      if (meta.name === 'keep_alive') {
        lastKeepAliveReceived = now
        console.log(`[packet:IN] keep_alive id=${data.keepAliveId} (gap since last packet: ${gap}ms)`)
      } else if (gap > 2000) {
        // Flag any packet that came in after a suspiciously long silence —
        // useful for spotting exactly where things start stalling.
        console.log(`[packet:IN] ${meta.name} (gap since last packet: ${gap}ms) <-- long gap`)
      } else {
        // Comment this out if it's too noisy; useful for the first run.
        console.log(`[packet:IN] ${meta.name}`)
      }
    })

    // Log outgoing packets too, especially our own keep_alive responses.
    bot._client.on('writePacket', (name, params) => {
      if (name === 'keep_alive') {
        lastKeepAliveResponded = Date.now()
        console.log(`[packet:OUT] keep_alive id=${params.keepAliveId}`)
      }
    })

    // Catch-all: log unrecognized/unparsed packet warnings if the protocol
    // parser hits something it doesn't understand from a mod's custom
    // packets or plugin channel.
    bot._client.on('parse_warning' ,(warning) => {
      console.log('[packet:PARSE_WARNING]', warning)
    })

    // Plugin channel (custom mod packet) traffic — this is often where
    // Fabric mods send data mineflayer has no schema for.
    bot._client.on('custom_payload', (data) => {
      console.log(`[packet:CUSTOM_PAYLOAD] channel=${data.channel} dataLength=${data.data ? data.data.length : 'n/a'}`)
    })

    // Periodically report silence duration so you can watch the countdown
    // to the 30s timeout in real time.
    setInterval(() => {
      const silentFor = Date.now() - lastPacketTime
      if (silentFor > 5000) {
        console.log(`[debug] no packets received in ${silentFor}ms (timeout fires at 30000ms)`)
      }
    }, 5000)
  }

  bot.once('spawn', () => {
    console.log('[bot] spawned in world')
    const defaultMove = new Movements(bot)
    bot.pathfinder.setMovements(defaultMove)
    bot.chat('Flatten bot online.')

    // Crash-resume: anything left 'running' from an unclean shutdown gets
    // requeued before the drain loop starts.
    const interrupted = jobManager.getInterruptedJobs()
    for (const job of interrupted) {
      console.log(`[bot] requeuing interrupted job #${job.id}`)
      jobManager.markJobStatus(job.id, 'queued')
    }

    startProcessing().catch((err) => console.error('[bot] job processing error:', err))
  })

  registerCommands(bot, {
    jobManager,
    whitelist: WHITELIST,
    admins: ADMINS,
    startProcessing,
    jobState
  })

  bot.on('kicked', (reason) => console.log('[bot] kicked:', reason))
  bot.on('error', (err) => {
    console.log('[bot] error:', err.message)
    console.log(`[bot] time since last packet when error fired: ${Date.now() - lastPacketTime}ms`)
    if (lastKeepAliveReceived) {
      console.log(`[bot] last keep_alive received ${Date.now() - lastKeepAliveReceived}ms ago`)
    }
    if (lastKeepAliveResponded) {
      console.log(`[bot] last keep_alive WE sent ${Date.now() - lastKeepAliveResponded}ms ago`)
    }
  })
  bot.on('end', (reason) => {
    console.log('[bot] disconnected, reason:', reason)
    jobManager.close()
    console.log('[bot] reconnecting in 5s...')
    setTimeout(createBot, 5000)
  })

  return bot
}

createBot()
