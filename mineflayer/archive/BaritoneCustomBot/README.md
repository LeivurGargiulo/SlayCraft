# Baritone AI — Autonomous Minecraft Bot

An autonomous Minecraft AI system powered by **Gemini 2.5 Flash** and **Baritone**. The bot plays like a skilled human player: responding to chat commands, mining resources, fighting mobs, eating when hungry, building structures, and exploring the world.

## Architecture

```
┌──────────────────────────────────────┐
│          Minecraft Client            │
│  ┌──────────────────────────────┐    │
│  │      Fabric Mod (Java)       │    │
│  │  ┌─────────┐  ┌──────────┐  │    │
│  │  │  Chat   │  │  World   │  │    │
│  │  │Listener │  │  State   │  │    │
│  │  └────┬────┘  └────┬─────┘  │    │
│  │       │             │        │    │
│  │  ┌────▼─────────────▼────┐   │    │
│  │  │   Task State Machine  │   │    │
│  │  │  (Combat/Eat/Execute) │   │    │
│  │  └────┬──────────────────┘   │    │
│  │       │                      │    │
│  │  ┌────▼────┐  ┌──────────┐  │    │
│  │  │Baritone │  │WebSocket │  │    │
│  │  │ Wrapper │  │ Client   │──┼────┼──┐
│  │  └─────────┘  └──────────┘  │    │  │
│  └──────────────────────────────┘    │  │
└──────────────────────────────────────┘  │
                                          │ ws://localhost:3000
┌─────────────────────────────────────────▼──┐
│          Node.js Backend                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ WebSocket│  │  Action  │  │  Memory  │  │
│  │  Server  │──│ Planner  │──│  Store   │  │
│  └──────────┘  └────┬─────┘  └──────────┘  │
│                     │                       │
│               ┌─────▼──────┐                │
│               │ Gemini 2.5 │                │
│               │   Flash    │                │
│               └────────────┘                │
└─────────────────────────────────────────────┘
```

**Gemini** = Strategic Brain (decides what to do)
**Node Planner** = Executive Function (validates, rate-limits, prevents loops)
**Fabric Mod** = Nervous System (senses world, executes actions)
**Baritone** = Motor Cortex (pathfinding, mining, building)

## Requirements

- **Minecraft** 1.21.11 (Java Edition)
- **Java** 21+
- **Fabric Loader** 0.18.1+
- **Fabric API** 0.141.2+
- **Baritone** (Fabric standalone or baritone-meteor)
- **Node.js** 20+
- **Gemini API Key** (Google AI Studio)

## Setup

### 1. Baritone API JAR

Download a Baritone API JAR for Minecraft 1.21.11 and place it in `mod/libs/`. Options:
- **baritone-meteor** from [Meteor Client](https://meteorclient.com/) ecosystem
- **baritone-api-fabric** from [Baritone releases](https://github.com/cabaletta/baritone/releases) (if available for your MC version)

### 2. Build the Mod

```bash
cd mod
./gradlew build
```

The mod JAR will be in `mod/build/libs/baritone-ai-1.0.0.jar`.

### 3. Install Mods

Copy these to your Minecraft `mods/` folder:
- `baritone-ai-1.0.0.jar` (this mod)
- Baritone JAR for 1.21.11 (standalone or baritone-meteor)
- Fabric API JAR (from Fabric downloads)

### 4. Setup Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
npm install
```

### 5. Run

1. Start the backend: `cd backend && npm start`
2. Launch Minecraft with Fabric
3. Join a world/server
4. The mod auto-connects to the backend

## Usage

Chat commands start with "Bot":

| Command | Example |
|---------|---------|
| **Chat** | `Bot hello` |
| **Navigate** | `Bot come to 100 64 -200` |
| **Mine** | `Bot mine diamonds` |
| **Follow** | `Bot follow me` |
| **Stop** | `Bot stop` |
| **Explore** | `Bot explore` |
| **Build** | `Bot build small_house` |
| **Help** | `Bot what can you do?` |

The bot also autonomously:
- Fights hostile mobs that attack it
- Eats food when hunger drops below 14
- Reports emergencies (low health, hostile mobs)
- Resumes interrupted tasks after combat/eating

## Building Structures

Place `.schem`, `.litematic`, or `.schematic` files in your Minecraft `schematics/` folder. The bot can build any schematic by name:

```
Bot build small_house
```

Available schematics are sent to Gemini so it can pick the best match.

## Configuration

### Backend (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | (required) | Google AI Studio API key |
| `WS_PORT` | `3000` | WebSocket server port |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use |
| `MIN_GEMINI_COOLDOWN_MS` | `2000` | Min ms between Gemini calls |
| `DEBUG` | `false` | Enable debug logging |

## Project Structure

```
baritone/
├── mod/                           # Fabric client mod (Java)
│   └── src/main/java/com/baritoneai/
│       ├── BaritoneAIMod.java     # Mod entrypoint
│       ├── ai/                    # Task state machine
│       ├── baritone/              # Baritone API wrapper
│       ├── chat/                  # Chat listener + sender
│       ├── network/               # WebSocket client
│       ├── state/                 # World state collection
│       └── tasks/                 # Action execution, combat, eating
├── backend/                       # Node.js AI backend
│   ├── index.js                   # Entry point
│   ├── server/                    # WebSocket server
│   ├── planner/                   # Gemini integration + validation
│   ├── memory/                    # Persistent memory store
│   ├── prompts/                   # Gemini prompt templates
│   └── utils/                     # Cooldown, anti-loop, logger
└── README.md
```

## Safety

- Bot never attacks players unless attacked first
- Max 3 consecutive identical actions (anti-spam)
- 2-second cooldown between AI calls
- Loop detection (ABAB/AAAA patterns)
- Chat messages capped at 256 characters
- State updates throttled to 500ms
- Low health triggers emergency mode

## Troubleshooting

- **"Baritone not available"**: Make sure a Baritone JAR (standalone or baritone-meteor) is in the mods folder
- **No connection**: Check that the backend is running on port 3000
- **Gemini errors**: Verify your API key in `.env`
- **Bot not responding to chat**: Check chat format matches `<Player> Bot command` pattern
