# MFO — Implementation progress

> Status doc, not a design doc. `docs/ARCHITECTURE.md` and `docs/TECHNICAL_SPEC.md`
> remain the source of truth for *what MFO should be*; this file tracks *what has
> actually been built* and what a fresh session needs to know before continuing.
> Update it at the end of each phase (or meaningfully-sized chunk of work).

## Status: Phase 6 (Polish) — complete

All six Phase 6 sub-items (`docs/ARCHITECTURE.md`'s roadmap: plugin system, configuration
validation, backups, testing, documentation, Docker deployment) are built, plus the two
"also still open" items this phase's own scope naturally covered: `pnpm start`'s
missing-migrations-in-`dist/` bug (flagged since Phase 1) and same-origin dashboard serving
(flagged since Phase 5). Scope for all six sub-items was confirmed with the user before
implementation — genuinely no way to infer plugin-system depth, backup trigger/retention,
testing scope, or Docker base image from either doc, exactly as the previous session's
"Phase 6 entry points" section (below) flagged. 150 backend tests passing (10 new:
`manager.schema`'s `monitors` toggle, `startup-checks`, `BackupService`,
`selectStaleBackups`, `database.schema`'s `backup` block, dashboard static serving), clean
backend typecheck/lint/build; the dashboard package gained its first automated test suite
(11 tests: `@testing-library/react` + `jsdom`), also clean typecheck/lint/build.

## What's built (Phase 6 additions, on top of Phases 1–5)

| Area | Files | Notes |
| --- | --- | --- |
| Plugin system (config-driven toggle) | `src/core/config/schemas/manager.schema.ts`, `src/app/bootstrap.ts`, `config/manager.yml` | Confirmed scope: (b) from the three options the previous session raised — `manager.yml` → `monitors: [storage, entities, workers, chunks]` (default: all four), still statically imported in `bootstrap.ts` but filtered against config before being handed to `ScanFarmJob`. Not (c) dynamic `import()` loading — that's a materially bigger security/versioning surface nothing has asked for yet. |
| Configuration validation (startup checks) | `src/core/config/startup-checks.ts`, `src/app/bootstrap.ts`, `.env.example` | Confirmed scope: concrete startup checks, not speculative cross-file validation. `resolveJwtSecret` (unset or < 32 chars both rejected with a descriptive `ConfigValidationError`, not a raw crash) and `ensureWritableDirectory` (replaces the old bare `mkdirSync` call for `manager.screenshots.directory`) are pure, unit-tested functions; `bootstrap.ts`'s old `jwtSecretOrExit`/`loadConfigOrExit` collapsed into one `withConfigErrorExit` wrapper shared by all three checks (was about to become three near-identical `try/catch`-and-`process.exit` blocks otherwise). |
| Backups | `src/services/backup/{backup-service,select-stale-backups}.ts`, `src/core/config/schemas/database.schema.ts`, `config/database.yml`, `src/database/client.ts` (now also returns the raw `better-sqlite3` handle) | Confirmed scope: scheduled + retention, the only one of the three options with a real trigger/destination/retention answer. `BackupService` calls `sqlite.backup()` (non-locking, safe against a live connection) to `database.yml` → `backup.directory` on a `setInterval` (`backup.intervalMs`, default 6h), then prunes down to `backup.retainCount` (default 7) via the pure, separately-tested `selectStaleBackups`. No restore command — see `docs/DEPLOYMENT.md`'s reasoning (manual `cp` beats an automated command that could silently pick the wrong backup). |
| Testing (dashboard suite) | `src/dashboard/{vitest.config.ts,tests/**}`, new devDependencies `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` | Confirmed scope: the dashboard's zero-coverage gap, not the live-Discord-gateway or real-server e2e gaps (both still genuinely out of reach — no bot token or real Minecraft server in any environment used across all six phases). Covers `HealthBadge` (all 5 status values), `AuthContext`/`useAuth` (restore/login/logout), and `LoginPage` (fields render, failed-login error, success hides the form). Needed a `jsdom` `matchMedia` polyfill and an explicit `cleanup()` (no `test.globals: true` here, so testing-library's automatic per-test cleanup detection doesn't fire) — both in `tests/setup.ts`. |
| Documentation | `docs/DEPLOYMENT.md` | Confirmed scope: an operator-facing runbook, not also an OpenAPI spec (nothing has asked for machine-readable API docs yet). Covers Docker (build/run/volumes/first-login), non-Docker running, backup/restore, the monitor toggle, and a troubleshooting section for the startup checks above and the dashboard deep-link caveat below. |
| Docker deployment | `Dockerfile`, `docker-compose.yml`, `.dockerignore` | Confirmed scope: `node:22-bookworm` (not `-slim`), not a Chromium-vendor base image — keeps the image on a standard, well-documented Node base at the cost of explicitly listing apt packages for `canvas`'s Cairo/Pango/JPEG/GIF/RSVG build headers (build stage) and runtime shared libs, plus everything Puppeteer's bundled Chromium needs to launch headless (runtime stage) — see the Dockerfile's own comments for the exact lists. Multi-stage: build stage compiles the backend (`pnpm build`) and the dashboard (`pnpm --dir src/dashboard build`); runtime stage copies `node_modules`/`dist`/`src/dashboard/dist`/`config` only. **Not verified with an actual `docker build`** — Docker isn't installed in this sandbox; every command and path the image depends on (`pnpm build`, `pnpm --dir src/dashboard build`, the migrations-copy step, the dashboard-dist path bootstrap.ts/server.ts compute) was verified individually outside a container instead. |
| `pnpm start`/migrations-in-`dist/` fix | `tsconfig.build.json` (new), `scripts/copy-migrations.mjs` (new), `package.json`'s `build` script, `tsconfig.json` (unchanged, still used for typecheck/editor) | Folded into the Docker work per the previous session's own framing ("a real candidate for the Docker work to fix once and for all"). Root cause: `tsconfig.json`'s `include` spans both `src/**` and `tests/**`, so `tsc`'s computed `rootDir` was `.`, emitting `dist/src/...`/`dist/tests/...` — silently mismatching `package.json`'s `start` script (`node dist/app/bootstrap.js`) since Phase 1. `tsconfig.build.json` extends the main config with `rootDir: "src"` and `include: ["src/**/*.ts"]` (tests are never meant to ship, only typechecked); `scripts/copy-migrations.mjs` copies `src/database/migrations/` → `dist/database/migrations/` after `tsc` (raw `.sql` files were never part of the TS compilation output at all). Verified end-to-end: fresh `pnpm build` + `node dist/app/bootstrap.js` with a real `JWT_SECRET` now boots correctly (migrations ran, farm registry loaded, REST API listened) instead of throwing `Cannot find module`. |
| Same-origin dashboard serving | `src/api/rest/server.ts`, `src/api/rest/deps.ts`, `src/app/bootstrap.ts` | Flagged since Phase 5 ("natural to bundle with the Docker work"), done here. `createRestApi` now serves `deps.dashboardDistDirectory` (defaults to `src/dashboard/dist` relative to `process.cwd()`, same convention as `loadAppConfig`'s default `config` dir) at `/` when it exists, via a **second** `@fastify/static` registration (`decorateReply: false` — the first, for screenshots, already claims that decorator; a real gotcha in `@fastify/static`'s own docs). Bigger decision, found while implementing, not before: the existing auth `onRequest` hook had to move into its own encapsulated Fastify child context (`app.register((api) => {...})`) so it stops applying to the publicly-served dashboard bundle — a browser's first navigation request can't carry a Bearer header. Deliberately **no generic SPA catch-all fallback** (e.g. "unmatched GET → `index.html`"): the dashboard's client-side routes mirror the API's own path shapes (`/farm/:id`, etc. — `src/dashboard/src/App.tsx`), so a catch-all would silently shadow real API responses. Practical effect, documented in `docs/DEPLOYMENT.md`: in-app client-side navigation works normally, but a hard refresh on a deep link (`/farm/iron`) hits the API route (401) instead of the SPA shell — a known limitation, not a bug, and not worth an API path rename to fix. |

## Phase 6 decisions (this phase)

- **Plugin system: config-driven toggle, not dynamic loading** (confirmed) — `manager.yml`
  → `monitors` is a validated enum array over the existing four monitor ids; `bootstrap.ts`
  still statically imports every monitor class and just filters the array. Dynamic
  `import()`-based loading was explicitly on the table and explicitly not chosen — it's a
  materially larger surface (security, versioning, per-plugin error isolation) than
  anything else built across all six phases, with no third-party-monitor use case driving
  it yet.
- **Config validation: startup checks, not cross-file validation** (confirmed) — `JWT_SECRET`
  length and the screenshots directory's writability are concrete, already-flagged risks
  (a real secret vs. just non-empty; `EACCES` at `@fastify/static` registration time). Cross-
  referencing `alerts.yml` thresholds against `manager.yml`'s scan interval was raised as an
  option and explicitly deferred — no concrete failure mode has ever surfaced to justify it.
- **Backups: scheduled + retention over manual-only or shutdown-only** (confirmed) — the
  only option with a real, unattended trigger; `better-sqlite3`'s `.backup()` is
  non-locking so it's safe to run on an interval against a live connection, unlike a
  shutdown-only hook which offers no protection during a long uninterrupted run or a crash.
- **No automated restore command** (inferred, documented in `docs/DEPLOYMENT.md`) — restoring
  is rare enough, and the failure mode of a command silently picking the wrong backup file
  is worse than requiring a manual, deliberate `cp`. Revisit only if restores become routine.
- **Testing: dashboard suite only, not live-Discord-gateway or real-server e2e** (confirmed)
  — the other two gaps aren't closable without infrastructure (a bot token, a real Minecraft
  server) that no session across all six phases has ever had; explicitly not pretended away.
- **Documentation: an operator runbook, not also an OpenAPI spec** (confirmed) — nothing has
  asked for machine-readable REST docs yet; `docs/DEPLOYMENT.md` covers what an operator
  actually needs today (Docker, volumes, backup/restore, troubleshooting).
- **Docker base image: `node:22-bookworm`, not a Chromium-vendor base** (confirmed) — keeps
  the image on a standard, widely-documented Node base; the tradeoff is an explicit, longer
  apt package list for Cairo/Pango/JPEG/GIF/RSVG (canvas) and Chromium's runtime deps
  (Puppeteer) in both build and runtime stages, documented inline in the `Dockerfile`.
- **`docker build` was not actually run** — Docker isn't installed in this sandbox. Every
  command and path the image depends on was verified individually outside a container
  (`pnpm build`, `pnpm --dir src/dashboard build`, the migrations-copy script, and a real
  `node dist/app/bootstrap.js` run confirming boot + dashboard serving + API auth all work).
  Run an actual `docker compose up -d --build` once Docker is available before trusting the
  image fully — the apt package lists in particular are the most likely thing to need a
  tweak on a real build.
- **Same-origin dashboard serving needed its own encapsulated Fastify auth scope** (found
  while implementing, not decided up front) — the existing single `onRequest` hook applied
  process-wide would have 401'd the dashboard's own HTML/JS/CSS, which a browser's first
  navigation request can never authenticate. Moved every auth-guarded route (including the
  screenshots static plugin) into `app.register((api) => {...})`, an encapsulated child
  context, so the hook never reaches the dashboard's separate, outer-scope static
  registration.
- **No SPA catch-all fallback for the dashboard** (found while implementing) — the
  dashboard's client-side routes (`/farm/:id`, etc.) use the exact same path shapes as the
  REST API. A generic "unmatched GET → `index.html`" handler would have silently shadowed
  real API 404s/401s the moment same-origin serving landed. Chose the narrower, correct
  behavior (only `/` and real static assets are dashboard-served; API routes always win)
  over either breaking the API or renaming its public paths — documented as a known
  hard-refresh-on-deep-link limitation in `docs/DEPLOYMENT.md`, not silently patched over.
- **`pnpm start`'s dist-layout bug fixed via a second, narrower tsconfig** (confirmed
  reasonable given the previous session's own framing) — `tsconfig.build.json` rather than
  changing `tsconfig.json` itself, since `tsc --noEmit`/editor tooling still need `tests/**`
  and `drizzle.config.ts` included for typechecking; only the actual `dist/`-emitting build
  needed a narrower `rootDir`/`include`.

## Phase 5 additions (for reference)

| Area | Files | Notes |
| --- | --- | --- |
| `users` table + migration | `src/database/schema.ts`, `migrations/0002_violet_sunset_bain.sql` | `id`, `username` (unique), `passwordHash`, `role` (`admin`\|`viewer`, enum column), `createdAt`. No `sessions` table (TECHNICAL_SPEC §10 names one) — a stateless JWT needs nowhere to store server-side session state; revisit only if a refresh-token flow is ever added. |
| `AuthService` | `src/services/auth/auth-service.ts` | `login(username, password)` → bcrypt-compares, signs a JWT (`jsonwebtoken`) with `sub`/`username`/`role` claims, `jwtExpiry` from config (`dashboard.yml` → `7d` default). `verifyToken(token)` is shared verbatim by both the REST guard and the WebSocket middleware so the two surfaces can't drift. `hashPassword` is a static method the create-user script also uses. |
| `dashboard.yml` config | `config/dashboard.yml`, `src/core/config/schemas/dashboard.schema.ts` | Only `jwtExpiry` — everything else about auth (the secret) is a runtime env var, never YAML, same precedent as `DISCORD_BOT_TOKEN`. `JWT_SECRET` is required at boot now (`src/app/bootstrap.ts` exits with a descriptive error if unset) since auth is no longer opt-in the way Discord is. |
| REST auth | `src/api/rest/auth-routes.ts`, `server.ts` | `POST /auth/login` is the only unauthenticated route; a global `onRequest` hook checks `Authorization: Bearer <token>` via `AuthService.verifyToken` and 401s everything else, including the new routes below. |
| WebSocket auth | `src/api/websocket/server.ts` | `io.use(...)` middleware checks `socket.handshake.auth.token` with the same `AuthService.verifyToken` before allowing a connection — the dashboard passes it as `io(url, { auth: { token } })`. |
| `pnpm create-user` | `src/app/create-user.ts` | No public registration matches ARCHITECTURE's "username/password" framing, not a sign-up flow — `pnpm create-user <username> <password> [admin\|viewer]` bcrypt-hashes and inserts a row directly. |
| `ManagerMoved` event | `src/core/event-bus/events.ts`, `src/manager/teleport/teleport-service.ts` | `TeleportService.teleport` now takes an optional trailing `farmId` (both call sites — `CameraService.point`, `ScanFarmJob.run` — already had one) and publishes `ManagerMoved` (`position`, `dimension`, `farmId?`) once the server confirms, alongside its existing `forcedMove` wait. Republished over WebSocket like every other dashboard-facing event. |
| Screenshot serving | `src/api/rest/server.ts` (`@fastify/static` at `/screenshots/`), `farm-routes.ts` | `GET /farm/:id/screenshots` rows gained a `url` field (`ScreenshotService`'s on-disk path made relative to `manager.yml` → `screenshots.directory`, joined onto `/screenshots/`). Nothing before Phase 5 exposed screenshot bytes over HTTP at all — the dashboard's gallery is the first real consumer. Still behind the same auth guard, so the dashboard fetches these as authenticated blobs (`AuthedImage` component) rather than a bare `<img src>`, which can't carry a Bearer header. |
| Global `GET /alerts` | `src/api/rest/manager-routes.ts` | `getAlerts(db, farmId, limit)` already supported `farmId: undefined` for "every farm" — only `/farm/:id/alerts` used it before. The dashboard's Alerts page (open/acknowledged/resolved/history across all farms, per ARCHITECTURE.md) needed the cross-farm read Phase 4 never built a route for. |
| `GET /manager` → `viewerPort` | `src/api/rest/manager-routes.ts` | Static config (`manager.yml` → `screenshots.port`), not DB state, added to the response so the dashboard's Camera page can point its live-viewer iframe at `http://<api-host>:<viewerPort>/` without hardcoding it. |
| CORS | `src/api/rest/server.ts` (`@fastify/cors`) | `origin: true` (reflects the request origin) — the dashboard is a separately-hosted origin (Vite dev server on 5173, API on 3000), same permissive local/LAN-tool stance as the WebSocket layer's existing `cors: { origin: '*' }`. No cookies involved, so no credentials mode needed. |
| Dashboard package | `src/dashboard/` (own `package.json`/`tsconfig.json`/`vite.config.ts`/`eslint.config.js`) | React 19 + Vite + Mantine 9 + ECharts + React Router + `socket.io-client`, added as a second `pnpm-workspace.yaml` package. Excluded from the root `tsconfig.json`/`eslint.config.js` entirely (different `lib`/`jsx`/module settings than the Node backend) rather than trying to share one config across a Node app and a browser app. `pnpm dashboard` scripts: run from `src/dashboard/` directly (`pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`). |
| Dashboard pages | `src/dashboard/src/pages/*.tsx` | `LoginPage`, `OverviewPage` (farm cards: health/storage/production), `FarmPage` (storage table, ECharts production chart, recent alerts, camera links, screenshot gallery), `CameraPage` (live Prismarine Viewer iframe, waypoint buttons calling `POST /camera`, per-camera screenshot history), `AlertsPage` (global table with acknowledge), `WorkersPage`, `ManagerPage` (connection status + last `ManagerMoved`; "current task"/"queue depth"/latency explicitly noted as not yet exposed, not fabricated). Auth via `AuthContext` (JWT in `localStorage`, no refresh — a 401 anywhere clears it and drops back to `/login`). Live updates via a small `useSocketEvent` hook per page, not a global store. |

## Phase 5 decisions (for reference)

- **`users.role` is cosmetic, not enforced** (confirmed) — every authenticated route and
  Discord command behaves identically regardless of `admin`/`viewer`. The column exists so a
  future real permission split doesn't need a schema migration, but nothing branches on it
  yet.
- **Discord stays single-tier this phase** (confirmed) — no Admin/Viewer split added to
  `discord.yml`'s whitelist alongside the dashboard's role column, keeping this phase scoped
  to "Dashboard" per the roadmap rather than also revisiting the already-shipped Phase 4
  adapter.
- **Single long-lived JWT, no refresh flow** (confirmed) — `dashboard.yml` → `jwtExpiry`
  (default `7d`). Matches the "local/LAN read-only tool" framing already established for
  REST/WebSocket auth in Phase 4's decisions; a refresh-token flow's extra moving parts
  (rotation, revocation storage) aren't justified for a single-operator tool. Revisit if this
  is ever exposed past a trusted network.
- **No public registration; `pnpm create-user` instead** — inferred, not asked, since
  ARCHITECTURE's "Security" section names login, not sign-up, and a single-operator local tool
  has no natural self-registration flow. Small, reversible, matches the `DISCORD_BOT_TOKEN`
  precedent of "operational setup via CLI/env, not a UI."
- **Screenshots served as authenticated blobs, not `<img src>`** — inferred after hitting a
  concrete constraint: a bare `<img>` tag can't attach an `Authorization` header, and exempting
  `/screenshots/*` from the auth guard would mean anyone who can reach the port can view farm
  imagery without logging in, which the rest of this phase's auth work is explicitly trying to
  prevent. `AuthedImage` fetches with the header and renders a blob URL instead.
- **Dashboard is its own pnpm workspace package under `src/dashboard/`**, not a sibling
  top-level folder — TECHNICAL_SPEC §19's authoritative layout places `dashboard/` inside
  `src/`, and a real browser app's `tsconfig`/`eslint` needs (DOM lib, JSX, bundler module
  resolution) are different enough from the Node backend's that sharing one root config isn't
  practical — excluded from both rather than forced to fit.
- **No automated frontend test suite** — the backend's existing `vitest` setup targets Node;
  component-level testing would need `@testing-library/react`/`jsdom` added as new
  infrastructure, which nothing before this phase needed. Verified instead via `tsc`/`eslint`
  cleanliness on both packages plus a manual, non-browser smoke test of the full
  login → REST → CORS → alerts → screenshot-URL pipeline with `curl` (this sandbox has no
  Chrome and can't install one without root, so the actual rendered UI wasn't clicked through
  — do that locally with `pnpm dev` + `cd src/dashboard && pnpm dev` before trusting this
  fully).
- **Dashboard isn't served by the backend in production** — `pnpm dashboard build` produces
  `src/dashboard/dist/`, but nothing serves those static files yet; running the dashboard today
  means running its own dev server (or `pnpm preview`) pointed at the API via
  `VITE_API_BASE_URL`. Wiring `@fastify/static` to serve the built dashboard from the same
  origin as the API is Phase 6 ("Polish"/Docker) territory, not blocking anything Phase 5
  needed.
- **Bundle size warning (~1.6 MB unminified, ~510 KB gzipped) not addressed** — Mantine +
  ECharts + Socket.IO client in one chunk. Route-based code-splitting (`React.lazy` per page)
  would fix it; not done since nothing about this phase's scope needed it and a single-bundle
  local admin tool loading over LAN doesn't have the latency budget concerns that would justify
  it yet.

## Phase 4 additions (for reference)

| Area | Files | Notes |
| --- | --- | --- |
| Scan trigger | `src/app/bootstrap.ts` | `TeleportService`, `CameraService`, and `ScreenshotService` — built in Phase 2, never constructed — are now instantiated. A monitors array (`StorageMonitor`, `EntityMonitor`, `WorkerMonitor`, `ChunkMonitor`) is assembled once and shared by every `ScanFarmJob`. New `manager.yml` → `scan: { enabled, intervalMs }` drives a `setInterval` that enqueues one `ScanFarmJob` per farm; `enqueueScan(farm)` is a shared closure also handed to the REST/Discord layers so `POST /scan` and `/scan` don't duplicate the job-construction logic. |
| `AlertService.acknowledge()` | `src/services/alerts/alert-service.ts` | New method completing the alert lifecycle's `Open -> Acknowledged` step (TECHNICAL_SPEC's `Triggered -> Open -> Acknowledged -> Resolved -> Archived`) that Phase 3 left unbuilt for lack of a command source. Looks the alert up by id (not by the service's internal dedupe-key map, since REST/Discord only have the numeric id), moves `OPEN -> ACKNOWLEDGED` with `acknowledgedAt`, returns `false` for a missing/non-open id. Doesn't publish a new event — nothing downstream (WebSocket's republished event list, ARCHITECTURE's own list) names an `AlertAcknowledged` event, so the REST/Discord response itself is the only consumer for now. |
| Shared DB read helpers | `src/database/queries.ts` | Pulled out once both the REST API and the Discord adapter needed the exact same "latest health for farm", "latest storage batch", "recent alerts", etc. queries — CLAUDE.md's "no duplicated logic" rule, not a speculative abstraction. One function per read shape, explicit return types (drizzle's inferred row types), no query builder abstraction beyond that. |
| REST API | `src/api/rest/{server,deps,farm-routes,manager-routes,command-routes}.ts` | Fastify (`fastify: false` for its own logger; the app's own Pino logger is used for start/stop only — routes don't log every request). Nested `/farm/{id}/...` shape (confirmed): `/farms`, `/farm/:id`, `/farm/:id/{health,storage,production,metrics,alerts,screenshots,worker}`, plus `/manager` (TECHNICAL_SPEC §17 has this top-level read and nothing in the chosen nested shape conflicts with adding it) and `/farm/:id/worker` (same reasoning — the `workers` table has no other read path). `POST /camera`, `/scan`, `/alert/ack` enqueue jobs / call `AlertService.acknowledge` exactly like the Discord adapter does — zod-validated bodies, 404 for unknown farm/camera/alert, 202 + `correlationId(s)` for enqueued jobs (they run async; the scheduler doesn't return results). New `manager.yml` → `api: { host, port }` (default `0.0.0.0:3000`). No auth (confirmed with the user — Phase 5 scope, alongside the dashboard). |
| WebSocket | `src/api/websocket/server.ts` | Socket.IO attached to the REST API's own `http.Server` (`restApi.server`) — one process, one port, two protocols, not a second listener. Straight republish, no new computation: `FarmHealthChanged`, `AlertOpened`, `AlertResolved`, `ScreenshotCaptured`, `StorageUpdated`, `ProductionUpdated`, `WorkerVerified`, `WorkerMissing`. `ManagerMoved` (named in ARCHITECTURE's WS event list) is still not built — no internal event exists for it yet; `TeleportService`/`CameraService` still don't publish on teleport, only confirm via mineflayer's `forcedMove` internally. Flagged, not built — nothing consumes it yet. |
| Discord adapter | `src/integrations/discord/discord-bot.ts`, `src/core/config/schemas/discord.schema.ts`, `config/discord.yml` | `discord.js`. Commands: `/farm`, `/storage`, `/camera`, `/health`, `/production`, `/alerts` (also `ack:<id>` to acknowledge — the natural place Phase 3 flagged for this, since Discord/REST are the first command sources to exist), `/workers`, `/scan`, `/help`. `/dashboard` (in ARCHITECTURE's command list) is skipped — the dashboard doesn't exist yet, Phase 5. Notifications subscribe to `AlertOpened`/`FarmHealthChanged`/`ScreenshotCaptured` and post to `discord.yml` → `notifyChannelId` if configured (logged and skipped, not an error, if not). Commands register per-guild (`discord.yml` → `guildId`) for fast propagation, or globally if omitted. **Bot token is read from `process.env.DISCORD_BOT_TOKEN`, never from YAML** — `discord.yml` holds only non-secret settings; `.env` is loaded via Node's built-in `process.loadEnvFile()` (ENOENT swallowed, everything else rethrown) rather than adding a `dotenv` dependency. `enabled: false` by default (`config/discord.yml` ships that way) so a fresh checkout doesn't need a bot token to run. Whitelist (`discord.yml` → `whitelist: string[]`) defaults to empty = unrestricted, a deliberate first-run-usability default, not a "secure by default" one — documented inline in both the schema and the shipped config; operators should populate it before exposing the bot. |
| Live Viewer | *(no new code)* | Already exposed — `ScreenshotService` has attached a Prismarine Viewer to the bot at `http://localhost:<manager.screenshots.port>/` since Phase 2. Nothing in Phase 4 needed to build this; ARCHITECTURE's "Live Viewer" is just that URL, not yet surfaced through the REST API or a dashboard (Phase 5). |
| Scheduler typing | `src/core/scheduler/{job,scheduler}.ts` | `Scheduler.enqueue` was typed to only accept `Job<void>`, which made `CaptureScreenshotJob` (a `Job<string>`, returns the captured file path) — unenqueued since Phase 2 for exactly this reason among others — impossible to enqueue from REST/Discord. Widened to `Job<unknown>`; the scheduler already discards `job.run()`'s return value (`await job.run(context)` in `runJob`), so this is a type-accuracy fix, not a behavior change. |

Run `pnpm test` for the full suite (33 files, 121 tests). `pnpm typecheck && pnpm lint &&
pnpm build` are clean.

## Phase 3 additions (for reference)

| Area | Files | Notes |
| --- | --- | --- |
| Persistence for Phase 2 events | `src/services/persistence/{container-snapshot,entity-observation,screenshot}-listener.ts` | One row per event, following `manager-status-listener.ts`'s established subscribe/write/return-unsubscribe pattern. `container_snapshots` stores the full `items` array as `itemsJson` (matches TECHNICAL_SPEC §5's `Snapshot.items`) plus a derived `totalItemCount` Production reads. No `hash` column — TECHNICAL_SPEC §11 mentions one for delta detection, but nothing in this phase's scope consumes it; skipped rather than built unused, note it here if a future consumer needs cheap change detection. |
| Worker config | `src/core/config/schemas/farms.schema.ts`, `farm-definition.ts`, `farm-registry.ts` | New optional per-farm `worker: { position?, toleranceBlocks }` in `farms.yml`, falling back to the farm's teleport point when omitted — same fallback precedent already established for cameras. Inferred rather than confirmed: TECHNICAL_SPEC's config layout lists a separate top-level `workers.yml`, but ARCHITECTURE's own `farms.yml` example already embeds `carpetWorker` inline: extending the existing farm block keeps one config file instead of introducing a second, matching the already-precedented camera/entities inference pattern. |
| Worker Monitor | `src/monitors/workers/worker-monitor.ts` | Looks for a `type: 'player'` entity named `farm.carpetWorker` in `bot.entities` (already dimension-scoped by the post-teleport scan). Missing → `WorkerMissing`. Present → `WorkerVerified` with `atExpectedPosition` (distance vs. `toleranceBlocks`) and `alive` (`entity.health > 0`, or `true` when the server doesn't report health for fake players — optional field, undefined-safe). No separate dimension check: the Manager already teleported into `farm.dimension` before any monitor runs, so the entity's mere presence in `bot.entities` after that teleport is the only dimension signal available without extra out-of-scope teleports. |
| Chunk Monitor | `src/monitors/chunks/chunk-monitor.ts` | Checks target (farm teleport), worker (expected position), and every storage container position via `bot.blockAt(...) !== undefined` — reusing the exact "no loaded block" contract `StorageMonitor` already established, rather than `prismarine-world`'s async `getColumn`, which would actively request the chunk rather than just check it. Any unloaded position → single farm-level `ChunkUnloaded` (with the list of which positions failed); all loaded → `ChunkLoaded`. No DB table — chunk state is transient scan input for Health, not itself in either doc's persisted-table list. |
| Production Service | `src/monitors/production/production-service.ts` | Not a bot-facing `Monitor` (no `execute(context)`/`supports()`) despite living under `monitors/production/` per the authoritative folder layout — same kind of placement-vs-interface distinction already noted for `monitor.ts` itself in Phase 2. Subscribes to `StorageUpdated` (the natural "this farm's scan cycle just finished" signal already fired by `StorageMonitor`); pulls the most-recently-inserted `containerCount` `container_snapshots` rows for that farm as the current batch, and the `containerCount` rows before that as the previous batch (ordering by autoincrement `id`, reliable since the single-flight Scheduler never interleaves two farms' scans). Sums `totalItemCount` per batch — deltas are whole-farm totals, not per-item-type, matching PROGRESS.md's own Phase 3 entry-point wording ("inferred purely from storage deltas") and TECHNICAL_SPEC §12's "no assumptions about farm type." First-ever scan for a farm has no prior batch → silently produces no `ProductionUpdated` (there's nothing to diff against, not an error). Rolling average is the last 10 `itemsPerHour` samples (constructor-overridable, not config — no one asked for it to be tunable in `alerts.yml`/`manager.yml`, so it isn't). |
| Health Service | `src/monitors/health/farm-health.ts` (pure `computeFarmHealth`), `src/monitors/health/health-service.ts` (stateful) | `FarmHealthStatus` now lives in `shared/types/farm-health.ts` as a 5-member union (`UNKNOWN \| OFFLINE \| CRITICAL \| WARNING \| HEALTHY`) — see "Decisions" below for the ARCHITECTURE/TECHNICAL_SPEC conflict this resolves, confirmed with the user. `computeFarmHealth` is a pure function unit-tested directly (7 branch tests) per CLAUDE.md's "separate business logic from infrastructure." `HealthService` holds one `FarmHealthInput` per farm in memory, updated by subscribing to `WorkerVerified/Missing`, `ChunkLoaded/Unloaded`, `StorageUpdated`, `ProductionUpdated` (per-farm) and `ManagerConnected/Disconnected` (fans out to every farm via the injected farm-id list from `FarmRegistry`). Recomputes on every relevant event but only persists/publishes `FarmHealthChanged` when the result actually changed — avoids a `health` row per scan when nothing changed. |
| Alert Service | `src/services/alerts/alert-service.ts`, `src/core/config/schemas/alerts.schema.ts`, `config/alerts.yml` | New `alerts.yml` (`storageWarningPercent: 90`, `storageFullPercent: 100`) — the only two thresholds ARCHITECTURE's alert list needs that aren't already fully determined by Health's fixed decision tree. `storage_warning`/`storage_full` come directly from `StorageUpdated` (Health's own storage-full check is hardcoded at 100% per the literal §13 tree and intentionally not reused here — decoupled on purpose so the alert threshold stays configurable without touching Health's algorithm). `worker_missing`/`chunk_unloaded`/`production_stopped` come from `FarmHealthChanged`'s `reason` field — Alert consumes Health's output for these, matching ARCHITECTURE's own pipeline diagram (`... → Health Service → Alert Service → Discord`), not the raw Worker/Chunk events directly. `manager_disconnected` is the one genuinely farm-agnostic alert type; `alerts.farmId` is nullable specifically for it — a deliberate, documented deviation from TECHNICAL_SPEC §5's `Alert{farm}` (non-optional), since a global manager-level alert has no single farm to attach to. `unexpected_player`/`unexpected_entity` open (idempotently, keyed by farm+type+identity) but never auto-resolve — there's no "entity/player no longer present" signal from `EntityMonitor` to resolve them against without inventing a new "scan complete" event, which nothing else needs yet; each remains OPEN until something acknowledges/resolves it — Phase 4's `AlertService.acknowledge()` + Discord/REST now provide that. |
| New tables | `src/database/schema.ts`, `src/database/migrations/0001_unknown_fantastic_four.sql` | `container_snapshots`, `entities`, `screenshots`, `workers` (one row per farm, upserted like `manager_status`), `production`, `health` (append-only, one row per actual transition), `alerts` (nullable `farm_id`). Table/column names follow TECHNICAL_SPEC's naming where the two docs disagree (its own header calls itself "authoritative for implementation details"), but denormalized rather than literally matching either doc's table list: no separate `containers` reference table (containers are static config, not runtime-created/deleted state) and no normalized `container_items` (an `items_json` text column instead) — avoiding tables/joins nothing in this phase's scope queries. Indexes on `farm_id`, `occurred_at`/timestamp columns, and `alerts.state`, per TECHNICAL_SPEC §10. |
| New events | `src/core/event-bus/events.ts` | `WorkerVerified`, `WorkerMissing`, `ChunkLoaded`, `ChunkUnloaded`, `ProductionUpdated`, `FarmHealthChanged`, `AlertOpened`, `AlertResolved` — added to `AppEventMap` in the same change as their producer, per the Phase 1/2 precedent. |
| Bootstrap wiring | `src/app/bootstrap.ts` | All four new persistence listeners plus `ProductionService`, `HealthService` (given every farm id from `FarmRegistry`), and `AlertService` (given `config.alerts`) are constructed and `.register()`'d at startup — same as Phase 1's `registerManagerStatusPersistence`. `ScanFarmJob` was still never constructed or enqueued anywhere at the end of this phase — Phase 4 built that. |

## Phase 2 additions (for reference)

| Area | Files | Notes |
| --- | --- | --- |
| Farm Registry | `src/core/registry/` | `FarmRegistry` builds immutable `FarmDefinition[]` from validated `FarmsConfig` once at construction. Camera positions without an explicit config value fall back to the farm's teleport point (confirmed with the user). |
| Teleport | `src/manager/teleport/` | `TeleportService.teleport(position, dimension, signal?)` — `bot.chat('/execute in minecraft:<dim> run tp @s x y z')` (requires Manager to be server-OP), confirmed via mineflayer's `forcedMove` event rather than a fixed delay. Queries `connection.getBot()` fresh every call (never caches — the bot instance is replaced on every reconnect). |
| Monitor contract | `src/monitors/monitor.ts` | `Monitor` interface (TECHNICAL_SPEC §8): `id`, `supports(farm)`, `execute(context) -> MonitorResult`. Lives at the top of `monitors/`, not `core/` or `shared/types/` as `PROGRESS.md` once speculated — it depends on `FarmDefinition`/`AppEventMap`/`Logger`, so putting it in `shared/` would invert the layering. |
| Storage Scanning | `src/monitors/storage/` | `StorageMonitor` opens each configured container, reads it via mineflayer's `Window`, closes it. Capacity comes from the live `Window.inventoryStart`, not a per-type lookup table — ground truth from the game beats a config guess. Nested shulker-box contents are **flat** (a shulker item is one line item, not expanded) — `prismarine-item`'s 1.20.5+ component support is an acknowledged `// TODO: properly implement...` upstream, so there's no reliable API to recurse into yet. |
| Entity Scanning | `src/monitors/entities/` | `EntityMonitor` scans a per-farm-configurable radius (`farms.yml` → `entities: { radius, allow }`, new schema field) around the farm's teleport point. The farm's own Carpet worker (by username) and the Manager itself are always implicitly expected; everything else is checked against the farm's `allow` list (mob/object type names). Any non-worker player triggers `UnknownPlayerDetected`. |
| Camera Presets | `src/manager/camera/` | `CameraService.point(farm, camera, signal?)` — teleports to the camera's position, then `bot.look(yaw, pitch, true)` (config yaw/pitch are degrees, converted to radians). No capture — that's Screenshots. |
| Screenshots | `src/manager/screenshot/` | `ScreenshotService` owns one Prismarine Viewer instance (re-)attached to the bot on `ManagerConnected`/detached on `ManagerDisconnected`, and one headless Puppeteer page pointed at it (launched lazily, reused across captures). `CaptureScreenshotJob` = point camera → wait `renderWaitMs` → `page.screenshot()` → write PNG to `<directory>/<farmId>/<cameraId>-<timestamp>.png` → publish `ScreenshotCaptured`. New `manager.yml` → `screenshots: { port, directory, renderWaitMs }` config block. |
| New events | `src/core/event-bus/events.ts` | `ContainerScanned`, `StorageUpdated`, `EntityDetected`, `UnknownPlayerDetected`, `ScreenshotCaptured` — added to `AppEventMap` in the same change as their producer, per the Phase 1 precedent. No DB persistence listeners for any of them yet (see Decisions). |
| New dependencies | `package.json` | `vec3` (block positions for `bot.blockAt`), `prismarine-entity` (types only, dev dep), `prismarine-viewer` + `puppeteer` + `canvas` (screenshot pipeline — see Decisions for the `canvas` surprise). |

## Phase 3 decisions (for reference)

- **Health state model: 5 states, reconciled** — ARCHITECTURE.md lists
  `UNKNOWN → OFFLINE → CRITICAL → WARNING → HEALTHY`, but TECHNICAL_SPEC.md §13's literal
  decision tree only ever outputs 4 (`Manager Offline? → UNKNOWN`, never a distinct OFFLINE).
  This was a real conflict between the two canonical docs affecting a type both Health and
  Alert build on, so it was confirmed with the user rather than picked silently: manager
  offline now maps to `OFFLINE`, and `UNKNOWN` is reserved for a farm that's never been
  scanned yet (i.e. `workerPresent` still undefined in `FarmHealthInput`). See
  `shared/types/farm-health.ts`.
- **Worker config extends `farms.yml` rather than adding a `workers.yml`** — same kind of
  doc mismatch as above (TECHNICAL_SPEC's config layout names a separate file; ARCHITECTURE's
  own example embeds `carpetWorker` inline) but inferred rather than asked, since it's
  additive/reversible and directly mirrors the already-confirmed camera-position-fallback
  precedent from Phase 2, not a new pattern needing its own sign-off.
- **DB table/column naming leans on TECHNICAL_SPEC over ARCHITECTURE** where the two disagree
  (`container_snapshots`+`container_items`+`snapshots` vs. ARCHITECTURE's simpler
  `container_snapshots`/`production`) — TECHNICAL_SPEC's own header declares itself
  "authoritative for implementation details," and the actual schema built is denormalized
  further still (no `containers` reference table, no separate `container_items`; a single
  `container_snapshots` row per container-scan with an `items_json` column) since nothing in
  this phase's scope queries item-level rows independently of their parent scan. Flagged here
  rather than blocked on, matching the bar set by Phase 2's Monitor-interface-placement
  precedent: naming/normalization calls are inferred and documented, not asked.
- **`alerts.farmId` is nullable**, a deliberate deviation from TECHNICAL_SPEC §5's
  `Alert { farm, ... }` (non-optional) — `manager_disconnected` is a genuinely farm-agnostic
  alert (the Manager is a singleton, not scoped to one farm) and the domain model doesn't
  anticipate that case. Reasonable single-field inference, not asked.
- **`unexpected_player`/`unexpected_entity` alerts don't auto-resolve** — every other alert
  type has a natural "current state" signal on each scan cycle to resolve against
  (`StorageUpdated`'s fill percent, `FarmHealthChanged`'s reason), but `EntityMonitor` only
  ever reports entities *currently* detected, never "no longer present." Building that would
  mean inventing a new "entity scan complete" event nothing else needs. These alerts open
  once (idempotently) and stayed OPEN until a command source existed to acknowledge them —
  Phase 4 built that (`AlertService.acknowledge()` + Discord `/alerts ack:<id>` + REST
  `POST /alert/ack`), though they still don't *auto*-resolve; manual acknowledgement is as far
  as it goes.
- **`ScanFarmJob` (and Teleport/Camera/Screenshot jobs) were still never enqueued anywhere
  at the end of this phase.** `WorkerMonitor`/`ChunkMonitor` existed and were ready to slot
  into a `ScanFarmJob`'s `monitors` array, but nothing yet triggered a scan on a timer or via
  command. Phase 4 built that wiring (periodic timer + Discord `/scan` + REST `POST /scan`).

## Phase 2 decisions (for reference)

- **DB persistence was deferred to Phase 3, on purpose.** Every new monitor/service in Phase
  2 published events but wrote nothing to SQLite at the time — no `containers`,
  `container_snapshots`, `entities`, or `screenshots` tables existed yet. This mirrored the
  Phase 1 "add only what's needed now" precedent and was confirmed with the user before
  starting Storage Scanning. Phase 3 ("Health & Metrics") is where historical snapshots,
  production calculations, and the Alert Engine consumed these events and needed real tables.
- **Screenshot files are written to disk immediately** — unlike the structured
  metrics/history data above, the PNG *is* the artifact; without writing it somewhere the
  feature does nothing observable. The `screenshots` DB table for indexing/serving history
  via the REST API was built in Phase 3; the raw capture-and-save mechanism was Phase 2's.
- **Teleport mechanism** (`/execute in minecraft:<dim> run tp @s x y z` via chat, requiring
  server-OP) was a genuine ambiguity — mineflayer has no teleport packet — and was confirmed
  with the user rather than guessed.
- **Nested shulker-box parsing is flat for now**, confirmed with the user after hitting a
  concrete blocker: `prismarine-item`'s own source marks 1.20.5+ item-component support
  (needed to read a shulker's contents off the item stack, the server runs 1.21.11) as
  `// TODO: properly implement...` — no reliable upstream API to build on. Revisit if/when
  that lands, or if hand-rolling protocol decoding is ever worth it as its own effort.
- **Screenshots needed a real dependency decision**, confirmed with the user:
  `prismarine-viewer` (already TECHNICAL_SPEC §20's chosen tech) only serves a live 3D scene
  over a local web page — getting a static PNG out of it means driving a headless browser.
  Went with Puppeteer (bundled Chromium, ~300MB, required `pnpm approve-builds puppeteer`).
  **Surfaced mid-implementation, not anticipated up front**: simply `import`-ing
  `prismarine-viewer` at all (regardless of which of its four exports you actually use)
  unconditionally requires the native `canvas` package — undeclared in prismarine-viewer's
  own `package.json`, not even as optional. `canvas` installed cleanly here via a prebuilt
  binary (`pnpm approve-builds canvas`, no local Cairo/Pango compile needed on this
  platform), but that's environment-dependent — a different OS/arch without a matching
  prebuild would need real native compilation. Worth a sanity check before this is ever
  containerized (Phase 6, "Polish"/Docker).
- **`ScreenshotService` owns exactly one Prismarine Viewer instance and one headless page**,
  re-attached/detached on `ManagerConnected`/`ManagerDisconnected` rather than started fresh
  per capture — per TECHNICAL_SPEC §15 ("Prismarine Viewer... single instance"). Matches the
  same "bot instance changes on reconnect" problem `TeleportService` already solves, just
  reacting via the event bus instead of querying on demand (`viewer(bot, ...)` binds a whole
  HTTP server to the bot, so it can't be queried lazily the way `getBot()` is).
- **Per-farm entity `allow` list is new `farms.yml` schema** (`entities: { radius, allow }`),
  inferred rather than confirmed — `ARCHITECTURE.md`'s "Entity Scanner" section describes
  this requirement in prose but the example config doesn't show a concrete shape. Reasonable
  inference per `CLAUDE.md`'s "infer the most maintainable solution," not asked about
  directly since (unlike the teleport mechanism or shulker NBT) it didn't require external
  API knowledge to resolve — flagged here instead per the "explain important decisions" step.

## Phase 4 decisions (for reference)

- **REST route shape confirmed: nested `/farm/{id}/...`** (ARCHITECTURE.md) over
  TECHNICAL_SPEC §17's flatter top-level alternative — a real doc conflict per CLAUDE.md's
  rule, asked rather than picked silently. `/manager` and `/farm/:id/worker` were added on
  top of the literal ARCHITECTURE list since TECHNICAL_SPEC names both reads and neither
  conflicts with the chosen nesting — small, table-justified additions, not speculative
  scope creep.
- **Scan trigger confirmed: periodic timer *and* Discord `/scan`** (both, not either/or) —
  matches ARCHITECTURE's scheduler priority list naming both "periodic scan" and "user
  command" as distinct trigger sources. REST's `POST /scan` reuses the same `enqueueScan`
  closure as Discord rather than each adapter building its own job-construction logic.
- **API auth confirmed: none yet, deferred to Phase 5** — matches ARCHITECTURE's own phase
  split (auth assigned to "Dashboard") and the "local/LAN read-only tool" framing. The REST
  API and WebSocket layer are unauthenticated; anyone who can reach the port can read
  everything and trigger scans/screenshots/acknowledgements. Acceptable for the stated local
  deployment target, **not** acceptable to expose past a trusted network without Phase 5's
  JWT/bcrypt layer landing first.
- **Discord library: `discord.js`** — the only real candidate; TECHNICAL_SPEC §20's stack
  table doesn't pin one, so this was surfaced rather than silently assumed even though there
  wasn't a genuine second option to weigh it against.
- **Discord whitelist defaults to unrestricted (empty array = anyone can run commands)** —
  inferred, not asked, since ARCHITECTURE's "whitelist by user ID" requirement doesn't specify
  a default for the unconfigured case. Chose usability-first (a freshly `enabled: true` bot
  works immediately) over secure-by-default, documented in both the zod schema's comment and
  the shipped `config/discord.yml`. Revisit if this ever ships past a trusted local setup.
- **`AlertService.acknowledge()` doesn't publish a new event** — ARCHITECTURE's WebSocket
  event list and TECHNICAL_SPEC §9's event model don't name an `AlertAcknowledged` event, and
  nothing yet needs a live push for it (the REST/Discord response is synchronous and
  sufficient). Add one if the dashboard (Phase 5) ever needs to reflect acknowledgement
  without polling.
- **`Scheduler.enqueue`'s type signature was widened from `Job<void>` to `Job<unknown>`** —
  a pre-existing type-accuracy bug, not new design: `CaptureScreenshotJob` (`Job<string>`)
  literally could not be enqueued before this without a typecheck failure, which is exactly
  why it sat unused since Phase 2. The scheduler always discarded the return value at
  runtime; the type now matches that reality.
- **`ManagerMoved` (ARCHITECTURE's WebSocket event list) is still not built** — flagged, not
  silently dropped. No internal event exists for a live teleport in progress;
  `TeleportService`/`CameraService` only confirm via mineflayer's `forcedMove` internally and
  publish nothing. Out of this phase's scope (nothing consumes it yet — the dashboard's live
  camera view, Phase 5, is the natural first consumer) but worth restating for whoever builds
  that.
- **"Camera failure" and "container inaccessible" alert types (ARCHITECTURE's alert list)
  are still not implemented** — same gap PROGRESS.md flagged at the end of Phase 3.
  `StorageMonitor` still logs-and-skips a container it can't open; `ScreenshotService.capture`
  still just throws. Wiring `ContainerInaccessible`/`ScreenshotFailed` events plus an
  `AlertService` handler for each remains a small, self-contained addition whenever it's
  prioritized — not required for anything Phase 4 built.

## Still open (not Phase 6 scope, carried forward)

Everything Phase 6's own entry-point questions raised is now resolved — see "Phase 6
decisions" above. Three items flagged along the way remain genuinely unaddressed, none of
them part of the six confirmed Phase 6 sub-items, so none were built this phase:

- **Dashboard bundle isn't code-split** — one ~1.6 MB (510 KB gzip) chunk; route-based
  `React.lazy` per page would fix the build warning if it ever matters for a real deployment.
- **Manager page can't show current task/queue depth/latency** — `GET /manager` only has
  connection status; would need small `Scheduler`/`ManagerConnection` additions.
- **"Camera failure"/"container inaccessible" alert types** (ARCHITECTURE's alert list,
  flagged since end of Phase 3) — `StorageMonitor` still logs-and-skips an inaccessible
  container, `ScreenshotService.capture` still just throws. Small, self-contained, not done
  yet because nothing forced it.
- **The Discord adapter's command/whitelist logic is still only tested against a mocked
  interaction**, never a live gateway connection — no bot token in any environment used
  across all six phases so far.

See `docs/NEXT_STEPS.md` for this same list reframed as actionable checklists — one for a
developer picking this back up, one for a user standing up a real deployment, and one for
an agent taking it to production.

## Verifying the current state still works

```bash
pnpm install   # puppeteer/canvas/bcrypt build approval is persisted in pnpm-workspace.yaml
               # (allowBuilds), so this shouldn't need an interactive `approve-builds`
               # in this checkout — only on a genuinely different clone/machine.
cp .env.example .env   # fill in JWT_SECRET (32+ chars, required at boot) and
                       # DISCORD_BOT_TOKEN if Discord is enabled
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm --dir src/dashboard build   # dashboard's own dist/, served same-origin if present
pnpm create-user admin <password>   # first login — no public registration
pnpm start   # node dist/app/bootstrap.js — migrations now copied into dist/, so this
             # actually works (previously broken since Phase 1, fixed this phase).
             # Expect connect-refused + backoff reconnect against the placeholder
             # config/manager.yml, plus a "REST API listening" log line.
             # curl http://localhost:3000/ now returns the dashboard shell (no auth);
             # curl http://localhost:3000/farms returns 401 without a token.

cd src/dashboard
pnpm typecheck && pnpm lint && pnpm test
```

Verified end-to-end just now: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all
clean, 150 tests passing (backend, up from 132). The dashboard package's own
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` are clean separately, including its
first automated test suite (11 tests). A fresh `rm -rf dist && pnpm build` followed by a real
`node dist/app/bootstrap.js` (with `JWT_SECRET` set) was run directly — confirmed migrations
ran, the farm registry loaded, and the REST API listened, then `curl`-verified that `GET /`
serves the dashboard shell unauthenticated while `GET /farms` still 401s without a token.

**`docker build`/`docker compose up` were not actually run** — Docker isn't installed in this
sandbox. Every command and path the image depends on was verified individually outside a
container instead (see above); run a real build before trusting the image fully, and expect
to iterate on the apt package lists in the `Dockerfile` if a shared library turns out to be
missing on the actual build host.

**The rendered dashboard itself was still not clicked through in a real browser** — this
sandbox has no Chrome and can't install one without root; do that locally (`pnpm dev` +
`cd src/dashboard && pnpm dev`, log in, click through each page) before trusting the UI fully.
The Discord adapter is unchanged from Phase 4 (still not verified against a live gateway — no
bot token in this environment; `config/discord.yml` ships `enabled: false`).

## Post-Phase-6: Camera / Screenshot / Prismarine Viewer removed (2026-07-29)

**Root cause found and the feature was removed, not patched.** The user reported the live
viewer's block textures rendering glitched. Investigation
(`node_modules/.pnpm/prismarine-viewer@1.33.0/.../viewer/lib/version.js`) found
`prismarine-viewer@1.33.0` (latest on npm) only ships bundled texture atlases and blockstate
data for Minecraft versions up to `1.21.4`; its internal version resolver silently falls back
to the closest *major.minor* it has for anything newer. This server runs `1.21.11`
(`config/manager.yml`), so every render used `1.21.4`'s UV/texture-atlas/blockstate data
against a live `1.21.11` world — any block added or changed since 1.21.4 gets the wrong
texture mapped onto it. Not fixable by upgrading (1.33.0 already latest, no newer release
exists with 1.21.11 data) — a structural version-lag problem in the upstream package, not a
bug in the integration. Confirmed this affected both the live dashboard iframe and the
Puppeteer-captured screenshots, since both render through the same pipeline.

Two replacement directions were discussed with the user (a texture-free top-down
block-color map rendered server-side via `canvas`; reusing an existing web-map mod like
dynmap/BlueMap if one's running on the Fabric server) but neither was decided — the user
chose to cut the feature entirely for now rather than design a replacement in the same
session, and revisit later.

**Removed:** `ScreenshotService`, `CaptureScreenshotJob`, `CameraService`,
`CameraDefinition`/`farm.cameras` (registry, config schema, `farms.yml`), the `screenshots`
DB table, the dead-and-never-populated `alerts.screenshotPath` column (migration
`0003_dry_mimic.sql`), `ScreenshotCapturedEvent`, the `/camera` REST route and
`/farm/:id/screenshots` route, the `/screenshots/*` static file mount, the Discord `/camera`
command and its screenshot notification, and the dashboard's `CameraPage`/`AuthedImage`
components and the Cameras/Recent-screenshots cards on `FarmPage`. Dropped dependencies:
`prismarine-viewer`, `puppeteer`, `canvas` (the last one only as our own direct dependency —
`jsdom`, a dev dependency of Vitest, still pulls it in transitively/optionally for its own
DOM canvas support; `pnpm-workspace.yaml`'s `allowBuilds.canvas` is now `false` since nothing
of ours needs its native build). `ARCHITECTURE.md` and `TECHNICAL_SPEC.md` updated to mark
the Camera System / Live Viewer / Screenshot Engine sections as removed, with the root cause
recorded here.

**Unrelated pre-existing test bug, also fixed this pass:**
`tests/core/config/load-app-config.test.ts` asserted `carpetWorker: 'worker_iron'` against
the checked-in `config/farms.yml`, whose real value is `Shulker` (the user's actual Carpet
fake-player name for the iron farm) — the test's expectation was stale, not the config;
updated the assertion to match the real, checked-in `config/farms.yml`.

Verified: `pnpm typecheck && pnpm lint && pnpm build` clean; `pnpm test` — 136/136 passing;
`src/dashboard`'s own `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean
(11/11 tests). Login still works exactly as before —
`pnpm create-user <username> <password> admin` — untouched by this change.

## Post-Phase-6: two real bugs found and fixed by live-testing against production (2026-07-29)

Ran the actual backend (`pnpm dev`) against the real Fabric server and the dashboard
(`pnpm --dir src/dashboard dev`), logged in via a real REST call, and watched the live log —
found two genuine, pre-existing bugs unrelated to the Camera/Screenshot removal above.

**1. `AlertService.openAlertIds` never survived a process restart.** It's a purely
in-memory `Map<key, alertId>`; `resolve()` only knows about alerts *this instance* opened.
Confirmed live: the real DB had 17 stuck `OPEN` `manager_disconnected` rows from earlier
dev-server restarts today, despite the manager being fine. Fix: `AlertService`'s constructor
now calls a new `rehydrateOpenAlerts()` that queries all `state = 'OPEN'` rows and
repopulates the map for every alert type whose dedup key is fully derivable from
`(type, farmId)` alone (`manager_disconnected`, `storage_warning`, `storage_full`,
`worker_missing`, `chunk_unloaded`, `production_stopped`). `unexpected_player`/
`unexpected_entity` are deliberately excluded — their key also embeds a username/entity name
that only exists baked into the free-text `message` column, not a queryable column, so it
can't be reconstructed; those two types already never auto-resolved regardless of restarts
(nothing in the codebase ever calls `resolve()` for them), so this is a pre-existing,
separate gap, not a regression from the fix. New test:
`tests/services/alerts/alert-service.test.ts` — "resolves an OPEN alert left behind by a
previous process instance on startup" (seeds two OPEN rows directly, constructs a fresh
`AlertService`, publishes the resolving events, asserts both rows become `RESOLVED`).

**2. The manager disconnected from the real server every ~30–45s** with
`client timed out after 30000 milliseconds` (`minecraft-protocol`'s keepalive watchdog:
`checkTimeoutInterval`, hardcoded default 30s — resets on every incoming `keep_alive`
packet from the server; fires if none arrives in time). Verified this is a real gap in the
*server's* outgoing keep-alives, not our own event loop blocking (grepped for synchronous
I/O/busy-loops in the hot path — only `readFileSync` at startup config load exists) and not
a config-passthrough problem (`mineflayer.createBot(options)` → `minecraft-protocol
.createClient(options)` → `keepalive(client, options)` reads `options.checkTimeoutInterval`
directly, so anything we add to `BotOptions` reaches it unmodified). Fix: new
`manager.server.keepAliveTimeoutMs` config field (schema default `60_000`, `ManagerConnection`
now passes it as `checkTimeoutInterval`), and the real `config/manager.yml` set to `120000`
given the observed instability. Re-verified live after the fix: the error message itself
confirmed the new value took effect (`client timed out after 120000 milliseconds`, not
30000), and the connection survived the full 120s window instead of the old ~30–45s cycle —
a real, measured improvement, not just a config no-op. It still eventually timed out at the
2-minute mark, though, so the underlying server-side gap (likely tick lag from the 127-mod
server, or from the very farms MFO watches) is real and only partially masked by a larger
tolerance — raising `keepAliveTimeoutMs` further is a legitimate next knob to turn if this
keeps happening, but if the server ever goes fully silent for minutes at a time, no
client-side timeout tuning fixes that; the `feature/fabric-bridge-client` branch's in-JVM
bridge-mod approach (separate protocol, not raw Minecraft client keep-alives) would sidestep
this class of issue entirely and may be worth revisiting for that reason. New test:
`tests/manager/connection/manager-connection.test.ts` — "passes the configured keep-alive
tolerance through to mineflayer" (asserts `checkTimeoutInterval` reaches the `createBot`
call).

**Incidentally found and fixed while live-testing:** a stale `tsx watch` process from an
earlier test run was still alive and logged in as the same Minecraft account
(`MFO-Manager`/microsoft auth only allows one live session), fighting the new process for
the connection and producing a completely different symptom (`manager kicked from server`,
empty reason, within ~5s of every connect) that looked like a regression from the
`keepAliveTimeoutMs` change but wasn't — killing the orphaned process resolved it
immediately. Worth remembering if this pattern reappears: check for a duplicate session
before assuming a code regression.

Verified: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all clean, 138/138 tests
passing (up from 136).
