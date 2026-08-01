# SlayCraft — Production Readiness Report

Date: 2026-08-01
Scope: dashboard (client+server), docker-compose/Caddy deploy, mod (MCFarmManager) auth boundary.

## Verdict: READY, with 2 recommended fixes before/soon after next deploy

Core app is solid: auth, session handling, SQL access, and error handling are all done correctly. Nothing found blocks shipping. Two items worth fixing in the next cycle (below), neither urgent.

## What was checked

- Full `git status`/diff (working tree clean except stale taskmaster status field)
- Server: auth.ts, routes/*.ts, mcfarmmanager.ts — read in full for injection, path traversal, authz bypass
- docker-compose.yml, Caddyfile, nginx.conf, .env/.env.example, .gitignore
- `npm test` (server), `tsc --noEmit` (server+client), `npm run build` (server+client)
- `npm audit` (server+client)
- Mod HTTP server token-check path (net.mcfarmmanager.mod.http)

## Results

| Check | Result |
|---|---|
| Server tests | 47/47 pass |
| Server typecheck | clean |
| Client typecheck | clean |
| Server build | clean |
| Client build | clean (1 warning: main chunk 1.29MB — perf, not correctness) |
| `.env` in git | not tracked, correctly gitignored; `.env.example` has no real secrets |
| SQL injection | none — every query uses `db.prepare` with bound params, no string-built SQL anywhere in server |
| Path traversal (uploads) | none — filenames are `crypto.randomUUID()` + validated extension, never user-supplied |
| Auth | scrypt + timingSafeEqual password check, httpOnly+signed+sameSite cookie, secure flag gated on NODE_ENV=production, IP lockout after 5 failed attempts/60s |
| trustProxy | fixed hop count of 2 (Caddy + nginx), matches actual chain — can't be spoofed by client-supplied X-Forwarded-For |
| COOKIE_SECRET | required (throws) when NODE_ENV=production and unset — good fail-closed default |

## Findings

### 1. MEDIUM (dependency) — 7 high-severity npm advisories in `dashboard/server`
`find-my-way` (fastify router) has a known HTTP/2 DoS advisory; fix requires bumping to fastify 5 (breaking change — route registration API differs). Not exploited by any code in this repo, but worth scheduling.
- Fix: `npm audit fix --force` in `dashboard/server`, then re-run the 47 tests and fix whatever the fastify 4→5 migration breaks.

### 2. LOW (dependency) — 2 moderate npm advisories in `dashboard/client`
`react-router` open-redirect / SSR hydration CVEs. App doesn't do SSR and has no external redirect input, so low real impact here — still cheap to fix.
- Fix: `npm audit fix` in `dashboard/client`.

### 3. LOW (defense-in-depth) — mod's `X-API-Token` check uses `String.equals`, not constant-time compare
`MCFarmManagerHttpServer.java` compares the provided token with `.equals()`. Only reachable from the docker-internal network (server↔mcserver), not internet-facing, so timing side-channel isn't practically exploitable — but the dashboard server already does this correctly (`crypto.timingSafeEqual`) elsewhere, so this is an inconsistency worth matching.
- Fix: swap to `MessageDigest.isEqual(...)` on the token bytes.

## Not blocking, but noted for awareness

- Sessions and login-lockout state live in an in-memory `Map` — a server restart logs everyone out and clears lockouts. Fine for a single-instance single-password app; would need a shared store only if you ever run >1 server replica.
- `dashboard-data` sqlite volume has no automated backup job in docker-compose. Worth a cron `sqlite3 .backup` or volume snapshot if data loss would hurt.
- Client main bundle is 1.29MB — not a correctness issue, just a future perf item (code-splitting).
- 33 imported farms still carry placeholder coordinates (0,64,0) — known, tracked separately, not a security/stability issue, just wrong data until hand-entered.

## Nothing found in these categories
Command injection, XXE, template injection, auth bypass, JWT issues (no JWT in use), hardcoded secrets, XSS (React, no `dangerouslySetInnerHTML` found), insecure deserialization, SSRF (mcfmFetch base URL is env-configured, not user-controlled).
