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
