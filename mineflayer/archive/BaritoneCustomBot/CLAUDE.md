# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Baritone AI is an autonomous Minecraft bot with two components:
- **Java Fabric mod** (`mod/`) — perceives the game world and executes actions
- **Node.js backend** (`backend/`) — hosts WebSocket server, calls Gemini 2.5 Flash AI for decision-making

Data flows: Minecraft mod ↔ WebSocket (localhost:3000) ↔ Node.js backend ↔ Gemini API.

**Requirements**: Minecraft 1.21.11, Java 21+, Node.js 20+, Fabric Loader 0.18.1+, Fabric API 0.141.2+1.21.11.

## Build & Run Commands

### Java Mod (Gradle + Fabric Loom)
```bash
cd mod
./gradlew build          # Output: mod/build/libs/baritone-ai-1.0.0.jar
```
Requires a Baritone API JAR in `mod/libs/` (currently `baritone-meteor-1.21.11.jar`, compile-only dependency, not bundled).

### Node.js Backend
```bash
cd backend
npm install
cp .env.example .env     # Set GEMINI_API_KEY
npm start                # Production: node index.js
npm run dev              # Development: node --watch index.js (hot-reload)
```

No test runner or linter is configured for either component.

### Environment Configuration (`backend/.env`)
- `GEMINI_API_KEY` — required, no default
- `WS_PORT=3000` — WebSocket server port
- `GEMINI_MODEL=gemini-2.5-flash` — switchable Gemini model
- `MIN_GEMINI_COOLDOWN_MS=2000` — minimum delay between AI calls
- `DEBUG=false` — enables verbose logging
- `BOT_NAME=Bot` — configurable bot name; the bot responds when this name is mentioned in chat
- `BOT_WHITELIST=` — comma-separated player names allowed to command the bot (empty = everyone)
- `BOT_BLACKLIST=` — comma-separated player names blocked from commanding the bot

## Architecture

### Mod (Java, `mod/src/main/java/com/baritoneai/`)

**Tick-driven state machine**: `TaskStateMachine.tick()` runs every client tick (20/s) with priority-ordered interrupt handling:
1. Combat interrupts (every 4 ticks via `CombatHandler`)
2. Hunger check (`EatingHandler`, triggers below 14 hunger)
3. Interrupt recovery (resume saved task after eating/combat)
4. Task completion detection (Baritone process finished)
5. Stuck detection (same position for 200 ticks = 10s)
6. Low health emergency notification

**Thread safety**: All Minecraft interactions must go through `Minecraft.getInstance().execute()` since WebSocket messages arrive on background threads.

**Lazy initialization**: Baritone initializes on first tick where `player != null`. Mod degrades gracefully if Baritone isn't installed.

**Entry point**: `BaritoneAIMod.java` implements `ClientModInitializer`. Registers tick event and chat listener; lazy-initializes Baritone + WebSocket on first tick with a player present. Handles incoming WebSocket messages on the main thread via `Minecraft.getInstance().execute()`.

**Key packages**:
- `ai/` — `TaskStateMachine` (main game loop), `TaskState` enum (IDLE, EXECUTING, INTERRUPTED, COMPLETED, FAILED)
- `baritone/` — `BaritoneWrapper` (wraps GOTO, MINE, FOLLOW, EXPLORE, BUILD), `PathingHelper` (stuck detection, distance)
- `network/` — `WebSocketClient` (reconnect + outgoing queue + heartbeat), `MessageHandler` (JSON message builders)
- `state/` — `WorldStateCollector` (gathers full game snapshot), `WorldStateSnapshot` (DTO with toJson())
- `tasks/` — `ActionExecutor` (dispatches actions), `CombatHandler`, `EatingHandler`, `EquipmentHandler` (armor/tool selection), `CraftingHandler` (recipe resolution), `ElytraHandler` (flight + rockets), `BoatHandler` (water navigation), `NetherPortalHandler` (multi-phase nether portal travel), `StorageHandler` (item storage at base), `ChestSearchHandler` (searches nearby chests for items)
- `chat/` — `ChatListener` (mention-based detection with configurable bot name), `ChatSender` (splits at 256 chars)

### Backend (Node.js ES modules, `backend/`)

**Single-client WebSocket server** with concurrency guard (`pendingGeminiCall`) preventing concurrent Gemini calls (emergencies bypass this).

**Request flow**: Chat command → `GameWebSocketServer` → `ActionPlanner.planForChat()` → `PromptBuilder` assembles prompt with world state + memory → Gemini returns structured JSON → `ActionValidator` validates → cooldown/anti-loop checks → `EXECUTE_ACTIONS` sent to mod.

**Crafting queue**: `ActionPlanner` chains multi-step crafting recipes (e.g., logs → planks → sticks → pickaxe) without re-calling Gemini for each step. `RecipeResolver` resolves dependencies and queues intermediate CRAFT actions automatically.

**Autonomy system**: After 15 min with no player commands, the backend begins autonomous action every 60s via `GoalManager`. Goals expire after 30–60 min. Inventory fullness triggers `STORE_ITEMS`. Player commands reset autonomy.

**Emergency flow**: Mod sends `EMERGENCY` for low health or stuck states. Backend bypasses the `pendingGeminiCall` guard (but still rate-limits at 10s per emergency type).

**Memory persistence**: `MemoryStore` saves to `backend/memory/memory.json` on shutdown (SIGINT/SIGTERM handlers in `index.js`). Tracks players, locations, conversations (ring buffer of 20), portal pairs, idle mode, and base coordinates.

**Key modules**:
- `server/websocketServer.js` — `GameWebSocketServer`: message routing, whitelist/blacklist, auto GOTO→NETHER_TRAVEL conversion for long distances, inventory fullness checks, portal pair discovery on dimension change
- `planner/actionPlanner.js` — Gemini API caller; uses `responseMimeType: 'application/json'`, `temperature: 0.3`; methods: `planForChat`, `planForTaskComplete`, `planForEmergency`, `planForStuck`, `planForAutonomy`
- `planner/actionValidator.js` — validates action JSON, enforces allowed action types
- `planner/recipeResolver.js` — Minecraft crafting recipe database; auto-resolves multi-step dependencies
- `prompts/systemPrompt.js` — Gemini personality/capabilities/rules
- `prompts/promptBuilder.js` — builds user prompts for chat/task/emergency/stuck/autonomy scenarios
- `memory/memoryStore.js` — persistent JSON memory (players, locations, conversations, portal pairs, idle mode)
- `memory/goalManager.js` — autonomous goal tracking with expiration (30–60 min)
- `utils/cooldownManager.js` — min 2s between Gemini calls, max 3 consecutive identical actions
- `utils/antiLoop.js` — sliding window of 10 actions; detects AAAA (4+ identical) and ABAB (3+ alternating) patterns; forces EXPLORE
- `utils/inventoryAnalyzer.js` — determines when inventory is full enough to trigger STORE_ITEMS
- `utils/logger.js` — timestamped logging with severity levels
- `data/recipes.js` — raw recipe data used by recipeResolver

### WebSocket Message Protocol

**Mod → Backend**: `CHAT_MESSAGE`, `STATE_UPDATE`, `TASK_COMPLETE`, `TASK_FAILED`, `EMERGENCY`
**Backend → Mod**: `EXECUTE_ACTIONS` (with taskId UUID + actions array), `STOP`, `REQUEST_STATE`, `SET_BASE`, `SET_CONFIG`, `SET_IDLE_MODE`

**Valid action types**: `GOTO`, `MINE`, `FOLLOW_PLAYER`, `STOP`, `EAT`, `ATTACK_NEAREST_HOSTILE`, `BUILD_STRUCTURE`, `CHAT`, `EXPLORE`, `IDLE`, `CRAFT`, `FLY_TO`, `BOAT_TO`, `STORE_ITEMS`, `NETHER_TRAVEL`, `RETRIEVE_FROM_CHEST`

### Schematic Building

The mod supports `.schem`, `.litematic`, and `.schematic` files from the Minecraft `schematics/` directory. Available schematics are included in the world state sent to Gemini so it can pick the best match for `BUILD_STRUCTURE` actions.

## Conventions

- Java uses Gson (`JsonObject`, `JsonArray`, `JsonParser`) for all JSON serialization
- Backend uses ES module imports (`import`/`export`), class-based architecture throughout
- WebSocket reconnects every 5s, heartbeat every 15s, outgoing messages queued via `ConcurrentLinkedQueue`
- Baritone dependency is compile-only (provided at runtime by separate mod in mods folder)
- Java-WebSocket 1.5.7 is bundled inside the mod JAR via Fabric Loom's jar-in-jar (`include()`)
- Uses Mojang official mappings (not Yarn) for Baritone compatibility
- Backend dependencies: `ws` (WebSocket), `@google/genai` (Gemini API), `dotenv` (env config)

## Adding a New Action Type

Adding an action requires changes across both components:
1. **Backend**: Add to `VALID_ACTION_TYPES` in `planner/actionValidator.js`, add validation logic, update `prompts/systemPrompt.js` with JSON example
2. **Mod**: Add case to `ActionExecutor.executeAction()` switch, create handler class in `tasks/` if complex
3. **Protocol**: Both sides must agree on the action name string; the mod receives actions via `EXECUTE_ACTIONS` messages

## Key Timing Constants
- Combat checks: every 4 ticks (200ms)
- Equipment checks: every 40 ticks (2s)
- State update throttle: 500ms
- Stuck detection: 200 ticks (10s) at same position
- Low health emergency: < 6 half-hearts
- WebSocket reconnect: 5s, mod heartbeat: 15s, backend ping-pong: 30s
- Gemini cooldown: min 2s between calls (configurable via `MIN_GEMINI_COOLDOWN_MS`)
- Autonomy check: every 60s, activates after 15 min idle
