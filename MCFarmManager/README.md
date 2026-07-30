# MCFarmManager

Read-only observability tool for Minecraft Fabric survival farms (Carpet-enabled servers,
MC 1.21.11). A server-side mod (built as a Carpet Extension) exposes farm/world/server state
over a local HTTP+JSON API and serves a small static dashboard on the same port — one
process, no separate backend or database server.

**Status:** design complete, not yet implemented.

- [`docs/SPEC.md`](docs/SPEC.md) — architecture, protocol, data model, config schema.
- [`docs/AGENT_BUILD_PROMPT.md`](docs/AGENT_BUILD_PROMPT.md) — phased brief for building it.

Read `SPEC.md` first.
