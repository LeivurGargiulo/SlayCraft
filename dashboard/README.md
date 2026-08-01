# SlayCraft Coordination Dashboard

Two independent Node projects:
- `server/` — Fastify + better-sqlite3 API. Proxies MCFarmManager, owns tasks/players/projects/gallery.
- `client/` — Vite + React frontend.

## Run in development

    cd dashboard/server && npm install
    npm run set-password -- <tu-contraseña>
    npm run dev        # http://localhost:3001

    cd dashboard/client && npm install
    npm run dev         # http://localhost:5173, proxies /api and /uploads to :3001

## Environment variables (server)

- `PORT` — default `3001`.
- `MCFARMMANAGER_URL` — default `http://127.0.0.1:8642`. Never expose this port publicly; only the dashboard server should reach it.
- `COOKIE_SECRET` — set a real secret in production; defaults to a dev value.
- `DASHBOARD_DATA_DIR` — where `dashboard.sqlite` and `uploads/` live. Default: `server/data/`.

## Run with Docker

    cp .env.example .env   # set COOKIE_SECRET; adjust MCFARMMANAGER_URL if the mod isn't on the host
    docker compose build
    docker compose run --rm server npm run set-password -- <tu-contraseña>
    docker compose up -d

Dashboard: `http://localhost:8080` (or `$DASHBOARD_PORT`). `client` is nginx serving the built
React app and reverse-proxying `/api` and `/uploads` to the `server` container. `server` talks to
MCFarmManager via `MCFARMMANAGER_URL` (default assumes the mod runs on the Docker host, port
`8642`) and persists `dashboard.sqlite` + uploads in the `dashboard-data` named volume.
