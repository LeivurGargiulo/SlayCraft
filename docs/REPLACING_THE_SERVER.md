# Replacing the Minecraft server

How to swap `servers/fabric` for a different server — new modpack, new MC version, a
different loader (Forge/NeoForge/vanilla), or just a fresh world — without touching the
dashboard.

## What's coupled to the server vs. independent

**Coupled** (breaks or needs updating if you change server type/version):
- **MCFarmManager mod** — it's a Fabric mod built as a Carpet Extension. No Carpet, no mod.
  A Forge/NeoForge/vanilla/Paper server means MCFarmManager doesn't run at all — the
  Granjas view and `/farms`, `/world`, `/performance` data go away until you either find/build
  an equivalent for the new platform or accept losing that feature.
- **`farms.json`** anchors/coordinates — tied to the specific world, not the server jar. A
  new world (even same server software) needs these re-surveyed.
- **`servers/fabric/Dockerfile`** — pins Java 21 (`eclipse-temurin:21-jre-noble`) and expects
  `server.jar` at `/server`. Different MC version may need a different Java version.

**Independent** (dashboard doesn't care what's running the Minecraft server):
- Coordination Dashboard's own data — tasks, players, projects, gallery — none of it reads
  from the Minecraft server directly, only from MCFarmManager's API. If MCFarmManager is
  down or absent, those views just work with stale/no live data; nothing else breaks.
- Caddy, the domain, TLS — all in front of the dashboard, unaware the Minecraft server exists.

## Same platform, new version or modpack (Fabric + Carpet stays)

1. Back up `servers/fabric/world/` (and anything else you want to keep) before doing anything.
2. Replace `server.jar` with the new version's Fabric launcher jar.
3. Update mods in `servers/fabric/mods/` to versions compatible with the new MC version —
   check Fabric API, fabric-carpet, and **MCFarmManager itself** all have builds for it. If
   MCFarmManager doesn't support the new MC version yet, its `mod/` source is Gradle-based
   (see `MCFarmManager/mod/`) — a version bump there is a rebuild, not a rewrite, if the
   Carpet/Fabric APIs it uses haven't changed shape.
4. Re-check `eula.txt` (`eula=true` must be present) and `server.properties` — a fresh
   `server.jar` regenerates `server.properties` with defaults on first run, which will
   silently reset `motd`, `max-players`, `white-list`, etc. Diff against your old file and
   re-apply the values you actually want (see `CONFIGURATION.md §2`).
5. If it's a genuinely new world, re-survey farm coordinates and rewrite
   `MCFarmManager/config/mcfarmmanager/farms.json` from scratch — old anchors point at
   nothing in a new world.
6. `docker compose build mcserver && docker compose up -d mcserver` — rebuild picks up the
   new jar/mods since they're bind-mounted from `servers/fabric/`, not baked into the image,
   but a build still validates the Dockerfile/Java version still fits.

## Different platform (Forge/NeoForge/vanilla/Paper, or a hosted server)

1. Accept that MCFarmManager (and therefore the Granjas view, `/world`, `/performance`) stops
   working — there's no equivalent shipped for other platforms. Everything else (tasks,
   players roster, projects, gallery) keeps working since it's dashboard-owned data.
2. If the new server isn't Docker-managed by you (e.g. a hosted/rented server), you can drop
   the `mcserver` service from `docker-compose.yml` entirely — the dashboard doesn't depend
   on it existing in the same compose stack, only on `MCFARMMANAGER_URL` resolving *if* you
   still run MCFarmManager somewhere reachable.
3. Point `MCFARMMANAGER_URL` in `.env` at wherever (if anywhere) a live API replaces it, or
   leave the Granjas view showing connection errors if you're not replacing that
   functionality — it fails gracefully (see `USER_GUIDE.md §4` troubleshooting), it doesn't
   take the rest of the dashboard down.
4. Manually recreate the roster in Jugadores and re-point players at the new server's
   whitelist/ops separately — the dashboard's player list is its own data, not synced from
   any server file.

## What never needs to change

- `dashboard/` (server + client) — zero code changes for any of the above.
- `Caddyfile` / domain / TLS setup.
- `docker-compose.yml`'s `server`, `client`, `caddy` services and the `dashboard-data` volume.
