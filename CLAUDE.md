# SlayCraft

Monorepo: `dashboard/client` (React/Vite/Tailwind), `dashboard/server` (Fastify/better-sqlite3/zod),
`mineflayer/mineflayer-agent` (LLM bot, Gemini+OpenAI), `MCFarmManager` (Fabric/Java mod),
docker-compose + Caddy for prod (nyttlandmc.net.ar).

## Skill map

Recurring task types in this repo and which skill covers them — check this before defaulting to ad-hoc work:

- New feature or multi-file change → `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development`
- Bug report (dashboard, bot, mod) → `superpowers:systematic-debugging` before proposing a fix
- Any import/migration script touching live DB or MCFarmManager (e.g. `import-minecoop.ts`) → verify idempotency first, run under `superpowers:test-driven-development`
- mineflayer-agent file-path or schematic/litematic handling → security-focused review pass before merge (path traversal history in `buildSchematic.js`/`schemLoader.js`/`litematicLoader.js`)
- Branch ready to merge → `superpowers:finishing-a-development-branch`
- Locating code / mapping a directory → delegate to `caveman:cavecrew-investigator` instead of manual grep
- Single-file mechanical edit (rename, typo, small function rewrite) → `caveman:cavecrew-builder`
- Reviewing a diff/branch → `caveman:cavecrew-reviewer` or `superpowers:requesting-code-review`
