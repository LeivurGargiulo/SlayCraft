# Bresenham Bot - Usage Guide

Bresenham Bot is a Minecraft Fabric mod that runs an autonomous bot on a player entity. It performs tasks like mining and crafting, reacts to threats, and optionally consults a Gemini AI advisor for strategic decisions.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Java (JDK) | 21+ | Required to build and run |
| Minecraft | 1.21.4 | Java Edition only |
| Fabric Loader | 0.16.10+ | [fabricmc.net/use/installer](https://fabricmc.net/use/installer/) |
| Fabric API | 0.114.0+1.21.4 | Place JAR in `mods/` folder |
| Baritone | any (optional) | Enables advanced pathfinding |
| Carpet Mod | any (optional) | Useful for debugging |

---

## 2. Building from Source

```bash
git clone <repo-url>
cd bresenham
./gradlew build
```

Output JAR: `build/libs/bresenham-bot-0.1.0.jar`

To clean and rebuild:
```bash
./gradlew clean build
```

---

## 3. Installation

1. Run the [Fabric installer](https://fabricmc.net/use/installer/) and select Minecraft 1.21.4.
2. Copy **both** of these JARs into `.minecraft/mods/`:
   - `bresenham-bot-0.1.0.jar`
   - `fabric-api-0.114.0+1.21.4.jar` (or newer compatible version)
3. Launch Minecraft using the **Fabric** profile.
4. Verify: on the title screen, click "Mods" and confirm "Bresenham Bot" appears.

---

## 4. Quick Start

```
1. Create or load a world (singleplayer or multiplayer).
2. Press T to open chat.
3. /bot start          <- assigns the bot to your player
4. /bot task mine_iron <- gives the bot a mining objective
5. /bot status         <- check what the bot is doing
6. /bot stop           <- stop the bot and clear all tasks
```

---

## 5. Commands Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `/bot start` | Assign the bot to the player who runs the command and start the tick engine |
| `/bot stop` | Stop the bot, cancel all tasks, and release the player |
| `/bot status` | Display: running state, current task + step, queue depth, and health |
| `/bot pause` | Pause the current task in place (preserves progress) |
| `/bot resume` | Resume a previously paused task |
| `/bot task <name>` | Push a named task onto the task stack (see section 6) |

### AI Commands

| Command | Description |
|---------|-------------|
| `/bot ai status` | Show AI availability, current model, and enabled state |
| `/bot ai enable` | Turn on AI advisory for goal suggestions |
| `/bot ai disable` | Turn off AI advisory (bot continues with deterministic rules) |
| `/bot ai model <name>` | Switch AI model (e.g., `gemini-2.5-pro`) |
| `/bot ai ask <question>` | Submit a freeform strategy question to the AI |

---

## 6. Available Tasks

| Task | Description | Auto-Prerequisites |
|------|-------------|-------------------|
| `mine_iron` | Scans a 16-block radius for iron ore, navigates to it, and mines it | `craft_pickaxe` (if no pickaxe in inventory) |
| `craft_pickaxe` | Crafts a stone pickaxe: planks -> sticks -> pickaxe | Requires wood and cobblestone in inventory |

### How the Dependency Planner Works

When you run `/bot task mine_iron`, the planner checks the task metadata (`requires_tool: pickaxe`). If no pickaxe is found in your inventory, it automatically inserts a `craft_pickaxe` task before `mine_iron`. This resolution is recursive - prerequisites can have their own prerequisites.

### Task Stack Behavior

Tasks use a **stack** (LIFO), not a queue:
- New tasks push on top of the current task.
- Higher-priority tasks **interrupt** the current task (pausing it).
- When an interrupting task completes, the paused task resumes automatically.
- `/bot stop` clears the entire stack.

Priority levels (highest to lowest): `CRITICAL` > `HIGH` > `MEDIUM` > `LOW`

---

## 7. Reactive Safety System

The reactive system runs **every tick before task execution**, ensuring survival takes priority over objectives.

| Rule | Trigger Condition | Priority | Action | Cooldown |
|------|-------------------|----------|--------|----------|
| Low Health | Health < 6.0 (3 hearts) and food in inventory | CRITICAL | Switches to food item and eats | 10 sec |
| Enemy Nearby | Hostile mob within 8 blocks | CRITICAL | Calculates flee direction, moves away for 3 sec | 5 sec |
| Tool Breaking | Equipped pickaxe durability <= 2 | HIGH | Interrupts to craft a replacement pickaxe | 10 sec |

When a reactive rule triggers, it creates a response task that interrupts the current work. Once the response task completes, the previous task resumes from where it left off.

---

## 8. Gemini AI Advisory (Optional)

The AI system is completely optional. Without it, the bot operates using deterministic rules only.

### Configuration

On first launch, the mod creates a default config at:
```
.minecraft/config/bresenham/gemini.json
```

Edit it with your API key:
```json
{
  "apiKey": "YOUR_GEMINI_API_KEY",
  "modelName": "gemini-2.5-flash",
  "enabled": true,
  "temperature": 0.7,
  "maxTokens": 256,
  "confidenceThreshold": 0.5
}
```

Get an API key from [Google AI Studio](https://aistudio.google.com/).

### Supported Models

| Model | Speed | Capability |
|-------|-------|------------|
| `gemini-2.5-flash` | Fast | Good for real-time decisions (default) |
| `gemini-2.5-pro` | Moderate | Better reasoning |
| `gemini-3-flash` | Fast | Latest generation, fast |
| `gemini-3-pro` | Moderate | Latest generation, most capable |

### Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | string | `""` | Your Gemini API key (empty = disabled) |
| `modelName` | string | `gemini-2.5-flash` | Which model to query |
| `enabled` | boolean | `false` | Master switch for AI advisory |
| `temperature` | float | `0.7` | Response randomness (0.0 = deterministic, 2.0 = creative) |
| `maxTokens` | int | `256` | Maximum response length |
| `confidenceThreshold` | float | `0.5` | Ignore advice below this confidence (0.0-1.0) |

### How It Works

1. All AI queries are **asynchronous** - they never block the game tick loop.
2. When the bot is idle (no tasks), the AI is asked for a goal suggestion.
3. A 10-second cooldown between queries prevents API spam.
4. The AI returns JSON: `{"decision": "...", "confidence": 0.8, "reasoning": "..."}`.
5. Advice below `confidenceThreshold` is silently discarded.
6. The deterministic system always has final say - AI only advises, never overrides.

---

## 9. Architecture

```
                         Every Server Tick (20 TPS)
                                   |
                                   v
                         BotController.tick()
                                   |
            +----------------------+----------------------+
            |                      |                      |
            v                      v                      v
   1. WorldState.update()   2. AI Advisory tick    3. ReactiveSystem.check()
   - Player position        - Check pending         - Low health?
   - Health / hunger           async responses       - Enemy nearby?
   - Inventory scan          - Request goals          - Tool breaking?
   - Entity scan               if idle               - Interrupt if needed
                                                           |
                                                           v
                                                   4. TaskManager.tick()
                                                   - Execute current step
                                                   - Advance on completion
                                                   - Pop completed tasks
```

### Key Subsystems

| Subsystem | Responsibility | Key File |
|-----------|---------------|----------|
| WorldState | Tracks player, inventory, entities each tick | `state/WorldState.java` |
| InventoryTracker | Item queries, food/tool detection | `state/InventoryTracker.java` |
| EntityTracker | Scans hostile/passive/player entities in 32-block radius | `state/EntityTracker.java` |
| TaskManager | Priority-based task stack with interrupt/resume | `task/TaskManager.java` |
| ReactiveSystem | Safety rules checked before task execution | `reactive/ReactiveSystem.java` |
| DependencyPlanner | Resolves task prerequisites recursively | `planner/DependencyPlanner.java` |
| ActionExecutor | Abstraction over Baritone/vanilla movement and actions | `executor/BaritoneActionExecutor.java` |
| AdvisorIntegration | Non-blocking bridge to Gemini AI | `ai/AdvisorIntegration.java` |
| PersistenceManager | Save/load bot state as JSON in world folder | `persistence/JsonPersistenceManager.java` |
| BotManager | Multi-bot support (one controller per player) | `controller/BotManager.java` |

---

## 10. Persistence

Bot state is saved automatically on server shutdown to:
```
<world-save>/bresenham/bot_state.json
```

Saved fields: running state, current task name, step index, task state, position (x/y/z), health, and hunger.

State is restored on the next server start.

---

## 11. Logging

All log entries use the `[Bresenham]` prefix. View them in `.minecraft/logs/latest.log`.

| Level | What gets logged |
|-------|-----------------|
| `INFO` | Startup, shutdown, task push/pop/complete, player assignment, AI availability |
| `DEBUG` | Per-tick movement, mining, crafting actions, AI queries sent |
| `WARN` | Step precondition failures, JSON parse issues, max planning depth |
| `ERROR` | AI connection failures, file I/O errors, unrecoverable exceptions |

To increase log verbosity, add to your `log4j2.xml`:
```xml
<Logger name="bresenham-bot" level="DEBUG" />
```

---

## 12. Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Mod not in Mods list | Wrong Minecraft version or missing Fabric Loader | Install Fabric Loader 0.16.10+ for MC 1.21.4 |
| `/bot` command not recognized | Mod failed to load | Check `logs/latest.log` for `[Bresenham]` errors |
| "Bot started" but nothing happens | No task assigned | Run `/bot task mine_iron` |
| Bot doesn't move | Baritone not installed | Install Baritone for pathfinding, or test near iron ore |
| Task immediately fails | Missing materials or unreachable target | Check log for `Step '...' failed` messages |
| AI not responding | API key missing or invalid | Check `config/bresenham/gemini.json`, run `/bot ai status` |
| AI says "not configured" | `enabled` is false or `apiKey` is empty | Set both in config, restart the server |
| Bot dies repeatedly | Low health rule can't find food | Ensure food is in inventory before starting |
| Lag spikes | Iron scan on empty area | Normal on first scan; 16-block radius = 32k blocks checked |
| State not restored | Persistence file missing | Check `<world>/bresenham/bot_state.json` exists |
