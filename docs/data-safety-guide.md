# Data Safety Guide — Production Server Swap

Real world data. No restores from memory. Follow this before replacing the current server.

## 1. Storage: bind mount, not container fs

`docker-compose.yml` already does this right for `mcserver`:

```yaml
volumes:
  - ./servers/fabric:/server
```

World data lives on host at `./servers/fabric`, survives `docker rm`/rebuild. Verify before trusting it:

```bash
docker inspect mcserver --format '{{json .Mounts}}' | jq
```

Confirm `Source` points at the real host path, `Type` is `bind`.

**Never** let world data sit only inside the container's writable layer (no volume/mount). `docker compose down` / image rebuild wipes it.

## 2. Backup before touching anything

Before any `docker compose down/up`, image rebuild, or server swap:

```bash
tar czf /path/to/backups/fabric-$(date +%Y%m%d-%H%M%S).tar.gz -C /home/leivur/minecraft/servers/fabric world
```

Include `server.properties`, `ops.json`, `whitelist.json`, `banned-*.json` if those matter too — swap `world` for `.` to grab everything.

**Test the restore.** Untested backup = no backup:

```bash
mkdir -p /tmp/restore-test && tar xzf fabric-<ts>.tar.gz -C /tmp/restore-test
# spin up a throwaway container pointed at /tmp/restore-test, confirm world loads
```

Automate this on a schedule (cron + the tar command above, or rsync/restic to a second disk), keep multiple dated versions — not overwrite-in-place. A cron entry:

```
0 */6 * * * tar czf /backups/fabric-$(date +\%Y\%m\%d-\%H\%M).tar.gz -C /home/leivur/minecraft/servers/fabric world
```

Prune old backups on a retention schedule so disk doesn't fill.

## 3. Clean shutdown — flush world before stopping

RCON is currently disabled (`enable-rcon=false` in `server.properties`). Console is reachable via the container's stdin/tty (compose has `stdin_open: true` / `tty: true`), so flush the world manually before stopping:

```bash
docker attach mcserver
# in the console:
save-off
save-all flush
save-on
# Ctrl+P Ctrl+Q to detach without killing the process
docker compose stop mcserver
```

Compose now gives the JVM up to 60s (`stop_grace_period`, added below) to shut down cleanly on SIGTERM before Docker sends SIGKILL — a hard kill mid-autosave is a common cause of corrupted region files.

If you back up on a schedule instead of by hand, enable RCON (`enable-rcon=true`, set `rcon.password`, use `rcon.port=25553` already reserved) and script `save-off` / `save-all flush` / `save-on` via an RCON client before the tar command, then `save-on` after.

## 4. Version pinning

`servers/fabric/Dockerfile` builds from `eclipse-temurin:21-jre-noble` — a floating tag. Fine for the JRE base, but the actual Minecraft/Fabric server jar version is what matters for world format. Don't swap `server.jar` for a newer major version against production `world/` without a tested backup — world format upgrades are one-way.

## 5. Staged swap, not in-place

Don't point production compose straight at new server files:

1. Copy the *tested* backup (or current live `world/`) into a scratch directory.
2. Bring up the new server config against that scratch copy first (`docker compose -f docker-compose.test.yml up`, different port).
3. Confirm chunks, players, inventories load clean.
4. Only then repoint the real `mcserver` service / bind mount at the verified data, restart with the flush procedure from step 3.
5. Keep the old server's data directory around untouched (rename, don't delete) for a few days after swap before removing.

## 6. Ongoing

- Disk space alert — a full disk mid-save is a classic corruption cause. `df -h` the volume's disk on a schedule.
- Don't run `docker compose down -v` on this stack — no named volume holds world data today (it's a bind mount, safe from `-v`), but the `dashboard-data`, `caddy-data`, `caddy-config` named volumes would be deleted by `-v`. Use `docker compose down` (no `-v`) or `docker compose stop`.

## docker-compose.yml change

Added `stop_grace_period: 60s` to `mcserver` so Docker waits long enough for a clean JVM shutdown (autosave + world close) before SIGKILL:

```yaml
mcserver:
  build: ./servers/fabric
  hostname: mcserver
  stop_grace_period: 60s
  volumes:
    - ./servers/fabric:/server
  ports:
    - "25564:25564"
  stdin_open: true
  tty: true
  restart: unless-stopped
```

Skipped: RCON auto-enable, automated backup cron entry wired into the repo, off-site replication — add if manual flush/backup proves too error-prone in practice.
