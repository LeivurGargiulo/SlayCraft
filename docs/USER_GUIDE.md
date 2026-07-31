# User guide — MCFarmManager + Coordination Dashboard

Full guide. For the short version see `docs/QUICKSTART.md`. For architecture/what's-built
see `docs/OVERVIEW.md`.

## 1. What this is

Your Fabric survival server (Carpet-enabled, MC 1.21.11) gets a read-only mod
(MCFarmManager) that watches your farms and reports live/historical stats over a small
JSON API. A separate web app (the Coordination Dashboard) reads that API and adds a task
tracker, player roster, project log, and build-photo gallery on top — one page the whole
group can open to see what's going on and what's next.

Nothing here can break your world. MCFarmManager never writes to the game: no block
breaking/placing, no item movement, no container interaction beyond reading slot contents
directly.

## 2. MCFarmManager — the mod

### 2.1 Installing it

1. Drop `mcfarmmanager-1.0.0.jar` into the server's `mods/` folder. Requires Fabric Loader
   ≥0.19.3, Fabric API `0.141.3+1.21.11`, fabric-carpet `1.21.11-1.4.194+v251223`, Java 21.
2. Create `config/mcfarmmanager/farms.json`. Copy `MCFarmManager/config/farms.example.json`
   as a starting point.
3. Start the server. Check the log for `MCFarmManager Carpet extension registered` and
   `MCFarmManager HTTP server listening on 0.0.0.0:8642` — that means it's up.

### 2.2 Configuring farms

Edit `config/mcfarmmanager/farms.json`. Each farm entry:

```json
{
  "id": "iron",                          // unique, used in URLs
  "name": "Iron Farm",                   // display name
  "dimension": "minecraft:overworld",    // or the_nether / the_end
  "anchor": { "x": 120, "y": 80, "z": -500 },   // farm's reference point
  "entityScanRadius": 32,                // how far around the anchor to count entities
  "fakePlayerName": "Worker-Iron",       // optional — Carpet fake player to watch for online status
  "storage": [
    { "id": "main-chest", "label": "Main output", "position": { "x": 123, "y": 79, "z": -501 } }
  ]
}
```

Malformed config (duplicate ids, missing fields, unknown dimension) fails loudly in the
log and disables the mod — it will never crash the server on a config error. Fix the JSON
and restart.

### 2.3 Mod-level settings (Carpet rules)

These aren't in `farms.json` — they're Carpet rules, set with `/mcfarmmanager <rule>
[value]` in-game or console (not `/carpet`, since each Carpet extension registers its own
rule namespace):

| Rule | Default | What it controls |
|---|---|---|
| `mcfarmmanagerEnabled` | `true` | master on/off switch — when `false`, HTTP server and sampler don't start |
| `mcfarmmanagerHttpPort` | `8642` | port the API listens on |
| `mcfarmmanagerHttpBindAddress` | `0.0.0.0` | bind address — keep this LAN-only, see §2.5 |
| `mcfarmmanagerSampleIntervalMinutes` | `5` | how often farm state is sampled into history |
| `mcfarmmanagerHistoryRetentionDays` | `30` | how long sampled history is kept before pruning |

Example: `/mcfarmmanager mcfarmmanagerSampleIntervalMinutes 10`

### 2.4 The API directly

You generally won't call this yourself — the dashboard does — but for debugging:

```bash
curl http://<server-host>:8642/status
curl http://<server-host>:8642/farms
curl http://<server-host>:8642/farms/iron
curl http://<server-host>:8642/farms/iron/history?range=7d
curl http://<server-host>:8642/players
curl http://<server-host>:8642/world
curl http://<server-host>:8642/performance
```

An unconfigured farm id returns HTTP `404` with a JSON error body.

### 2.5 Security note

MCFarmManager's API has **no authentication** — it trusts anything on the LAN that can
reach it. Never port-forward `8642` or otherwise expose it to the internet. Only the
dashboard server (or you, from the LAN, for debugging) should ever talk to it directly.

## 3. Coordination Dashboard — the web app

### 3.1 Running it (Docker, recommended)

```bash
cd dashboard
cp .env.example .env
# edit .env: set COOKIE_SECRET to a long random string,
# and MCFARMMANAGER_URL if the mod isn't reachable at host.docker.internal:8642
docker compose build
docker compose run --rm server npm run set-password -- <tu-contraseña>
docker compose up -d
```

Open `http://<host>:8080` (or whatever `DASHBOARD_PORT` you set). That's the whole group's
shared login — one password for everyone, set once above. To change it later, re-run the
`set-password` command and `docker compose restart server`.

Data (the dashboard's own SQLite database and uploaded images) lives in the
`dashboard-data` Docker volume — it survives `docker compose down` and rebuilds. It only
disappears if you explicitly remove the volume.

### 3.2 Running it without Docker (development)

```bash
cd dashboard/server && npm install
npm run set-password -- <tu-contraseña>
npm run dev        # http://localhost:3001

cd dashboard/client && npm install
npm run dev         # http://localhost:5173, proxies /api and /uploads to :3001
```

Server env vars: `PORT` (default `3001`), `MCFARMMANAGER_URL` (default
`http://127.0.0.1:8642`), `COOKIE_SECRET`, `DASHBOARD_DATA_DIR` (default `server/data/`).

### 3.3 The six views

Everything in the app UI is in Spanish; section names below are translated for this guide.

- **Overview (Resumen)** — the landing page. Live TPS and online-player count (straight
  from MCFarmManager), plus a count of open/blocked tasks. The one-glance "is everything
  OK" page.
- **Tareas (Tasks)** — the group's task tracker. Create tasks, add subtasks, mark status
  (open / blocked / done). Blocked tasks surface on the Overview page as a flag.
- **Jugadores (Players)** — your roster of players. Add a player by name; the page
  cross-references live against MCFarmManager's online-players list and shows "En línea"
  in real time for anyone actually connected.
- **Granjas (Farms)** — the farms from `farms.json`, with live entity counts, storage
  contents, and chunk-loaded status pulled from MCFarmManager. You can add your own notes
  to a farm from here (dashboard-owned metadata layered on top of the live data) — notes
  persist across page reloads.
- **Proyectos (Projects)** — a log of ongoing builds. Create a project, attach photos.
  Each project has its own detail page.
- **Galería (Gallery)** — a shared photo gallery with captions, independent of any
  specific project — general "look what we built" screenshots.

Logging out redirects to the login page; any direct navigation to a protected page while
logged out redirects there too — there's no way to see data without the password.

### 3.4 API reference (if you're scripting against it)

All routes below are under `/api` and require a valid session cookie (from `/api/login`)
except login itself.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/login` | authenticate with the shared password |
| POST | `/api/logout` | end session |
| GET | `/api/me` | session check |
| GET | `/api/farms`, `/api/farms/:id`, `/api/farms/:id/history` | proxied MCFarmManager data |
| PATCH | `/api/farms/:id/metadata` | set dashboard-owned notes on a farm |
| GET/POST/PATCH/DELETE | `/api/tasks`, `/api/tasks/:id`, `/api/tasks/:id/subtasks`, `/api/subtasks/:id` | task tracker CRUD |
| GET/POST/PATCH/DELETE | `/api/players`, `/api/players/:id` | player roster CRUD |
| GET | `/api/players/live` | proxied MCFarmManager online-players list |
| GET/POST/PATCH/DELETE | `/api/projects`, `/api/projects/:id`, `/api/projects/:id/images`, `/api/project-images/:id` | project log + photo CRUD |
| GET/POST/PATCH/DELETE | `/api/gallery`, `/api/gallery/:id` | gallery CRUD |
| GET | `/api/world`, `/api/performance`, `/api/status` | more proxied MCFarmManager data |

### 3.5 Backups

Everything the dashboard owns (tasks, players, projects, gallery, uploaded images) lives
in one SQLite file plus an `uploads/` folder — either `dashboard-data` (Docker volume) or
`DASHBOARD_DATA_DIR` (bare-metal). Back up that whole directory; there's no separate
export tool. MCFarmManager's own history is a separate SQLite file inside the Minecraft
world save (`<world save dir>/mcfarmmanager/history.sqlite`) — back it up with your normal
world backups if you care about long-term farm history.

## 4. Troubleshooting

- **Dashboard shows no farm data / "No se pudo conectar con MCFarmManager"** — the
  dashboard server can't reach the mod's API. Check `MCFARMMANAGER_URL`, check the
  Minecraft server is actually running, check `mcfarmmanagerEnabled` is `true`.
- **A farm shows zero entities/storage you know exist** — check the farm's `anchor` and
  `entityScanRadius` in `farms.json` actually cover the real farm's coordinates, and that
  `dimension` matches.
- **Can't log into the dashboard** — the password only gets set by running
  `npm run set-password` (or the Docker equivalent). There's no default password and no
  "forgot password" flow — re-run that command to reset it.
- **MCFarmManager rule commands don't show up** — use `/mcfarmmanager <rule>`, not
  `/carpet <rule>`. Each Carpet extension registers its own command namespace.
- **Docker: `better-sqlite3` / native module errors** — rebuild the image
  (`docker compose build --no-cache server`); the Dockerfile compiles it fresh against the
  image's own Node/glibc, so a stale layer is almost always the cause.

## 5. Security notes (read once)

- MCFarmManager's API (`:8642`) has no auth — LAN-only, never expose it publicly.
- The dashboard has one shared password for the whole group, not per-user accounts — treat
  it like a house key, not a personal login.
- Set a real `COOKIE_SECRET` in production (the dev default is not a secret).
- Neither service should be reachable from the public internet without you putting your
  own reverse proxy / VPN / firewall in front of them — none of this ships with that.
