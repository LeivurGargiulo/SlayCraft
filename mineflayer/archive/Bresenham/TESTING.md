# Bresenham Bot - Testing Guide

Step-by-step procedures for verifying the Bresenham Bot mod works correctly in a live Minecraft environment. Each test section is self-contained with setup, steps, and expected results.

---

## Table of Contents

1. [Environment Setup](#1-environment-setup)
2. [Build Verification](#2-build-verification)
3. [Mod Loading Test](#3-mod-loading-test)
4. [Bot Lifecycle Tests](#4-bot-lifecycle-tests)
5. [Task System Tests](#5-task-system-tests)
6. [Reactive System Tests](#6-reactive-system-tests)
7. [Task Priority & Interruption Tests](#7-task-priority--interruption-tests)
8. [Dependency Planner Tests](#8-dependency-planner-tests)
9. [Persistence Tests](#9-persistence-tests)
10. [AI Advisory Tests](#10-ai-advisory-tests)
11. [Edge Cases & Error Handling](#11-edge-cases--error-handling)
12. [Performance Tests](#12-performance-tests)
13. [Multi-Player Tests](#13-multi-player-tests)
14. [Test Checklist](#14-test-checklist)

---

## 1. Environment Setup

### Required Software

| Software | Version | Download |
|----------|---------|----------|
| Java JDK | 21+ | [adoptium.net](https://adoptium.net/) |
| Minecraft | 1.21.4 | Minecraft Launcher |
| Fabric Loader | 0.16.10+ | [fabricmc.net](https://fabricmc.net/use/installer/) |
| Fabric API | 0.114.0+1.21.4 | [modrinth.com](https://modrinth.com/mod/fabric-api) |

### Test World Setup

Create a dedicated test world with these settings for reproducible testing:

```
World Type: Superflat
  Preset: Overworld (default flat)
Game Mode: Creative (for setup), then switch to Survival for tests
Cheats: Enabled
Difficulty: Normal (needed for hostile mob tests)
```

### Useful Setup Commands

Run these in-game to prepare the test environment:

```
/gamemode survival                          <- switch to survival for bot testing
/gamerule doDaylightCycle false             <- freeze time
/time set day                               <- ensure daytime
/gamerule doWeatherCycle false              <- no rain
/gamerule keepInventory true                <- safety net during testing
/difficulty normal                          <- needed for hostile mobs
```

---

## 2. Build Verification

### Test 2.1: Clean Build

**Steps:**
```bash
cd bresenham
./gradlew clean build
```

**Expected:**
- Output: `BUILD SUCCESSFUL`
- JAR created at `build/libs/bresenham-bot-0.1.0.jar`
- No compilation errors or warnings

### Test 2.2: JAR Contents

**Steps:**
```bash
jar tf build/libs/bresenham-bot-0.1.0.jar | grep -E "\.class$" | head -20
```

**Expected:**
- Contains `com/bresenham/bot/BresenhamMod.class`
- Contains classes for all packages: `ai/`, `api/`, `command/`, `controller/`, `executor/`, `persistence/`, `planner/`, `reactive/`, `state/`, `task/`

---

## 3. Mod Loading Test

### Test 3.1: Mod Appears in Mod List

**Steps:**
1. Install the mod JAR and Fabric API into `.minecraft/mods/`.
2. Launch Minecraft with the Fabric profile.
3. On the title screen, click "Mods".

**Expected:**
- "Bresenham Bot" appears in the mod list.
- Description shows: "A deterministic, autonomous Minecraft bot system with Gemini AI advisory layer"

### Test 3.2: Initialization Logs

**Steps:**
1. Start a singleplayer world.
2. Open `.minecraft/logs/latest.log`.
3. Search for `[Bresenham]`.

**Expected log messages:**
```
[Bresenham] Initializing Bresenham Bot System...
[Bresenham] Baritone not found, using vanilla fallback.    <- (or "Baritone detected" if installed)
[Bresenham] Gemini AI advisor initialized...               <- (or "not configured" if no API key)
[Bresenham] Bresenham Bot System initialized successfully.
[Bresenham] Registered tasks: [mine_iron, craft_pickaxe]
[Bresenham] Registered reactive rules: [tool_break, low_health, enemy_nearby]
```

### Test 3.3: Config File Generation

**Steps:**
1. Delete `config/bresenham/` if it exists.
2. Start a world.
3. Check `config/bresenham/gemini.json`.

**Expected:**
- File exists with default values:
  ```json
  {
    "apiKey": "",
    "modelName": "gemini-2.5-flash",
    "enabled": false,
    "temperature": 0.7,
    "maxTokens": 256,
    "confidenceThreshold": 0.5
  }
  ```

---

## 4. Bot Lifecycle Tests

### Test 4.1: Start Bot

**Steps:**
1. Open chat, type: `/bot start`

**Expected:**
- Chat message: `Bot started for <your_username>.`
- Log: `[Bresenham] Bot controller started`

### Test 4.2: Check Status (Idle)

**Steps:**
1. Start the bot.
2. Type: `/bot status`

**Expected:**
- Message: `Bot: RUNNING | No active task | Tasks in queue: 0 | Health: 20.0`

### Test 4.3: Stop Bot

**Steps:**
1. Start the bot.
2. Type: `/bot stop`

**Expected:**
- Chat message: `Bot stopped.`
- Log: `[Bresenham] Bot controller stopped`
- `/bot status` shows: `Bot: STOPPED`

### Test 4.4: Start/Stop/Start Cycle

**Steps:**
1. `/bot start`
2. `/bot stop`
3. `/bot start`

**Expected:**
- No errors. Bot restarts cleanly each time.
- Log shows alternating started/stopped messages.

---

## 5. Task System Tests

### Test 5.1: Start Mine Iron Task

**Setup:**
```
/gamemode creative
```
Place iron ore blocks within 16 blocks of the player.
Give yourself a pickaxe:
```
/give @s stone_pickaxe
/gamemode survival
```

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`

**Expected:**
- Chat: `Task 'mine_iron' started.`
- `/bot status` shows: `Task: mine_iron [RUNNING] Step: 1/1`
- Log: `[Bresenham] Task 'mine_iron' pushed (priority: MEDIUM)`
- Log shows scanning for iron ore, then dynamically adding move + mine steps.

### Test 5.2: Mine Iron - No Ore Nearby

**Setup:** Flat world with no iron ore within 16 blocks.

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`

**Expected:**
- Scan step completes without finding ore.
- Task completes (no move/mine steps added).
- Log: `[Bresenham] Task 'mine_iron' completed all steps.`

### Test 5.3: Craft Pickaxe Task

**Setup:**
```
/give @s oak_planks 4
/give @s cobblestone 3
```

**Steps:**
1. `/bot start`
2. `/bot task craft_pickaxe`

**Expected:**
- Task pushes with HIGH priority.
- Steps execute: craft planks -> craft sticks -> craft pickaxe.
- Task completes after ~60 ticks (3 crafting steps x 20 ticks each).

### Test 5.4: Pause and Resume Task

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`
3. Wait 1 second.
4. `/bot pause`
5. `/bot status` - note step number.
6. Wait 5 seconds.
7. `/bot resume`
8. `/bot status` - verify step number hasn't changed during pause.

**Expected:**
- Pause: task state changes to PAUSED, step index frozen.
- Resume: task state returns to RUNNING, continues from same step.

### Test 5.5: Unknown Task Name

**Steps:**
1. `/bot start`
2. `/bot task nonexistent_task`

**Expected:**
- Chat: `Unknown task: nonexistent_task. Available: [mine_iron, craft_pickaxe]`

---

## 6. Reactive System Tests

### Test 6.1: Low Health - Eat Food

**Setup:**
```
/give @s cooked_beef 5
```

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`
3. Damage yourself to below 3 hearts:
   ```
   /damage @s 15
   ```
4. Watch the logs.

**Expected:**
- Log: `[Bresenham] Reactive rule 'low_health' triggered! Creating task 'eat_food'.`
- Current task is paused.
- Eat food task runs (selects food, waits ~2 seconds).
- After eating, the eat task completes and mine_iron resumes.
- Cooldown: rule won't re-trigger for 10 seconds.

### Test 6.2: Low Health - No Food

**Setup:** Empty inventory (no food items).

**Steps:**
1. `/bot start`
2. `/damage @s 15`

**Expected:**
- Rule does NOT trigger (condition checks `hasFood()` - returns false with no food).
- No eat_food task created.

### Test 6.3: Enemy Nearby - Flee

**Setup:**
```
/gamerule doMobSpawning false     <- control mob spawning
```

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`
3. Summon a zombie near the player:
   ```
   /summon zombie ~ ~ ~5
   ```
4. Watch the logs.

**Expected:**
- Log: `[Bresenham] Reactive rule 'enemy_nearby' triggered! Creating task 'flee_enemy'.`
- Current task is paused.
- Flee task calculates direction away from zombie.
- Log: `[Bresenham] Fleeing towards <position>`
- After 3 seconds, flee task completes and previous task resumes.

### Test 6.4: Tool Breaking

**Setup:**
```
/give @s stone_pickaxe{Damage:129} 1    <- near max damage (131 max)
```
(Use the appropriate 1.21.4 command syntax for damaged items.)

**Steps:**
1. `/bot start`
2. Equip the damaged pickaxe.
3. `/bot task mine_iron`

**Expected:**
- Tool break rule detects durability <= 2.
- Log: `[Bresenham] Reactive rule 'tool_break' triggered! Creating task 'craft_pickaxe'.`
- Craft pickaxe task interrupts the mining task.

### Test 6.5: Reactive Cooldowns

**Steps:**
1. Trigger enemy_nearby rule (summon zombie).
2. Immediately summon another zombie.
3. Check logs.

**Expected:**
- First trigger creates flee task.
- Second zombie within 5-second cooldown does NOT create another flee task.
- After 5 seconds, the rule can trigger again.

---

## 7. Task Priority & Interruption Tests

### Test 7.1: High Priority Interrupts Medium

**Steps:**
1. `/bot start`
2. `/bot task mine_iron` (MEDIUM priority)
3. Trigger low_health rule (CRITICAL priority) by taking damage.

**Expected:**
- mine_iron paused.
- eat_food (CRITICAL) executes.
- mine_iron resumes after eat_food completes.

### Test 7.2: Lower Priority Cannot Interrupt Higher

**Steps:**
1. Start a CRITICAL priority task (trigger enemy_nearby).
2. While flee is running, try `/bot task mine_iron` (MEDIUM priority).

**Expected:**
- mine_iron is pushed to the stack but the flee task continues running.
- After flee completes, mine_iron starts.

### Test 7.3: Task Stack Depth

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`
3. Trigger low_health (creates eat_food on top).
4. During eat_food, trigger enemy_nearby (creates flee_enemy on top).
5. `/bot status`

**Expected:**
- Status shows tasks queued: 3.
- Stack from top: flee_enemy -> eat_food -> mine_iron.
- Tasks resolve in reverse order as each completes.

---

## 8. Dependency Planner Tests

### Test 8.1: Auto-Inject Prerequisite

**Setup:** Empty inventory (no pickaxe).

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`

**Expected:**
- Log: `[Bresenham] Planned 2 task(s) for 'mine_iron'.`
- craft_pickaxe pushed first, then mine_iron.
- craft_pickaxe runs before mine_iron.

### Test 8.2: No Prerequisite Needed

**Setup:** Give yourself a pickaxe.
```
/give @s stone_pickaxe
```

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`

**Expected:**
- Log: `[Bresenham] Planned 1 task(s) for 'mine_iron'.`
- Only mine_iron is pushed (no craft_pickaxe needed).

---

## 9. Persistence Tests

### Test 9.1: Save on Shutdown

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`
3. Save and quit the world.
4. Check `<world-save>/bresenham/bot_state.json`.

**Expected:**
- File exists with JSON content:
  ```json
  {
    "currentTaskName": "mine_iron",
    "currentStepIndex": 0,
    "taskState": "RUNNING",
    "botRunning": true,
    "posX": ...,
    "posY": ...,
    "posZ": ...,
    "health": ...,
    "hunger": ...
  }
  ```

### Test 9.2: Load on Start

**Steps:**
1. Complete Test 9.1 (save state).
2. Re-enter the world.
3. Check logs for restore message.

**Expected:**
- Log: `[Bresenham] Restored saved bot state (task: mine_iron, running: true)`

### Test 9.3: No Save File

**Steps:**
1. Delete `<world-save>/bresenham/` folder.
2. Enter the world.

**Expected:**
- No errors.
- Bot starts in idle state.

---

## 10. AI Advisory Tests

> These tests require a valid Gemini API key in `config/bresenham/gemini.json`.

### Test 10.1: AI Status Check

**Steps:**
1. Configure API key and set `enabled: true`.
2. Restart the server.
3. `/bot ai status`

**Expected:**
- Chat: `AI Status: available | Model: gemini-2.5-flash | Enabled: true`

### Test 10.2: AI Disabled Status

**Steps:**
1. Set `enabled: false` in config (keep API key).
2. `/bot ai status`

**Expected:**
- Chat: `AI Status: available | Model: gemini-2.5-flash | Enabled: false`

### Test 10.3: Enable/Disable via Command

**Steps:**
1. `/bot ai disable`
2. `/bot ai status` -> Enabled: false
3. `/bot ai enable`
4. `/bot ai status` -> Enabled: true

**Expected:**
- Toggle works correctly, reflected in status.

### Test 10.4: Change Model

**Steps:**
1. `/bot ai model gemini-2.5-pro`

**Expected:**
- Chat: `AI model set to: gemini-2.5-pro`
- Subsequent AI queries use the new model.

### Test 10.5: Freeform AI Query

**Steps:**
1. Enable AI.
2. `/bot ai ask What should I prioritize in early game?`

**Expected:**
- Chat: `AI query submitted: What should I prioritize in early game?`
- Log (after async response): `[Bresenham] AI advisory: <decision> (confidence: <value>)`

### Test 10.6: AI Idle Goal Suggestion

**Steps:**
1. Enable AI.
2. `/bot start` (no task assigned).
3. Wait 10+ seconds.

**Expected:**
- Log: `[Bresenham] Requesting AI goal advice...`
- Log: `[Bresenham] AI goal advice received: <response>`

### Test 10.7: No API Key

**Steps:**
1. Set `apiKey: ""` in config.
2. Restart server.

**Expected:**
- Log: `[Bresenham] Gemini API key not configured. AI advisory disabled.`
- `/bot ai status` shows: `AI Status: unavailable`
- Bot operates normally with deterministic rules.

### Test 10.8: Invalid API Key

**Steps:**
1. Set `apiKey: "invalid-key"` in config.
2. Restart server, enable AI, start bot.
3. Wait for an AI query.

**Expected:**
- Log: `[Bresenham] Gemini API call failed.` with error details.
- Bot continues operating without AI.

---

## 11. Edge Cases & Error Handling

### Test 11.1: Start Without Player (Console)

**Steps:**
1. Run `/bot start` from the server console (not as a player).

**Expected:**
- Message: `This command must be run by a player.`

### Test 11.2: Double Start

**Steps:**
1. `/bot start`
2. `/bot start` again.

**Expected:**
- No crash. Bot continues running. Player re-assigned.

### Test 11.3: Stop When Already Stopped

**Steps:**
1. Don't start the bot.
2. `/bot stop`

**Expected:**
- No crash. Graceful no-op.

### Test 11.4: Pause With No Task

**Steps:**
1. `/bot start` (no task).
2. `/bot pause`

**Expected:**
- No crash. Nothing to pause.

### Test 11.5: Malformed Config JSON

**Steps:**
1. Write invalid JSON to `config/bresenham/gemini.json`:
   ```
   { broken json here
   ```
2. Restart the server.

**Expected:**
- Log: `[Bresenham] Malformed Gemini config JSON, using defaults.`
- Default config created and used.
- No crash.

### Test 11.6: Player Disconnect During Task

**Steps (multiplayer):**
1. Start bot on a player.
2. Assign a task.
3. Disconnect that player.

**Expected:**
- Bot tick silently returns (player is null).
- No crash or NPE.
- On rejoin, bot can be restarted.

---

## 12. Performance Tests

### Test 12.1: Iron Scan Performance

**Setup:** Flat world with no iron ore (worst case - scans all 32k blocks).

**Steps:**
1. `/bot start`
2. `/bot task mine_iron`
3. Monitor TPS with F3 or `/debug start` then `/debug stop`.

**Expected:**
- Scan completes within 1 tick (single tick operation).
- TPS remains at 20 (no noticeable lag).
- If TPS drops below 18, the scan radius may need optimization.

### Test 12.2: Long Running Bot

**Steps:**
1. Start the bot.
2. Assign repeated tasks over 10+ minutes.
3. Monitor memory usage in F3 debug screen.

**Expected:**
- Memory usage remains stable.
- Known resources list stays capped (max 64 per block type).
- No task stack growth (completed tasks are popped).

### Test 12.3: Rapid Task Switching

**Steps:**
1. `/bot start`
2. Rapidly alternate: `/bot task mine_iron`, `/bot stop`, `/bot start`, `/bot task craft_pickaxe`
3. Repeat 10 times.

**Expected:**
- No crashes or stuck states.
- `/bot status` always reflects correct state.

---

## 13. Multi-Player Tests

> Requires a dedicated or LAN server with 2+ players.

### Test 13.1: Bot Assigned to Correct Player

**Steps:**
1. Player A types `/bot start`.
2. Player B checks if they are affected.

**Expected:**
- Bot controls Player A only.
- Player B is unaffected.

### Test 13.2: Different Players Running Bot

**Steps:**
1. Player A: `/bot start`
2. Player B: `/bot start` (in future multi-bot implementation)

**Expected:**
- Currently: Player B's start overrides Player A's assignment.
- Log shows player reassignment.

---

## 14. Test Checklist

Use this checklist to track test completion:

### Build & Load
- [ ] Clean build succeeds (Test 2.1)
- [ ] JAR contains all classes (Test 2.2)
- [ ] Mod appears in mod list (Test 3.1)
- [ ] Initialization logs correct (Test 3.2)
- [ ] Config file auto-generated (Test 3.3)

### Bot Lifecycle
- [ ] Start bot (Test 4.1)
- [ ] Status when idle (Test 4.2)
- [ ] Stop bot (Test 4.3)
- [ ] Start/stop/start cycle (Test 4.4)

### Task System
- [ ] Mine iron with ore nearby (Test 5.1)
- [ ] Mine iron with no ore (Test 5.2)
- [ ] Craft pickaxe (Test 5.3)
- [ ] Pause and resume (Test 5.4)
- [ ] Unknown task name (Test 5.5)

### Reactive System
- [ ] Low health with food (Test 6.1)
- [ ] Low health without food (Test 6.2)
- [ ] Enemy nearby flee (Test 6.3)
- [ ] Tool breaking (Test 6.4)
- [ ] Cooldown enforcement (Test 6.5)

### Priority & Interruption
- [ ] High interrupts medium (Test 7.1)
- [ ] Low cannot interrupt high (Test 7.2)
- [ ] Stack depth (Test 7.3)

### Dependency Planner
- [ ] Auto-inject prerequisite (Test 8.1)
- [ ] Skip if prerequisite met (Test 8.2)

### Persistence
- [ ] Save on shutdown (Test 9.1)
- [ ] Load on start (Test 9.2)
- [ ] Missing save file (Test 9.3)

### AI Advisory
- [ ] AI status available (Test 10.1)
- [ ] AI status disabled (Test 10.2)
- [ ] Enable/disable toggle (Test 10.3)
- [ ] Change model (Test 10.4)
- [ ] Freeform query (Test 10.5)
- [ ] Idle goal suggestion (Test 10.6)
- [ ] No API key (Test 10.7)
- [ ] Invalid API key (Test 10.8)

### Edge Cases
- [ ] Console start rejected (Test 11.1)
- [ ] Double start (Test 11.2)
- [ ] Stop when stopped (Test 11.3)
- [ ] Pause with no task (Test 11.4)
- [ ] Malformed config (Test 11.5)
- [ ] Player disconnect (Test 11.6)

### Performance
- [ ] Iron scan TPS (Test 12.1)
- [ ] Long running stability (Test 12.2)
- [ ] Rapid task switching (Test 12.3)
