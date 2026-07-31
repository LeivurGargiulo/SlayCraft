# Mineflayer Spike

Quick spike to test: can a mineflayer bot connect to the modded-but-bypassed
server, respond to whitelisted chat commands, and do basic pathing + block
breaking.

## Setup

1. **Run this on the machine that can reach `localhost:25544`** — i.e. your
   own machine, next to the server. This won't work from a sandboxed
   environment that can't see your localhost.

2. Install dependencies:
   ```
   npm install
   ```

3. Edit `index.js`:
   - Set `BOT_USERNAME` to your spare Microsoft account's email or the
     display tag it uses (mineflayer will trigger a device-code OAuth flow
     on first launch — you'll get a URL + code to enter, one time, then it
     caches a token in `.minecraft` folder / `nmp-cache` locally).
   - Add your real in-game username to `WHITELIST`.

4. Run:
   ```
   node index.js
   ```

5. First run will print an OAuth URL + code in the terminal. Open it, log
   in with the spare account, enter the code. After that it should cache
   credentials and auto-login on future runs.

6. In Minecraft, from your whitelisted account, try:
   ```
   !bot goto 100 64 200
   !bot flatten 100 100 120 120 64
   !bot stop
   ```

## What this spike proves / doesn't prove

**Proves:**
- Bot can connect at all given the server-side mod-check bypass
- Chat command parsing + whitelist gating works
- Basic pathfinding feel (GoalBlock / GoalNear) for a real player-scale bot
- Block breaking via `bot.dig()` works against your server's actual block set

**Does NOT yet do:**
- Filling blocks below target height (needs inventory-aware block selection)
- Any schematic parsing/building
- Any job queue / resumability if it crashes mid-task
- Any real error recovery beyond basic reconnect

## What to actually evaluate while testing

- Does the pathing look/feel reasonably "player-like," or janky enough that
  you want to swap in `@miner-org/mineflayer-baritone` or hand-tune
  `Movements` settings?
- Does `bot.dig()` timing feel acceptable at scale, or is naive one-at-a-time
  breaking going to be painfully slow for big flatten jobs (likely — this is
  the thing to time and decide if it's a dealbreaker)?
- Does the server's bypass mod hold up under sustained bot activity (lots of
  block break/place packets in a row), or does anything about your bypass
  assume more "normal" client behavior patterns?
