# Minecraft Farm Observatory (MFO) — Architecture

> Source: consolidated from the original architecture discussion. This is the
> high-level companion to `TECHNICAL_SPEC.md`; where the two disagree, flag the
> conflict rather than picking one silently (see `CLAUDE.md`).

## Goal

MFO is an observability platform for a Fabric technical Minecraft server. It does
**not** automate gameplay — it observes the server, gathers metrics, computes
health, and alerts players.

Think of it as: **Prometheus + Grafana for Minecraft farms.** (Originally "+ CCTV"
too — see the Camera/Screenshot note below for why that part was cut.)

## Core principles

### Read-only

The Manager may:

- Teleport
- Open containers
- Read inventories
- Read entities
- Read blocks
- Read dimensions
- Read chunk state

The Manager may **never**:

- Move, pick up, or drop items
- Place or break blocks
- Attack
- Trade
- Craft
- Press buttons or flip levers
- Activate redstone

The only gameplay permission is teleportation.

## High-level architecture

```
Users (Discord / Web Dashboard)
            │
   REST + WebSocket API
            │
      Manager Core
  ┌─────────────────────────────┐
  │ Farm Registry                │
  │ Scheduler                    │
  │ Health Engine                │
  │ Alert Engine                 │
  │ Metrics Engine                │
  │ Storage Scanner               │
  │ Entity Scanner                │
  │ Persistence                   │
  └─────────────────────────────┘
            │
     Mineflayer Manager
            │
  Minecraft Fabric Server
            │
    Carpet Fake Players
  (Worker-Iron, Worker-Gold, Worker-Raid, Worker-Guardian, ...)
```

## Components

### Mineflayer Manager

Singleton. Only one instance exists. Stateless — never permanently assigned to a farm.

Responsibilities: teleport, scan farms, open inventories, calculate storage,
observe entities, report metrics.

### Carpet Workers

One per farm. Load chunks, keep farms operational, execute repetitive Carpet actions.
Workers never communicate with each other — the Manager observes them.

### Farm Registry

Configuration-driven. No hardcoded farms. Example:

```yaml
farms:
  iron:
    dimension: overworld
    teleport:
      x: 120
      y: 80
      z: -500
    carpetWorker: worker_iron
    storage:
      - type: chest
        position: [123, 79, -501]
      - type: barrel
        position: [124, 79, -501]
```

## Scheduler

Owns all Manager movement. Queue-based.

Example run: Inspect Iron → Storage Scan Raid → Entity Scan Guardian → Return Idle.

Priority order (highest to lowest):

1. **Highest** — Mineflayer reconnect
2. **High** — Alert verification
3. **Medium** — User command
4. **Low** — Periodic scan

## Storage Scanner

Supports: Chest, Double Chest, Barrel, Shulker Box, Nested Shulker Boxes.

Returns per container: capacity, items, slots used, fill %, NBT, nested contents.
Never modifies inventory — read-only.

## Production Engine

Pipeline: item count → compare previous scan → delta → items/min → items/hour →
rolling average → daily total. History is stored forever.

## Camera / Screenshot (removed)

Originally: named per-farm waypoints, a live Prismarine Viewer stream following the
Manager, and a screenshot-capture pipeline (alert/scheduled/manual) built on
`prismarine-viewer` + headless Puppeteer. Removed — `prismarine-viewer` only ships
bundled texture atlases/blockstates up to Minecraft 1.21.4, and this server runs
1.21.11; every block changed or added since 1.21.4 renders with the wrong texture
mapped onto it (visually "glitched"), with no upstream fix available. Root cause and
full decision recorded in `docs/PROGRESS.md`. `CameraDefinition`/`CameraService`,
the screenshot pipeline, and their DB table/REST routes/Discord command/dashboard
pages are gone; a replacement (e.g. a texture-free top-down block-color map, or
integrating an existing map mod like dynmap/BlueMap) is deferred, not designed yet.

## Entity Scanner

Scans a configurable radius. Detects passive mobs, hostile mobs, villagers, armor
stands, minecarts, players, named entities, and unknown/unexpected entities. Supports
a per-farm whitelist (e.g. Guardian Farm allows Guardian, Minecart, Armor Stand,
Manager, Worker — anything else, like a Zombie, triggers an alert).

## Worker Monitor

Checks: worker exists, correct dimension, correct coordinates, chunk loaded, alive,
connected. Missing worker → critical alert.

## Chunk Monitor

Verifies target chunk, worker chunk, and storage chunk are loaded. Any unloaded →
critical.

## Health Engine

Every farm has exactly one health value, computed (never manually assigned):

```
UNKNOWN → OFFLINE → CRITICAL → WARNING → HEALTHY
```

Inputs: storage, production, worker, chunk, entities, manager, last scan.

## Alert Engine

Supported alerts: storage >90%, storage full, production stopped, worker missing,
chunk unloaded, manager disconnected, unexpected player, unexpected entity,
container inaccessible.

Lifecycle: `Triggered → Open → Acknowledged → Resolved → Archived`.

## Metrics

**Per farm:** storage %, items, items/hour, items/day, health, worker uptime, scan
duration, entities, chunks loaded.

**Global:** manager uptime, connected, TPS, loaded farms, active alerts.

## Database

SQLite, unlimited history. Tables: `farms`, `containers`, `container_snapshots`,
`production`, `health`, `alerts`, `workers`, `entities`, `users`, `settings`,
`manager_status`. Indexes on timestamp, farm, alert state, container.

## REST API

```
GET  /farms
GET  /farm/{id}
GET  /farm/{id}/health
GET  /farm/{id}/storage
GET  /farm/{id}/metrics
GET  /farm/{id}/alerts
GET  /farm/{id}/production
POST /scan
POST /alert/ack
GET  /dashboard
```

## WebSocket events

`HealthChanged`, `AlertCreated`, `AlertResolved`, `ManagerMoved`,
`StorageUpdated`, `ProductionUpdated`, `WorkerOffline`.

## Discord

**Commands:** `/farm`, `/storage`, `/health`, `/production`, `/alerts`,
`/workers`, `/dashboard`, `/help`.

**Notifications:** storage warning, storage full, production stopped, worker offline,
unknown player, unknown entity, manager offline.

## Web Dashboard

- **Overview** — farm cards, health, alerts, storage.
- **Farm** — storage, metrics, production graph, timeline, health.
- **Alerts** — open, acknowledged, resolved, history.
- **Workers** — status, dimension, coordinates, uptime.
- **Manager** — connected, current task, queue, current farm, latency.

## Security

- **Discord** — whitelist by user ID; roles: Admin, Viewer.
- **Dashboard** — username/password, JWT, HTTPS-ready.

## Configuration

```
config/
  server.yml
  farms.yml
  workers.yml
  alerts.yml
  discord.yml
  dashboard.yml
  storage.yml
```

## Suggested project structure

```
src/
  core/
    scheduler/
    registry/
    events/
    config/
  manager/
    teleport/
    scanner/
    storage/
    entities/
  health/
  metrics/
  alerts/
  integrations/
    discord/
    carpet/
  dashboard/
    api/
    websocket/
    frontend/
  database/
  models/
  utils/
```

> Note: `TECHNICAL_SPEC.md` §19 has a more detailed, slightly different folder layout
> (`app/`, `monitors/`, `services/`, `api/`, `shared/`). Treat that version as
> authoritative for implementation — flag this discrepancy before deviating from
> either.

## Event bus (internal)

Everything communicates through events rather than direct calls, e.g.
`ContainerScanned`, `ProductionUpdated`, `HealthComputed`, `AlertTriggered`,
`WorkerMissing`, `ManagerConnected`, `UnknownPlayerDetected`.
This keeps the system modular and makes it easy to add new monitoring features.

## Recommended technology stack

| Component             | Technology                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| Language              | TypeScript                                                                |
| Runtime               | Node.js 22 LTS                                                            |
| Minecraft             | Mineflayer                                                                |
| Pathfinding (future)  | mineflayer-pathfinder (installed but movement disabled except teleport)  |
| Database              | SQLite + Drizzle ORM                                                     |
| REST API              | Fastify                                                                  |
| WebSocket             | Socket.IO                                                                |
| Dashboard             | React + Vite + Mantine UI                                                |
| Charts                | Apache ECharts                                                           |
| Authentication        | JWT + bcrypt                                                             |
| Configuration         | YAML                                                                     |
| Logging               | Pino                                                                     |
| Validation            | Zod                                                                      |
| Scheduling            | BullMQ (or an in-process priority queue if single-instance only)        |
| Containerization      | Docker + Docker Compose                                                 |

## Future plugin system

Every scanner is a plugin implementing a common interface:

```ts
interface FarmMonitor {
  id: string;
  scan(farm: FarmContext): Promise<ScanResult>;
}
```

Built-in monitors: `StorageMonitor`, `ProductionMonitor`, `WorkerMonitor`,
`ChunkMonitor`, `EntityMonitor`. This lets new observability features (villager
health, beacon status, redstone state, hopper throughput, mob counts, ...) get
added without touching the core scheduler or health engine.

## Development roadmap

1. **Foundation** — configuration loading, event bus, scheduler, database, logging,
   Mineflayer connection.
2. **Observation** — teleportation, storage scanning, entity scanning.
3. **Health & Metrics** — production calculations, farm health computation,
   historical snapshots, alerts.
4. **Integrations** — Discord commands/notifications, REST API, WebSocket events.
5. **Dashboard** — live overview, farm pages, charts, alert management,
   authentication.
6. **Polish** — plugin system, configuration validation, backups, testing,
   documentation, Docker deployment.

This architecture is intentionally modular: every subsystem communicates through
events, every farm is configuration-driven, and the Mineflayer Manager remains a
read-only observer while Carpet workers remain simple infrastructure actors. That
separation should keep the system maintainable even as the technical server and
number of farms grow.
