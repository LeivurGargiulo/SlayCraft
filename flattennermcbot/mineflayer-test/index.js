const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')

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

const COMMAND_PREFIX = '!bot'

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
    bot.chat('Spike bot online.')
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return // ignore self

    if (!message.startsWith(COMMAND_PREFIX)) return

    if (!WHITELIST.has(username)) {
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
          handleFlatten(bot, args)
          break
        case 'stop':
          bot.pathfinder.setGoal(null)
          bot.chat('Stopped.')
          break
        default:
          bot.chat(`Unknown command: ${cmd}. Try: goto, flatten, stop`)
      }
    } catch (err) {
      console.error('[bot] command error:', err)
      bot.chat(`Error running command: ${err.message}`)
    }
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
    console.log('[bot] reconnecting in 5s...')
    setTimeout(createBot, 5000)
  })

  return bot
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

// Naive flatten: single target Y level across a rectangle.
// Breaks anything above targetY, fills anything below it with a placeholder block
// (dirt, for the spike — inventory-aware block selection comes later).
async function handleFlatten(bot, args) {
  if (args.length !== 5) {
    bot.chat('Usage: !bot flatten <x1> <z1> <x2> <z2> <targetY>')
    return
  }
  const [x1, z1, x2, z2, targetY] = args.map(Number)
  if ([x1, z1, x2, z2, targetY].some(Number.isNaN)) {
    bot.chat('All arguments must be numbers.')
    return
  }

  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minZ = Math.min(z1, z2)
  const maxZ = Math.max(z1, z2)

  const totalColumns = (maxX - minX + 1) * (maxZ - minZ + 1)
  bot.chat(`Flattening ${totalColumns} columns to Y=${targetY}. This is a naive spike implementation — expect it to be slow.`)

  let done = 0

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      await flattenColumn(bot, x, z, targetY)
      done++
      if (done % 10 === 0) {
        bot.chat(`Progress: ${done}/${totalColumns} columns`)
      }
    }
  }

  bot.chat('Flatten complete.')
}

async function flattenColumn(bot, x, z, targetY) {
  // Walk to the column first
  const goal = new goals.GoalNear(x, targetY + 1, z, 2)
  bot.pathfinder.setGoal(goal)
  await waitForGoalReached(bot)

  // Break blocks above targetY down to targetY+1 (leave targetY as the walkable surface)
  // Scan a modest range above; adjust for your terrain's max height as needed.
  for (let y = targetY + 10; y > targetY; y--) {
    const block = bot.blockAt({ x, y, z })
    if (block && block.name !== 'air') {
      try {
        await bot.dig(block)
      } catch (err) {
        console.log(`[bot] couldn't dig at ${x},${y},${z}: ${err.message}`)
      }
    }
  }

  // NOTE: filling below targetY with a placeholder block is intentionally
  // omitted from this spike — needs inventory-aware block selection first.
  // This spike only proves the break/traverse loop.
}

function waitForGoalReached(bot) {
  return new Promise((resolve) => {
    const check = () => {
      if (!bot.pathfinder.isMoving()) {
        resolve()
      } else {
        setTimeout(check, 200)
      }
    }
    check()
  })
}

createBot()
