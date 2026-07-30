# MFO — Next steps

Phase 6 ("Polish") — the last phase in `docs/ARCHITECTURE.md`'s roadmap — is complete as
of 2026-07-28. There is no "Phase 7" defined in either canonical doc. This file is the
punch list for what comes after: three checklists, one per audience, since "finish the
build" (dev), "start actually using it" (user), and "put it into production" (agent) are
different jobs with different risks. For *how* to run/deploy MFO at all, see
`docs/DEPLOYMENT.md` — this file is about *what's left*, not mechanics already documented
there.

## For the developer

Carried forward from `docs/PROGRESS.md`'s "Still open" section — none of these were part
of Phase 6's confirmed scope, so none were built:

- **Dashboard bundle isn't code-split** — one ~1.6 MB (510 KB gzip) chunk. Route-based
  `React.lazy` per page (`src/dashboard/src/App.tsx`'s `<Route>` list) would fix the Vite
  build warning. Small, self-contained, only worth doing if load time on a real deployment
  actually matters.
- **`GET /manager` can't report current task/queue depth/latency** — only connection
  status today. Needs small additions to `Scheduler`/`ManagerConnection` to expose that
  state, then a route/dashboard change to surface it.
- **"Camera failure"/"container inaccessible" alert types** (in `docs/ARCHITECTURE.md`'s
  alert list since Phase 3) — `StorageMonitor` still logs-and-skips an inaccessible
  container, `ScreenshotService.capture` still just throws. Needs a
  `ContainerInaccessible`/`ScreenshotFailed` event pair plus an `AlertService` handler for
  each.
- **The Discord adapter has never been tested against a live gateway** — only a mocked
  interaction, across all six phases. Needs a real bot token and a test server to close;
  don't fabricate this coverage without one.
- **The Dockerfile has never been run through an actual `docker build`** — verified
  individually instead (see `docs/PROGRESS.md`'s Phase 6 decisions). Run a real build
  before trusting the image; the apt package lists are the most likely thing to need a
  tweak on a different build host.
- **The dashboard UI has never been clicked through in a real browser** — verified via
  `tsc`/`eslint`/`vitest` + a `curl` smoke test only, since no sandbox used so far has had
  Chrome available. Do this before trusting the UI fully:
  `pnpm dev` (backend) + `cd src/dashboard && pnpm dev` (frontend), log in, click through
  every page.

Before starting **any** new work beyond this list: read `docs/PROGRESS.md` in full first
(per `CLAUDE.md`'s own instruction), since it's the authoritative record of what's built
and why. If the user asks for something not on this list, treat it as new scope requiring
the same discipline every phase so far has used — explain the plan, flag genuine
ambiguities and ask rather than infer, one feature at a time. Nothing here implies a
"Phase 7" roadmap the user has actually asked for.

## For the user (operator)

Everything through Phase 6 has been built and verified against a **placeholder**
config — no real Fabric server, no real farms. To actually start using MFO:

1. **Point it at a real server.** Edit `config/manager.yml`'s `server`/`bot` blocks with
   the real host/port/version and a Manager bot account. That account must be
   server-OP — teleportation (`TeleportService`) works via `/execute ... run tp`, which
   requires OP. Decide `offline`/`microsoft` auth to match how the server's configured.
2. **Describe your real farms.** Edit `config/farms.yml`: each farm's `dimension`,
   `teleport` point, `carpetWorker` name, `storage` container positions, `cameras`,
   `entities.allow` list. Nothing here is inferred from your server — MFO only observes
   what's configured.
3. **Set thresholds you actually care about.** `config/alerts.yml`'s storage
   warning/full percentages; `config/manager.yml`'s scan interval and which monitors run
   (`monitors: [...]`, omit for all four).
4. **Generate a real secret.** `.env`'s `JWT_SECRET` must be a fresh random string — don't
   reuse a value from testing/development. `openssl rand -hex 32` or similar.
5. **Decide on Discord.** Off by default. If wanted: `config/discord.yml` →
   `enabled: true` + `guildId`/`notifyChannelId`, and `DISCORD_BOT_TOKEN` in `.env`.
   Populate `whitelist` with real user IDs before exposing the bot anywhere — it defaults
   to unrestricted.
6. **Deploy** (see `docs/DEPLOYMENT.md` for the full mechanics): Docker is the recommended
   path (`docker compose up -d --build`), or `pnpm build && pnpm start` directly.
7. **Create your login and verify.** `pnpm create-user <username> <password>` (or the
   Docker equivalent in `docs/DEPLOYMENT.md`) — no public registration. Then, in order:
   confirm the Manager actually connects (logs, not a reconnect-backoff loop), confirm a
   scan completes and the Overview page populates, confirm a screenshot capture actually
   produces an image, confirm an alert you'd expect (e.g. a deliberately-full container)
   actually appears and can be acknowledged.
8. **Know the current limitations** before relying on this day-to-day: a hard refresh on
   a dashboard deep link (e.g. reloading `/farm/<id>`) hits the API, not the app shell —
   navigate using the dashboard's own links/menu instead (see
   `docs/DEPLOYMENT.md`'s troubleshooting section); there's no automated backup-restore
   command, only a documented manual `cp` step; Discord notifications are unverified
   against a live gateway.

## For an agent taking this to production

This is a **read-only observability tool** — restate that constraint to yourself before
touching anything: never add or approve a feature that writes, moves, or destroys
gameplay state. If a request implies that, reject or flag it, don't implement it.

Preconditions to verify before acting — don't assume any of these:

- [ ] Docker is actually available in the target environment (`docker version`) — it was
      not available in the sandbox this was built in, so the image has never been built
      for real. Expect to iterate on the `Dockerfile`'s apt package lists.
- [ ] `config/*.yml` point at a real server, not the shipped placeholders — check
      `manager.yml`'s `server.host` before deploying; deploying the placeholder config is
      a no-op, not a failure, but it isn't observability either.
- [ ] A fresh `JWT_SECRET` exists for this deployment, generated for it — never reuse a
      development or another deployment's secret. Treat it as a real secret: don't log it,
      don't commit it, source it from the environment/secrets manager, not `config/*.yml`
      (which is version-controlled and non-secret by design).
- [ ] Whether this deployment is reachable beyond localhost/LAN. Every documented
      decision so far (Phase 4/5's CORS/auth choices) assumes a trusted local/LAN
      deployment — permissive CORS (`origin: true`/`origin: '*'`), no TLS termination
      built in. **Do not expose ports 3000/3001 to the public internet without a reverse
      proxy providing TLS and without asking the user first** — that changes the threat
      model this system was built against, and is exactly the kind of "affects shared
      systems beyond your local environment" action that needs confirmation first, not a
      silent decision.

Deployment steps (Docker path, the documented/recommended one — see `docs/DEPLOYMENT.md`
for full detail, this is the sequencing):

1. Confirm the preconditions above with the user if any are unclear — do not guess a
   `JWT_SECRET`, a server address, or a public-exposure decision.
2. `docker compose up -d --build` from the repo root.
3. Verify the container is actually healthy, not just running:
   `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/` → expect `200`
   (dashboard shell, unauthenticated) and
   `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/farms` → expect `401`
   (API correctly auth-guarded).
4. Create the first user: `docker compose exec mfo node dist/app/create-user.js
   <username> <password> [admin|viewer]`.
5. Confirm logs show `REST API listening` and either a successful Manager connection or a
   clean reconnect-backoff loop (expected if the real server isn't up yet) — not a crash
   loop or a config-validation exit.
6. Report back what was verified and what wasn't (e.g. "container up, API responding
   correctly, user created; Manager connection not yet confirmed against the real
   server") rather than declaring the deployment fully working from container-up alone.

If any step fails: read the actual error before retrying — this project's own logging
(structured, one line per operation, `docs/ARCHITECTURE.md`/`CLAUDE.md`'s error-handling
rules) is designed to make the real cause visible rather than swallowed. Don't work around
a failure with `--no-verify`-style shortcuts (e.g. skipping the startup config/secret
checks, which exist specifically to fail fast with a clear message instead of a confusing
runtime error later).
