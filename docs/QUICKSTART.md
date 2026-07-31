# Quickstart

Full guide: `docs/USER_GUIDE.md`. Architecture: `docs/OVERVIEW.md`.

## 1. Install the mod

1. `mcfarmmanager-1.0.0.jar` → server's `mods/` folder.
2. Copy `MCFarmManager/config/farms.example.json` → `config/mcfarmmanager/farms.json`,
   edit in your real farm coordinates.
3. Start the server, confirm the log shows `MCFarmManager HTTP server listening on
   0.0.0.0:8642`.

## 2. Run the dashboard

```bash
cd dashboard
cp .env.example .env        # set COOKIE_SECRET
docker compose build
docker compose run --rm server npm run set-password -- <tu-contraseña>
docker compose up -d
```

Open `http://<host>:8080`, log in with the password you just set.

## 3. What you'll see

- **Resumen** — TPS, online players, open tasks at a glance.
- **Tareas** — task tracker.
- **Jugadores** — player roster, live online status.
- **Granjas** — live farm stats (entities, storage, chunk state) + your own notes.
- **Proyectos** — build log with photos.
- **Galería** — shared photo gallery.

## 4. If something's wrong

- No farm data on the dashboard → check `MCFARMMANAGER_URL` in `.env` and that the
  Minecraft server is running.
- Can't log in → re-run `npm run set-password -- <new-password>`.
- Farm rules not showing in-game → use `/mcfarmmanager <rule>`, not `/carpet <rule>`.

Never expose port `8642` (MCFarmManager) to the internet — it has no authentication.
