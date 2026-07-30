# Minecraft Farm Observatory (MFO) — Technical Architecture Specification v1.0

> Companion to `ARCHITECTURE.md`. This document is authoritative for implementation
> details (folder layout, domain model, algorithms, coding standards). Where it
> conflicts with `ARCHITECTURE.md`, flag the conflict rather than picking one
> silently (see `CLAUDE.md`).

## 1. Project overview

MFO is a **read-only observability platform** for technical Fabric servers. It is
**not** an automation mod. Its purpose mirrors infrastructure observability tools
(Prometheus, Grafana, ELK): observe, collect metrics, store historical data, detect
anomalies, alert operators, visualize system state. Gameplay is never modified.

## 2. Design principles

### Read-only

**Allowed:** teleport, open/inspect inventories, inspect entities, inspect blocks,
read chunks, receive packets.

**Forbidden:** block breaking, placing blocks, dropping items, moving items, clicking
inventory slots, crafting, attacking, eating, trading, activating blocks.

Any feature violating this principle is out of scope.

### Configuration-driven

Nothing is hardcoded: farms, storage, alerts, dashboard, discord, workers — all
defined by configuration.

### Event-driven

Subsystems never call each other directly. Everything communicates through an Event
Bus:

```
StorageScanner → ContainerScanned Event → Metrics Service → Health Service
→ Alert Service → Discord
```

No service knows who consumes its events.

### Plugin-based

Every monitor is independently pluggable (`StorageMonitor`, `EntityMonitor`,
`ChunkMonitor`, `WorkerMonitor`, `VillagerMonitor`, `ProductionMonitor`, ...), each
implementing a common interface.

## 3. System context

```
Discord → Discord Adapter → Event Bus → Mineflayer Manager → Minecraft Server
                                                             → Carpet Workers
```

## 4. Runtime components

### Manager

Singleton. No business logic — a pure execution engine.
Responsibilities: teleport, inspect, execute scan jobs.

### Scheduler

Owns manager movement. The Manager never decides what to do; the Scheduler decides.

- **Input:** Scan Farm, Inspect Storage, Verify Worker, Entity Scan
- **Output:** Teleport, Execute, Return Result

### Farm Registry

Loads `farms.yml` → produces `FarmDefinition`. Immutable after startup. Hot reload
optional.

### Event Bus

Central communication mechanism (Node `EventEmitter` or RxJS `Subject`). No direct
service-to-service dependencies.

### Storage Service

Inventory parsing, nested shulker parsing, fill percentage, delta calculation. No
alert logic.

### Production Service

Consumes `ContainerSnapshots`, produces `ProductionMetrics`. Example: previous 1000
carrots → current 1240 → delta 240 → 240/min → 14,400/hour.

### Health Service

Consumes everything, produces deterministic `FarmHealth`. Never manually assigned.

### Alert Service

Consumes health, metrics, events. Produces `AlertOpened`, `AlertClosed`,
`AlertAcknowledged`.

### Persistence

Consumes everything, writes SQLite. No business logic.

### Dashboard API

Consumes database and WebSocket events. Never communicates with Minecraft directly.

## 5. Domain model

```
Farm       { id, name, dimension, teleport, worker, containers, settings }
Worker     { id, carpetName, expectedPosition, dimension, status, lastSeen }
Container  { id, farmId, type, position, capacity }
Snapshot   { containerId, timestamp, items, fill, hash }
Metric     { farmId, timestamp, production, storage, health }
Alert      { id, farm, type, severity, state, opened, closed }
```

## 6. Scheduler

Priority queue, FIFO within each level:

1. **CRITICAL** — verify alert, reconnect
2. **HIGH** — Discord command
3. **NORMAL** — farm scan

Only one Manager exists → one active job → a queue is required.

## 7. Scan pipeline

```
Scheduler → Teleport → Wait Chunk Load → Verify Position → Run Monitors
→ Aggregate Results → Store Database → Publish Events → Next Job
```

## 8. Monitor interface

```ts
interface Monitor {
  id: string;
  supports(farm: FarmDefinition): boolean;
  execute(context: MonitorContext): Promise<Result>;
}
```

**Context:** Manager, Farm, Database, Configuration, Logger.
**Result:** events, metrics, alerts, attachments.

## 9. Event model

All events immutable:

```
ManagerConnected, ManagerDisconnected, ManagerTeleported,
ContainerScanned, ContainerChanged, StorageUpdated, ProductionUpdated,
WorkerVerified, WorkerMissing, ChunkLoaded, ChunkUnloaded,
EntityDetected, UnknownPlayerDetected, FarmHealthChanged,
AlertOpened, AlertResolved
```

## 10. Database

SQLite, normalized. Tables: `farms`, `workers`, `containers`, `container_items`,
`snapshots`, `metrics`, `health`, `alerts`, `entities`, `users`, `sessions`.
Indexes on timestamp, farm, container, alert, worker.

## 11. Storage scanning

Supported: Chest, Double Chest, Barrel, Shulker, Nested Shulker.

Scanner produces: capacity, occupied, fill %, item counts, nested counts, hash (used
for delta detection).

## 12. Production algorithm

```
Current Snapshot → Compare Previous Snapshot → Difference → Normalize Time
→ Rolling Average → Persist
```

No assumptions about farm type — production is inferred purely from storage deltas.

## 13. Health algorithm

Decision tree:

```
Manager Offline?        → UNKNOWN
Worker Missing?         → CRITICAL
Chunk Missing?          → CRITICAL
Storage Full?           → WARNING
Output Zero?            → WARNING
otherwise               → HEALTHY
```

Thresholds/behavior configurable.

## 14. Camera / Screenshot pipeline (removed)

Originally: a named per-farm waypoint system, a live Prismarine Viewer stream
following the manager, and a screenshot-capture pipeline
(`Teleport → Camera → Rotate → Wait → Capture → PNG → Persist → Publish`). Removed
— `prismarine-viewer` only ships bundled texture atlases/blockstates up to
Minecraft 1.21.4, and this server runs 1.21.11; blocks changed or added since
1.21.4 render with the wrong texture (visually "glitched"), with no upstream fix
available. See `docs/PROGRESS.md` for the full decision and root cause.

## 16. Discord adapter

Commands are converted into jobs. Example:

```
/scan iron → Create Scan Job → Scheduler → Result → Discord Reply
```

Discord never accesses Mineflayer directly.

## 17. REST API

**Read:** `GET /farms`, `/farms/{id}`, `/metrics`, `/alerts`, `/workers`, `/manager`.

**Commands:** `POST /scan`, `/reconnect`.

## 18. Configuration layout

```
config/
  farms.yml
  workers.yml
  alerts.yml
  manager.yml
  database.yml
  discord.yml
  dashboard.yml
  logging.yml
```

Validation: Zod → runtime types → internal models.

## 19. Folder layout (authoritative)

```
src/
  app/
    bootstrap.ts
  core/
    scheduler/
    event-bus/
    registry/
    config/
    logger/
  manager/
    connection/
    teleport/
    inventory/
  monitors/
    storage/
    production/
    workers/
    chunks/
    entities/
    health/
  services/
    metrics/
    alerts/
    persistence/
  integrations/
    discord/
    carpet/
  api/
    rest/
    websocket/
  dashboard/
  database/
  shared/
    models/
    dto/
    types/
    utils/
tests/
```

## 20. Recommended tech stack

| Layer            | Technology                |
| ---------------- | -------------------------- |
| Runtime          | Node.js 22 LTS              |
| Language         | TypeScript (strict mode)    |
| Package Manager  | pnpm                        |
| ORM              | Drizzle ORM                 |
| Database         | SQLite                      |
| Config           | YAML + Zod                  |
| Logging          | Pino                        |
| REST             | Fastify                     |
| WebSocket        | Socket.IO                   |
| Dashboard        | React + Vite + Mantine      |
| Charts           | Apache ECharts               |
| Minecraft        | Mineflayer                   |
| Testing          | Vitest                        |
| Linting          | ESLint + Prettier              |
| Containerization | Docker + Docker Compose         |

## 21. Coding standards

- Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` in
  TypeScript.
- Use dependency injection for services; avoid global singletons except the
  application bootstrap.
- Separate domain models from persistence models (don't expose ORM entities
  directly).
- Validate all configuration at startup with descriptive errors.
- Every async task should support cancellation (e.g. `AbortSignal`) so the scheduler
  can interrupt or reprioritize work.
- Use structured logging with correlation IDs (one per scheduled job) to trace
  operations across components.
- Design monitors to be idempotent: rerunning a scan should not produce side effects
  beyond a duplicate observation.

## 22. Future extensibility

Additional monitor plugins should slot in without core changes:

- Villager population and workstation validation
- Beacon status monitoring
- Redstone power state sampling
- Mob-cap monitoring
- Hopper throughput analysis
- Dimension-level statistics
- Server TPS and MSPT integration
- Prometheus metrics exporter

The core stays stable; new observability modules are added as independent plugins
implementing the common monitor interface. This keeps the project maintainable and
scalable as the technical server evolves.
