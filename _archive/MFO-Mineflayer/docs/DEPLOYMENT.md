# MFO — Deployment runbook

Operator-facing: how to configure, run, back up, and restore an MFO deployment. For how
the system is built and why, see `docs/ARCHITECTURE.md`/`docs/TECHNICAL_SPEC.md`; for
day-to-day development, see `README.md`.

## Running with Docker (recommended for a real deployment)

```bash
cp .env.example .env   # fill in JWT_SECRET (32+ chars) and DISCORD_BOT_TOKEN if Discord is enabled
# edit config/*.yml for your server before starting — manager.yml in particular

docker compose up -d --build
```

`docker-compose.yml` builds the image from the repo's `Dockerfile`, exposes:

- `3000` — REST API, WebSocket, and the dashboard (served same-origin from `/`)
- `3001` — the Prismarine live viewer (`manager.yml` → `screenshots.port`)

and mounts:

- `./config` into the container read-only — edit YAML on the host, `docker compose
  restart` to pick up changes (config is only read at boot)
- a named volume `mfo-data` onto `/app/data` — the SQLite database, screenshots, and
  scheduled backups all live under here and survive `docker compose down`/image rebuilds

`JWT_SECRET` is required; `docker compose up` fails fast with a clear error if it's unset
(see `docker-compose.yml`'s `${JWT_SECRET:?...}` interpolation) rather than starting a
container that immediately exits.

### First login

Create the first dashboard/API user from the host, against the running container:

```bash
docker compose exec mfo node dist/app/create-user.js <username> <password> [admin|viewer]
```

There is no public registration — this is the only way to create a user.

### Base image and native dependencies

`canvas` (screenshot pipeline) and `bcrypt` (auth) are native modules; `puppeteer` bundles
its own Chromium. The image is built from `node:22-bookworm` (not `-slim`) with the
Cairo/Pango/JPEG/GIF/RSVG build headers installed in the build stage (so `canvas` compiles
from source if no prebuilt binary matches the image's platform) and the corresponding
runtime shared libraries — plus everything Puppeteer's bundled Chromium needs to actually
launch headless — installed in the runtime stage. See the `Dockerfile` for the exact
package lists if a `docker build` ever fails on a missing shared library; that's the first
place to look.

## Running without Docker

```bash
pnpm install
cp .env.example .env   # fill in JWT_SECRET and DISCORD_BOT_TOKEN as above
pnpm build
pnpm start              # node dist/app/bootstrap.js
```

Same config/`.env` requirements as above. Building the dashboard's static assets is a
separate step — the backend only serves `src/dashboard/dist` same-origin if it exists:

```bash
pnpm --dir src/dashboard build
```

Without that, the dashboard isn't served at `/` — hit the REST API directly, or run the
dashboard's own dev server (`cd src/dashboard && pnpm dev`) against `VITE_API_BASE_URL`.

## Backups

`config/database.yml` → `backup` controls a scheduled `better-sqlite3 .backup()` (a
non-locking live copy, safe to run while the app is up) to a local directory, pruning down
to a fixed retention count:

```yaml
backup:
  enabled: true
  intervalMs: 21600000 # 6 hours
  directory: data/backups
  retainCount: 7
```

Backup files are named `mfo-<epochMillis>.sqlite`, sorted chronologically by filename —
the newest `retainCount` are kept on every run, the rest are deleted.

### Restoring

The app must be stopped first (SQLite can't be safely replaced out from under an open
connection):

```bash
docker compose stop mfo   # or: kill the non-Docker process
cp data/backups/mfo-<timestamp>.sqlite data/mfo.sqlite
docker compose start mfo  # or: pnpm start
```

There is no automated restore command — restoring is rare enough, and the failure mode of
an automated one picking the wrong backup silently is worse than a manual `cp`.

## Monitors (plugin toggle)

`config/manager.yml` → `monitors` controls which of `storage`/`entities`/`workers`/`chunks`
run during a scan; omit the key to run all four (default). This is a config toggle over
the existing statically-imported monitor set, not dynamic plugin loading — see
`docs/PROGRESS.md`'s Phase 6 entry for why that scope was chosen.

## Troubleshooting

- **Container exits immediately with a `JWT_SECRET` error** — set it in `.env` (32+
  characters); the app validates this at startup rather than failing confusingly later.
- **Screenshots/live viewer don't work** — `manager.yml` → `screenshots.directory` must be
  writable; this is also validated at startup with a descriptive error, not a raw
  `EACCES` stack trace.
- **A deep link into the dashboard 401s on refresh** (e.g. reloading `/farm/iron`) — the
  dashboard's client-side routes intentionally mirror the REST API's own path shapes
  (`/farm/:id`), so the server always resolves a matching API route first rather than
  falling back to the SPA shell. Navigate from the dashboard's own UI (client-side
  routing) rather than a hard refresh on a deep link; see `src/api/rest/server.ts`'s
  comment on this for the full reasoning.
