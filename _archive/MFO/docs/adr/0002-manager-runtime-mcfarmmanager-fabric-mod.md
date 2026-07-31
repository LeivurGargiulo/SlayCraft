# ADR-0002: Manager runtime — retire Mineflayer, adopt the MCFarmManager Fabric mod for sensing

**Status:** Accepted (supersedes ADR-0001)
**Date:** 2026-07-30
**Deciders:** Lei (project owner)
**Supersedes:** [ADR-0001](./0001-manager-runtime-mineflayer-vs-scarpet-vs-fabric-mod.md)

## Context

ADR-0001 recommended a hybrid runtime (Scarpet for sensing, a slim Mineflayer bot kept
only for camera/screenshot duty, RCON as the transport) without having read the actual
codebase, the actual server, or two implementation attempts that already existed in this
workspace. This ADR was written after doing that reading. Every load-bearing assumption
in ADR-0001 turned out to be either wrong, unbuilt, or overtaken by a decision already
made elsewhere in the workspace. Specifically:

1. **The screenshot "hard constraint" that ADR-0001 built its entire hybrid around no
   longer holds, and hasn't for a while.** `docs/PROGRESS.md`'s "Post-Phase-6" entry
   (currently sitting **uncommitted** in the Mineflayer repo's working tree — 66 files
   changed, `git status --short`) documents that Camera/Screenshot/Prismarine Viewer was
   already removed from MFO's Mineflayer implementation on 2026-07-29: `prismarine-viewer`
   only ships bundled texture/blockstate data up to Minecraft 1.21.4, the server runs
   1.21.11, and every block added or changed since 1.21.4 rendered with the wrong texture
   — a structural version-lag bug in the upstream package, not fixable by upgrading (1.33.0
   is already latest). ADR-0001's premise — "screenshots are a hard constraint that only
   Mineflayer... can satisfy" — describes a capability that, as shipped, doesn't currently
   work at all. Keeping Mineflayer around "for camera duty" (ADR-0001's whole reason for
   not dropping it) preserves nothing functional today.

2. **Scarpet has no existing footprint on the server to build on.** ADR-0001's Decision
   section states Scarpet apps would run "alongside the existing Carpet workers" and lists
   "reuses infrastructure already running" as a Pro. The server's actual Scarpet app
   directory, `world/scripts/`, is **empty**. Carpet fake-player workers (`/player <name>
   spawn`) are a native Carpet feature and do not require Scarpet at all — ADR-0001's
   framing that "Carpet fake-player workers depend on [Scarpet]" is incorrect. Building the
   sensing layer in Scarpet would be starting from zero, exactly like the Fabric-mod option
   ADR-0001 rejected for requiring new work.

3. **RCON — the transport ADR-0001's hybrid depends on — is not configured.** The dev
   server's `server.properties` has `enable-rcon=false` and an empty `rcon.password`.
   Action item 4 ("spike the RCON bridge") was never done. This isn't necessarily true of
   the real production server (`192.168.0.141:25564`, unreachable from this environment —
   see below), but nothing in this workspace demonstrates RCON works for this purpose.

4. **A third implementation attempt exists that ADR-0001 never considered as a concrete
   option**, and it is materially further along than "write Scarpet apps + spike RCON"
   would be starting from nothing: **MCFarmManager**, a self-contained server-side Fabric
   mod built as a Carpet Extension. 8 of its 12 planned tasks are done, tested, and
   live-verified against the real dev server (see Option C below). It already does
   everything ADR-0001 wanted Scarpet to do for sensing, without RCON, without a bot
   account, and without any Scarpet authoring at all.

5. **The Mineflayer instability has two distinct, structural root causes**, both found by
   live-testing against the real server (`docs/PROGRESS.md`, "Post-Phase-6: two real bugs
   found and fixed by live-testing against production"):
   - **Keep-alive timeouts** from real server-side tick lag (confirmed independently in
     this investigation — the dev server's own log shows `Can't keep up! ... Running
     2056ms or 41 ticks behind` during ordinary testing). Mitigated by raising
     `checkTimeoutInterval` from 30s to 120s, but the connection still eventually times
     out under sustained lag — a partial mitigation, not a fix, of a server-load problem
     that has no reason to improve as more farms/mods are added.
   - **Registry-sync hard-kicks**: `docs/BRIDGE_MOD_PROTOCOL.md` documents that any server
     mod registering custom data (e.g. `TravelersBackpack`'s `DataComponentType` entries)
     without opting out of Fabric's registry-sync strictness hard-kicks any client that
     can't prove it has the matching mods. Mineflayer never can, because it isn't a real
     client. Worked around today with a server-side compat mod
     (`mfo-registry-compat`/`RegistryAttributeHolder`) that has to be manually revisited
     every time the modpack changes — an ongoing maintenance burden, not a one-time patch.

   Neither is a bug in how Mineflayer was configured. Both are structural consequences of
   Mineflayer not being a real client, running against a server whose modpack and load
   profile keep changing.

6. **A fourth, partially-built path exists that ADR-0001 also never considered**: a
   client-side Fabric mod (`BridgeMod`) plus a Node-side transport swap
   (`feature/fabric-bridge-client` branch), letting the Manager drive a *real* Minecraft
   client instead of a simulated protocol client. This is genuinely further along than a
   proposal (see Option D below) but was set aside — not abandoned for cause — when a
   cheaper keepalive fix and the independent decision to cut screenshots both landed after
   it, and it trades away Mineflayer's zero-GPU, zero-real-account operational simplicity
   for a persistent, logged-in, GPU-having client process whose modpack has to be kept in
   sync with the server's.

### Live server facts (verified directly, not assumed)

- Minecraft **1.21.11**, Fabric Loader **0.19.3**, Fabric API **0.141.3+1.21.11**, Java 21.
- `fabric-carpet-1.21.11-1.4.194` **is installed**, plus `carpet-extra`,
  `carpet-tis-addition`, `carpet-org-addition`, `gugle-carpet-addition` — Scarpet is
  available if chosen, but unused (`world/scripts/` empty).
- **62 mods** total on the modpack — includes several performance/concurrency mods
  (C2ME, Lithium, ServerCore, ThreadTweak) that suggest the server is already under real
  load, consistent with the tick-lag disconnect cause above.
- **RCON disabled** on the dev server (`enable-rcon=false`). The real production server
  (`192.168.0.141:25564`, referenced in `config/manager.yml`) was **unreachable from this
  environment** (`connection refused` on both the game port and the default RCON port) —
  its RCON state was not independently verified and should be checked before relying on
  any conclusion that assumes it either way.
- `mcfarmmanager-1.0.0.jar` and `mfo-registry-compat-1.0.0.jar` are **already built and
  deployed** in the dev server's `mods/` folder, and start cleanly: `MCFarmManager Carpet
  extension registered`, `MCFarmManager HTTP server listening on 0.0.0.0:8642`, `Loaded 1
  farm(s) from mcfarmmanager/farms.json` (dev server log, `2026-07-30 01:04`).

## Decision

**Retire the Mineflayer-driven Manager entirely. Finish the MCFarmManager Fabric mod as
the server-side sensing layer, and rewire the existing Node backend to poll its embedded
HTTP API instead of driving a simulated Minecraft client.** Drop screenshots/live camera
from scope, matching what the Mineflayer repo's (currently uncommitted) working tree has
already independently done for unrelated reasons — not replaced by anything now.

Concretely:

- **MCFarmManager** (the server-side Fabric mod, Carpet Extension, already 8/12 tasks
  built and live-verified — see Option C) becomes the entire sensing layer: storage
  reads, entity scans, worker/fake-player status, chunk-loaded status, world state
  (weather, time, difficulty), and server performance (TPS/MSPT via Carpet's own
  tracking). It reads `BlockEntity`/`Container`/entity state directly from the server
  process — no teleport, no bot account, no physical presence required at all.
- **The Node/TypeScript backend is kept, not replaced**: Scheduler (repurposed as a poll
  scheduler, not a movement queue), Health Engine, Alert Engine, Metrics, Persistence,
  REST/WebSocket API, Discord adapter, and Dashboard are all already built, tested, and
  stay as-is. Only the data-fetching layer changes: the Mineflayer-driven monitors
  (`StorageMonitor`, `EntityMonitor`, `WorkerMonitor`, `ChunkMonitor`) are replaced by a
  new HTTP-polling client against MCFarmManager's API (`GET /farms`, `/farms/{id}`,
  `/players`, `/world`, `/performance`, `/status`).
- **No RCON, no Scarpet authoring, no bot account.** MCFarmManager exposes its own
  embedded HTTP server (JDK built-in `com.sun.net.httpserver`, no framework, no new
  dependency) directly — eliminating the RCON transport/failure-mode ADR-0001's hybrid
  would have introduced, and the from-scratch Scarpet app work ADR-0001 assumed would be
  reuse.
- **Screenshots/live camera stay out of scope**, not deferred-and-forgotten but an
  explicit product decision, matching the removal already underway on Mineflayer's `main`.
  The `feature/fabric-bridge-client` branch and the `BridgeMod` repo are **kept, not
  deleted** — real, tested infrastructure (Phase 0 and 2 done, Phase 1 manually verified
  end-to-end) sits there if screenshots become a real priority again later, at the real
  cost documented in Option D (a persistent GPU-having client process).
- This is **not** ADR-0001's Option D (hybrid), and it is a variant of ADR-0001's **Option
  C (custom Fabric mod)** — the option ADR-0001 explicitly rejected. See Trade-off
  Analysis for why the rejection no longer holds.

## Options Considered

### Option A: Fix and continue Mineflayer (status quo, patched)

The current, most feature-complete implementation: all 6 roadmap phases done (`docs/
PROGRESS.md` — Foundation through Polish), 150 backend tests + 11 dashboard tests
passing, full REST/WebSocket/Discord/dashboard/DB/backups/Docker. Two real production
bugs already found and partially fixed by live-testing (see Context #5).

| Dimension | Assessment |
|---|---|
| Completeness today | Highest of any option — the only one with a working Discord adapter, JWT-authed dashboard, and alert lifecycle already live-tested |
| Reliability | Two structural, only-partially-mitigated problems: keep-alive disconnects under real server tick lag, and registry-sync hard-kicks needing an ongoing per-mod compat patch |
| Screenshots | Already removed (uncommitted on `main`) — the capability ADR-0001 kept Mineflayer around for doesn't currently exist |
| Ongoing cost | A dedicated Microsoft account, permanently online, subject to every future modpack change breaking registry-sync again |

**Verdict: not recommended.** Its unique justification (screenshots) is gone, and its two
reliability problems are environmental, not implementation bugs — "fixing" them further
means either more timeout-tuning (already showing diminishing returns) or taking on the
`mfo-registry-compat`-per-modpack-change maintenance burden indefinitely, for a sensing
approach that's strictly slower (teleport + chunk-load wait per scan) than reading server
memory directly.

### Option B: Scarpet/Carpet + unchanged Node backend, screenshots dropped

This is close to the user's framed Option 3 (and ADR-0001's Option B), evaluated fresh
against what actually exists on the server.

| Dimension | Assessment |
|---|---|
| Existing footprint | **None.** `world/scripts/` is empty — no Scarpet apps exist to build on, contrary to ADR-0001's framing |
| Transport | RCON, unconfigured on the dev server, unverified on production; action item 4 (spike RCON) from ADR-0001 was never done |
| Read-only enforceability | Weakest of any option — "nothing stops a script from calling a block-modifying function" (ADR-0001's own assessment, still accurate) |
| Effort | Full sensing layer written from scratch in an unfamiliar scripting language, plus an RCON bridge built and proven from zero |

**Verdict: not recommended.** Every advantage ADR-0001 attributed to this option
("reuses infrastructure already running") turned out to be aspirational, not actual. It
would cost more from-scratch effort than Option C below while landing with a weaker
read-only guarantee and a new unproven transport dependency.

### Option C: Finish the MCFarmManager Fabric mod — recommended

Self-contained server-side mod, registered as a Carpet Extension, package
`net.mcfarmmanager.mod`. Lives in `/home/leivur/projects/MFO/Fabric Mod (MCFarmManager)`;
real implementation is on branch `worktree-implement-mcfarmmanager` (the `main` branch is
a design-only skeleton — its README's "not yet implemented" is stale).

**What's actually built and verified** (12-task plan in
`docs/superpowers/plans/2026-07-29-mcfarmmanager-implementation.md`):

| Task | Status | Evidence |
|---|---|---|
| 1. Buildable skeleton | Done | `./gradlew clean build` succeeds |
| 2. Carpet Extension registration | Done, live-verified | Confirmed on real dev server |
| 3. `farms.json` config loader | Done | 9/9 unit tests |
| 4. `FarmDataProvider` + real implementation | Done | Live API discovery against actual remapped server jars, not guessed from training data (per `SPEC.md`'s own explicit warning about this) |
| 5. Live verification vs. real server | Done | Disposable test rig (fake-player worker + real chests), confirmed correct entity/storage counts |
| 6. HTTP API (`/farms`, `/players`, `/world`, `/performance`, `/status`) | Done | 16/16 tests |
| 7. Live-verify HTTP API | Done | Found and fixed a real bug (block-entity reads returning null off the main thread); added DNS-rebinding hardening via a Host-header allowlist |
| 8. SQLite history/sampler/pruning | Done | 23/23 tests, full build succeeds |
| 9. Live-verify history sampling | **Started, not finished** | Brief written, no report, no commit after it — session was interrupted (Ralph Loop autonomous run, active through 01:19, then silence — not a technical blocker) |
| 10–11. Dashboard (static HTML/JS, SVG charts) | Not started | No `dashboard/` directory exists |
| 12. Packaging/deploy | Not started | The deployed jar is Task 8's build artifact used for testing, not a formal release build |

No mixins used anywhere — everything goes through public Fabric/vanilla/Carpet APIs. No
mutating API is imported or called anywhere in `FarmDataProvider`/`RealFarmDataProvider` —
read-only is enforced by the interface never exposing a write path, not by convention.

**Why it stalled**: an interrupted autonomous session (Ralph Loop, iteration 26/300),
compounded by a broken `git worktree` pointer left over from an unrelated directory
rename (`/home/leivur/projects/MCFarmManager` → `/home/leivur/projects/MFO/Fabric Mod
(MCFarmManager)`) that now makes `git` fail inside the worktree — a fixable pointer
problem, not lost work. The SDD ledger has no BLOCKED task, no crash, no failing build —
every completed task has a clean review verdict.

| Dimension | Assessment |
|---|---|
| Completeness | 8/12 tasks done and live-verified; remaining work is finishing verification + a Node-side integration layer (new scope, not in the original 12-task plan — see Consequences) |
| Reliability | No teleport, no chunk-load wait, no bot account, no keep-alive timeout exposure, no registry-sync exposure — sidesteps every Mineflayer failure mode by construction |
| Read-only enforceability | Strongest of the three sensing approaches — compiled, reviewed Java with no mutating calls present at all, vs. Scarpet's admitted weakest guarantee |
| Screenshots | Explicitly out of scope for v1 (`SPEC.md`) — consistent with dropping them project-wide |
| New cost | A second toolchain (Java/Gradle/Loom) to maintain — real, but partially already paid for (8/12 tasks sunk) rather than hypothetical |
| Security posture | HTTP API has **no auth**, binds `0.0.0.0` by default (`SPEC.md`'s own "Security posture" section calls this a deliberate, documented v1 LAN-trust decision) — consistent with, not worse than, the existing Node backend's own permissive-CORS/no-auth-on-internal-traffic posture, but still needs an explicit network-exposure decision before deployment |

**Verdict: recommended**, as the sensing layer feeding the existing Node backend — not
as a full standalone replacement (its own dashboard/history/alerting are deliberately
out of scope and inferior to what the Node backend already has built and tested).

### Option D: Finish the Fabric bridge (client-side BridgeMod + `feature/fabric-bridge-client`)

A real Minecraft client, running the `BridgeMod` client-side Fabric mod, exposing a
loopback TCP/NDJSON socket that the Node backend's `FabricBridgeConnection` (branch
`feature/fabric-bridge-client`) speaks instead of Mineflayer's simulated protocol client.

**What's built**: BridgeMod's four Java files are complete — all six commands
(`teleport`, `look`, `queryEntities`, `queryBlock`, `readContainer`, `captureScreenshot`)
implemented, none stubbed, manually verified end-to-end by the operator per its own
5-step checklist. The Node-side branch (commit `9470792`) bundles Phase 0 (transport
abstraction) and Phase 2 (`FabricBridgeConnection`), compiles clean, 173/174 tests pass
(the one failure is a pre-existing, unrelated stale-fixture bug), and is wired into
`bootstrap.ts` as an actual `connectionMode: fabricBridge` option — not disconnected
scaffolding. Phases 3 (screenshot pipeline swap) and 4 (live streaming) were never
started.

**Why it was set aside** (concrete evidence, not speculation): main's now-uncommitted
`PROGRESS.md` addition independently (a) cut screenshots entirely for the texture-lag
reason in Context #1, deleting the very files this branch's unfinished Phase 3 exists to
fix, and (b) reached for the cheaper `keepAliveTimeoutMs` mitigation for disconnects
instead, while explicitly noting the bridge branch "may be worth revisiting" if the
server ever goes fully silent — i.e., it was consciously deprioritized, not abandoned for
a technical reason.

| Dimension | Assessment |
|---|---|
| Screenshot fix | **Real** — `Screenshot.takeScreenshot(client.getMainRenderTarget(), ...)` is a genuine framebuffer grab from a real, fully-modded client; structurally immune to prismarine-viewer's texture-lag bug |
| Registry-sync fix | Very likely real (a real client with the real modpack naturally passes registry-sync) but **not confirmed by testing** in either repo — worth flagging as an assumption |
| Keep-alive/tick-lag fix | **Does not fix this.** A real client is equally subject to server-side lag and timeouts; this problem is orthogonal to bridge vs. simulated client |
| Operational cost | A persistent, logged-in, GPU-having (or Xvfb) client process on real hardware, with the full modpack mirrored and kept in sync — the exact operational weight Mineflayer's headless design was chosen to avoid |

**Verdict: not recommended now, keep for later.** Its only clear win (real screenshots)
is moot given screenshots are out of scope by this decision. Its other likely win
(registry-sync robustness) becomes irrelevant if Mineflayer/BridgeMod aren't driving
sensing at all, which is exactly what Option C already achieves without a GPU-having
client. Don't delete the branch or the `BridgeMod` repo — real, working infrastructure
sits there if camera/screenshots are ever revisited as a real product priority.

## Trade-off Analysis

ADR-0001 rejected Option C (custom Fabric mod) for three stated reasons. None hold up
against what was actually found:

1. *"Doesn't clearly outperform Scarpet for this use case"* — Scarpet has zero existing
   footprint to compare against; MCFarmManager is 8/12 tasks live-verified against the
   real server. There's nothing to weigh Scarpet's hypothetical performance against except
   a concrete, working alternative.
2. *"Adds a second compiled-language toolchain to maintain"* — true, but it's already
   substantially paid for, not a future cost being newly incurred. The alternative
   (Scarpet) also isn't free of new-toolchain cost — it's a full sensing layer written from
   scratch in a scripting language nobody has used for this project yet.
3. *"Still cannot render a camera frame or screenshot"* — true, and irrelevant once
   screenshots are out of scope. This was ADR-0001's strongest argument against every
   single-runtime option, and it evaporates the moment screenshots stop being a
   requirement — which they already are, independent of this decision.

The actual deciding factor is what changed since ADR-0001 was written: **the "hard
constraint" that forced a hybrid in the first place (screenshots) turned out not to work
today regardless of runtime choice, and was already cut.** Once that constraint is gone,
there's no reason to keep any bot-like runtime in the picture at all — MCFarmManager reads
server state directly, with no teleport, no login, no physical presence, and no exposure
to either of Mineflayer's two structural reliability problems. This is a simpler
architecture than ADR-0001's own hybrid recommendation, not just a different one: one
runtime (JVM, in-process with the server) instead of two, no RCON, no bot account.

## Consequences

- **Easier:** sensing becomes near-instant, in-process server reads — no teleport, no
  chunk-load wait, no keep-alive exposure, no registry-sync exposure, no bot account to
  manage or re-authenticate. The Manager's "read-only" boundary becomes stronger and
  simpler to audit — no gameplay interaction (not even teleport) happens at all anymore,
  worth reflecting in `ARCHITECTURE.md`'s Core Principles section, which currently lists
  teleport as the one allowed gameplay permission.
- **Harder / new work, not accounted for in either existing plan:** a new Node-side
  integration layer — an HTTP-polling client against MCFarmManager's API, replacing
  `StorageMonitor`/`EntityMonitor`/`WorkerMonitor`/`ChunkMonitor`'s Mineflayer-driven
  implementations — has to be designed and built. MCFarmManager's own 12-task plan assumed
  it would ship as a standalone product with its own dashboard; this decision instead
  treats it as a sensing backend for the existing Node stack, which is new scope on top of
  finishing its remaining tasks.
- **To fix before any of this can be built on:** the MCFarmManager worktree's broken git
  metadata (stale path from the `MCFarmManager` → `Fabric Mod (MCFarmManager)` rename) —
  `git worktree repair` or equivalent, before Task 9 can even be committed.
- **To decide, not inferred here:** whether MCFarmManager's HTTP port should bind to
  loopback only (if co-located with the Node backend) or stay LAN-wide behind the same
  trust boundary the rest of MFO already accepts (per Phase 4/5's permissive-CORS,
  no-auth-on-internal-traffic precedent) — a real network-exposure decision, not a
  technical one.
- **To decide, not inferred here:** whether to skip MCFarmManager's own dashboard
  (Tasks 10–11) entirely in favor of the Node backend's existing, superior one
  (auth, alerts, per-farm pages, already built and tested) — this ADR assumes yes, skip
  it, but that's a scope call worth confirming explicitly.
- **Housekeeping, unrelated to this decision but found during this investigation:** the
  Mineflayer repo's `main` branch currently has 66 files of uncommitted changes (the
  Camera/Screenshot removal and its `PROGRESS.md` writeup) sitting in the working tree —
  worth committing regardless of which option is chosen, so that decision isn't at risk of
  being lost.
- **Not verified, flagged rather than assumed:** the production server's actual RCON
  state (irrelevant to this decision, since RCON is no longer needed either way, but worth
  knowing) and Fabric/Carpet versions were not independently confirmed — only the dev
  server (`/home/leivur/minecraft/ServerModded`) was reachable from this environment.
  `config/manager.yml` names `192.168.0.141:25564` as production; confirm its modpack and
  versions match before deploying MCFarmManager there.
- **Kept, not deleted:** `BridgeMod` and the `feature/fabric-bridge-client` branch — real,
  tested infrastructure for a future screenshots-return decision, at the documented
  operational cost in Option D.

## Action Items

1. [x] Lei confirms or rejects this decision before any implementation starts. —
   **Confirmed 2026-07-30.**
2. [x] If confirmed: mark this ADR Accepted and ADR-0001 Superseded. — done in this commit.
3. [ ] Commit the Mineflayer repo's currently-uncommitted Camera/Screenshot removal
   (`main`, 66 files) so that already-made decision isn't sitting at risk.
4. [ ] Fix the MCFarmManager worktree's broken git metadata before any further work
   happens there.
5. [ ] Finish MCFarmManager Task 9 (live-verify history/pruning) and a Task-12-equivalent
   packaging pass; explicitly decide to skip Tasks 10–11 (its own dashboard) or confirm
   otherwise.
6. [ ] Design and build the new Node-side HTTP-polling integration layer against
   MCFarmManager's API — scope this as its own piece of work, not assumed free.
7. [ ] Decide MCFarmManager's HTTP port network exposure (loopback-only vs. LAN-wide
   behind the existing trust boundary) before deployment.
8. [ ] Update `ARCHITECTURE.md` and `TECHNICAL_SPEC.md` to remove the Mineflayer Manager,
   replace it with the MCFarmManager-backed sensing layer, and drop the now-moot teleport
   gameplay permission.
9. [ ] Confirm the real production server's Fabric/Carpet/mod versions match the dev
   server this investigation verified against, before deploying MCFarmManager there.
