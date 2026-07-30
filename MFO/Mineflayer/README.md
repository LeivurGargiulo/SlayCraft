# Minecraft Farm Observatory (MFO)

Read-only observability platform for a Fabric technical Minecraft server — think
Prometheus + Grafana + CCTV for Minecraft farms. Not a gameplay automation mod.

Start here, in order:

1. `CLAUDE.md` — engineering rules and workflow for this repo.
2. `docs/ARCHITECTURE.md` — high-level design (source of truth).
3. `docs/TECHNICAL_SPEC.md` — implementation-level detail (authoritative where the two
   disagree).
4. `docs/PROGRESS.md` — what's actually built so far, decisions made along the way, and
   what the next phase needs to do.
5. `docs/DEPLOYMENT.md` — operator-facing: Docker, config/backup volumes, first login,
   troubleshooting. This README covers day-to-day development instead.
6. `docs/NEXT_STEPS.md` — what's left, split by audience: developer follow-ups, first-run
   checklist for a real deployment, and a production-deployment checklist for an agent.

## Requirements

- Node.js >= 22
- pnpm (via `corepack enable pnpm`; the pinned version is in `package.json`)

## Setup

```bash
pnpm install
```

`better-sqlite3`, `esbuild`, `canvas`, and `puppeteer` need native/postinstall build
scripts; approval is persisted in `pnpm-workspace.yaml` (`allowBuilds`), so a plain
`pnpm install` in this checkout won't prompt. A different clone/machine may need
`pnpm approve-builds` once.

Copy/edit the config files in `config/` before running against a real server —
`manager.yml` in particular has placeholder connection details.

Copy `.env.example` to `.env` and set `JWT_SECRET` (any long random string) — the REST
API and WebSocket layer require it at boot to authenticate requests. Dashboard/API users
are created with `pnpm create-user <username> <password> [admin|viewer]`; there's no
public registration.

Discord is off by default (`config/discord.yml` → `enabled: false`). To turn it on, set
`enabled: true` plus `guildId`/`notifyChannelId`, and set `DISCORD_BOT_TOKEN` in `.env`.
The token is never read from YAML.

## Running

```bash
pnpm dev      # tsx watch, runs src/app/bootstrap.ts directly (no build step)
pnpm build    # tsc -> dist/, then copies src/database/migrations/ into dist/
pnpm start    # node dist/app/bootstrap.js
```

On boot the app: loads and validates `config/*.yml` and `JWT_SECRET`, connects to the
Mineflayer manager (with exponential-backoff reconnect), builds the Farm Registry,
persists connection status to SQLite, wires up Production/Health/Alert/Auth services,
starts a periodic `ScanFarmJob` timer (`manager.yml` → `scan.intervalMs`), and starts the
REST API (`manager.yml` → `api.port`, default 3000, every route auth-guarded except
`POST /auth/login`) with a Socket.IO server attached to the same HTTP server. The Discord
adapter starts alongside them if enabled. See `docs/PROGRESS.md` for what's built, the
decisions behind it, and exactly where the next phase picks up.

### Dashboard

`src/dashboard/` is a separate React + Vite + Mantine + ECharts app, its own pnpm
workspace package. The backend serves its built `dist/` same-origin at `/` (see
`src/api/rest/server.ts`) whenever that directory exists — build it explicitly, the
backend's own `pnpm build` doesn't do this for you:

```bash
cd src/dashboard
pnpm dev       # http://localhost:5173, talks to the backend via VITE_API_BASE_URL
               # (defaults to http://localhost:3000) over CORS — the usual dev workflow
pnpm build     # tsc --noEmit -> vite build -> dist/, served by the backend if present
pnpm typecheck
pnpm lint
pnpm test      # vitest run, jsdom + @testing-library/react
```

### Docker

```bash
docker compose up -d --build
```

Builds both the backend and dashboard into one `node:22-bookworm` image and serves
everything from one port. See `docs/DEPLOYMENT.md` for config/data volumes, backups, and
first-login instructions.

## Quality gates

Backend (repo root):

```bash
pnpm typecheck
pnpm lint
pnpm format     # prettier --write
pnpm test       # vitest run
```

Dashboard (`src/dashboard/`, excluded from the root tsconfig/eslint — different
`lib`/`jsx`/module settings for a browser app):

```bash
pnpm typecheck
pnpm lint
pnpm test
```

All must be clean before considering a change done. The dashboard's test suite covers
auth and key pages/components with `@testing-library/react`; it doesn't replace actually
running both dev servers and checking in a browser for larger UI changes.

## Project layout

Folder layout follows `docs/TECHNICAL_SPEC.md` §19. Only the subtrees actually in use
exist right now — new folders get created when a feature that needs them is built, not
ahead of time.
