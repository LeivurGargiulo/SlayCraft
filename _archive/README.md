# Archive

Superseded/retired pieces from this repo's consolidation session (2026-07-30). Moved,
not deleted — history and content are preserved. See `MFO/docs/adr/0002-manager-runtime-mcfarmmanager-fabric-mod.md`
for the full reasoning behind the sensing-runtime decision that drove most of this.

- **`MFO-Mineflayer/`** — the original Mineflayer-driven Manager (Discord bot, JWT-auth
  dashboard, Drizzle schema, REST/WebSocket API). Retired per ADR-0002: its sensing
  approach has two structural reliability problems (keep-alive/tick-lag disconnects,
  registry-sync hard-kicks) that MCFarmManager sidesteps entirely by reading server
  state in-process instead of simulating a client. Fully superseded, not kept alongside.

- **`MFO-BridgeMod/`** — client-side Fabric mod (`net.leivur.mfobridge`) that would let
  the old Manager drive a real Minecraft client instead of a simulated one. Set aside in
  ADR-0002 (Option D): its only real win was fixing screenshots, which are out of scope
  project-wide (see `registrycompat/` note below and ADR-0002 Context #1). Kept, not
  deleted, in case camera/screenshots become a real priority again later.

- **`registrycompat/`** — investigated during this session and found to be a
  byte-identical duplicate of `MFO-BridgeMod/`'s source (same 4 Java files, same
  `net.leivur.mfobridge` package) despite its name. It is **not** the `mfo-registry-compat`
  mod ADR-0002 describes as deployed on the live server (`servers/fabric/mods/mfo-registry-compat-1.0.0.jar`)
  — that mod's source doesn't exist anywhere in this repo, only its built jar. Archived
  as a stray duplicate of BridgeMod; confirmed with Lei before archiving.

- **`minecoop/`** — prior Astro-based coordination site. Retired: the new dashboard
  (Phase 4 of this session) is designed fresh, using this only as background reading for
  what entities/fields to track, not as a code base to port from.

- **`slaycraft/`** — the live-at-the-time public site. Archived once the new dashboard
  replaces it, so there's no ambiguity about which site is real going forward.

- **`servers-vanilla/`** — a second, effectively-empty server directory (0 mods, stale
  log) found alongside the real, live `servers/fabric` (66 mods, MCFarmManager +
  registry-compat deployed, active log). Confirmed with Lei that `servers/fabric` is the
  one going forward; this one is archived as a stale/abandoned attempt. Kept outside git
  (see `.gitignore`) same as the original `servers/` tree — these are server binaries and
  world saves, not source.
