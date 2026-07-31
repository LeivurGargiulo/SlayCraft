# SlayCraft server tooling — what's been built

Two projects, one purpose: give the server admin and players live visibility into a
Carpet-enabled Fabric survival server, plus a shared place to coordinate builds/tasks.

```
Minecraft server (Fabric + Carpet, 1.21.11)
  └─ MCFarmManager (mod)  ──HTTP:8642──►  Coordination Dashboard (server) ──HTTP──► players' browsers
       reads live world state                owns tasks/players/projects/gallery
       no writes, ever                       proxies MCFarmManager for live data
```

## 1. MCFarmManager (`MCFarmManager/`)

A server-side Fabric mod, built as a Carpet Extension. Read-only, full stop — no block
breaking/placing, no item movement, no interaction packets. Everything it does is
inspecting existing world state (`BlockEntity` inventory slots, entity lists, chunk state,
Carpet's own tick timing) and returning it as JSON.

**Why a mod and not a plugin/bot:** decided in `MFO/docs/adr/0001-*.md` — direct access to
server-internal state (chunk-loaded status, fake-player detection, tick timing) without the
overhead or fragility of a Mineflayer-style bot connection.

**Config:** `config/mcfarmmanager/farms.json` — a list of farms, each with an id, name,
dimension, anchor position, entity-scan radius, optional fake-player name to watch for
online status, and a list of storage container positions. Example at
`MCFarmManager/config/farms.example.json`. Mod-level settings (port, bind address, sample
interval, history retention) are Carpet rules, not a second config file — see the user
guide for the full table.

**HTTP API** (default `http://<server-host>:8642`):
| Endpoint | Returns |
|---|---|
| `GET /farms` | summary list of all configured farms |
| `GET /farms/{id}` | live detail: entities, storage contents, chunk-loaded, fake-player online |
| `GET /farms/{id}/history?range=` | sampled history for that farm (SQLite-backed) |
| `GET /players` | online players |
| `GET /world` | world/dimension state |
| `GET /performance` | TPS / tick timing, read from Carpet's own tracking |
| `GET /status` | mod version, MC version, Carpet version, uptime, farm count |

History is sampled on a timer (`mcfarmmanagerSampleIntervalMinutes`, default 5) into a
SQLite file at `<world save dir>/mcfarmmanager/history.sqlite`, pruned past
`mcfarmmanagerHistoryRetentionDays` (default 30 days).

**Status:** fully implemented, live-verified against the real server, deployed to
`servers/fabric/mods/`. Its own dashboard (originally planned) was superseded by project 2
below — see `MFO/docs/adr/0002-*.md`.

## 2. Coordination Dashboard (`dashboard/`)

A small self-hosted web app for the group: live server/farm visibility (proxied from
MCFarmManager) plus a task tracker, player roster, project log, and build-photo gallery
that the group owns directly. Single shared password, no per-user accounts. All
user-facing text is in Spanish.

- `dashboard/server/` — Fastify + better-sqlite3. Owns `tasks`, `players`, `projects`,
  `project_images`, `gallery` tables; proxies MCFarmManager for anything live (farms,
  players-online, world, performance, status).
- `dashboard/client/` — Vite + React + Tailwind, six views (see the user guide for what
  each does): Overview, Tareas, Jugadores, Granjas, Proyectos, Galería.

**Views → data source:**
| View | Backed by |
|---|---|
| Overview | live TPS/players from MCFarmManager + open task count |
| Tareas | dashboard's own `tasks`/`subtasks` tables |
| Jugadores | dashboard's own `players` table, cross-referenced live against MCFarmManager's online list |
| Granjas | MCFarmManager's `/farms` data, with dashboard-owned notes/metadata layered on top |
| Proyectos | dashboard's own `projects` table + uploaded images |
| Galería | dashboard's own `gallery` table + uploaded images and captions |

**Status:** fully implemented (19-task plan, `docs/superpowers/plans/2026-07-30-*`),
merged to `main`, security-reviewed, 14/14 tests passing. Docker/compose packaging
(`dashboard/docker-compose.yml`) added and verified end-to-end — build, first-run
password, login through the nginx→server proxy.

## Where things live

- `MCFarmManager/docs/SPEC.md` — MCFarmManager's canonical protocol/data model spec.
- `docs/superpowers/specs/2026-07-30-coordination-dashboard-design.md` — dashboard's design spec.
- `MFO/docs/adr/` — the two architecture decisions behind why these exist and how they split.
- `docs/USER_GUIDE.md` — full guide: install, config, day-to-day use, troubleshooting.
- `docs/QUICKSTART.md` — the short version.

## Explicitly not built (by design, not oversight)

Per each project's spec: authentication beyond the single shared dashboard password,
per-user roles/permissions, alerting/notifications (Discord etc.), multi-server support,
history for anything other than farms, MCFarmManager serving its own dashboard (see ADR
0002). If any of these come up, they're new scope, not a bug.
