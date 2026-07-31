# Configuration reference

Every knob in the stack, in one place. For install steps see `QUICKSTART.md`, for
day-to-day use see `USER_GUIDE.md`.

## 1. `.env` (repo root, gitignored)

Read by `docker-compose.yml`. Copy from `.env.example`.

| Var | Default | Notes |
|---|---|---|
| `COOKIE_SECRET` | — (required) | long random string; session signing. Compose fails to start without it. |
| `MCFARMMANAGER_URL` | `http://mcserver:8642` | dashboard server → mod. Only change if the mod runs outside this compose network. |
| `MCFARMMANAGER_API_TOKEN` | empty | must match the mod's `mcfarmmanagerApiToken` Carpet rule. Needed for farm create/edit/delete from the dashboard; GET routes work without it. |
| `DASHBOARD_PORT` | — | **currently unused** — Caddy owns 80/443 and reverse-proxies to `client`, which has no published port. Set it only if you add a direct port mapping for `client` in compose. |

## 2. `servers/fabric/server.properties`

Standard Minecraft server config. Ones worth checking before opening to more players:

| Key | Current value | Why it matters |
|---|---|---|
| `motd` | `Testing` | cosmetic, but a stray "Testing" MOTD is a production tell — change it. |
| `max-players` | `2` | raise if the group is bigger than 2. |
| `white-list` / `enforce-whitelist` | `true` / `true` | good — keep both `true` for a private server. |
| `online-mode` | `true` | keep `true` unless you have a specific offline-mode reason (cracked clients, etc). |
| `difficulty` | `normal` | gameplay choice, not a safety setting. |
| `rcon.password` | empty (rcon effectively off since no password) | fine as-is; only set if you actually use rcon. |

Whitelist itself: `servers/fabric/whitelist.json`, edit directly or use `/whitelist add <name>` in-game/console.

### Changing the Minecraft game port (`25564`)

Two places, both must agree:

1. `servers/fabric/server.properties` — `server-port=25564`.
2. `docker-compose.yml` — the `mcserver` service's port mapping: `"25564:25564"`.

Change both to the new port (host and container side can differ, e.g. `"25566:25564"` if you
want players connecting on `25566` — but keeping them identical is simpler and matches the
existing setup). Then `docker compose up -d mcserver` to apply.

If you forward this port on your router (see `router-port-forwarding.md`), update that
forwarding rule to the new host-side port too. Players connect with `<your-domain-or-IP>:<new-port>`.

## 3. `MCFarmManager/config/mcfarmmanager/farms.json`

One entry per farm — see `MCFarmManager/config/farms.example.json` and `USER_GUIDE.md §2.2`
for the shape. Malformed JSON disables the mod (logs the error, never crashes the server).

## 4. Mod-level settings (Carpet rules, not a file)

Set at runtime with `/mcfarmmanager <rule> [value]`. Full table in `USER_GUIDE.md §2.3`:
`mcfarmmanagerEnabled`, `mcfarmmanagerHttpPort`, `mcfarmmanagerHttpBindAddress`,
`mcfarmmanagerSampleIntervalMinutes`, `mcfarmmanagerHistoryRetentionDays`. These reset to
defaults on server restart unless persisted in `servers/fabric/config/carpet.conf`
(Carpet writes changed rules there automatically once set).

## 5. `Caddyfile` (repo root)

```
nyttlandmc.net.ar {
	reverse_proxy client:80
}
```

Domain is hardcoded. To change it, edit this line and `docker compose restart caddy` — Caddy
handles TLS (Let's Encrypt) automatically for whatever domain is listed here, as long as DNS
points at this host and ports 80/443 reach it. See `router-port-forwarding.md` for the
router side of that.

## 6. `docker-compose.yml`

Service-level things you might touch:

- **Ports published to the host**: only `mcserver` (`25564`, the Minecraft protocol port)
  and `caddy` (`80`, `443`). Everything else (`8642` mod API, dashboard's `3001`) is
  container-network-only — that's deliberate, don't add host port mappings for them.
- **Volumes**: `dashboard-data` (dashboard's SQLite + uploads — back this up),
  `caddy-data`/`caddy-config` (TLS certs — losing this just means Caddy re-issues on next
  start, not a backup priority).
- **`restart: unless-stopped`** on every service — survives host reboot, doesn't fight you
  when you deliberately stop something.

## 7. Security-relevant config, summarized

- MCFarmManager's API (`8642`) has no auth — never give it a host port mapping.
- Dashboard has one shared password (`npm run set-password`), no per-user accounts.
- `COOKIE_SECRET` must be a real random value in `.env` before going live — the repo ships
  no default.
- Whitelist + enforce-whitelist + online-mode all `true` — don't turn these off without
  understanding you're opening the server to anyone.
