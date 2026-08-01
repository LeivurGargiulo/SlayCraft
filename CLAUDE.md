# SlayCraft

Monorepo: `slaycraft/dashboard/client` (React/Vite/Tailwind), `slaycraft/dashboard/server` (Fastify/better-sqlite3/zod),
`slaycraft/mod` (Fabric/Java mod), `server` (Fabric Minecraft server runtime),
docker-compose + Caddy for prod (nyttlandmc.net.ar).

mineflayer bot abandoned (too complex, insufficient time/tokens); archived to `_archive/mineflayer`.

## Skill map

Recurring task types in this repo and which skill covers them — check this before defaulting to ad-hoc work:

- New feature or multi-file change → `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development`
- Bug report (dashboard, mod) → `superpowers:systematic-debugging` before proposing a fix
- Any import/migration script touching live DB or slaycraft (e.g. `import-minecoop.ts`) → verify idempotency first, run under `superpowers:test-driven-development`
- Branch ready to merge → `superpowers:finishing-a-development-branch`
- Locating code / mapping a directory → delegate to `caveman:cavecrew-investigator` instead of manual grep
- Single-file mechanical edit (rename, typo, small function rewrite) → `caveman:cavecrew-builder`
- Reviewing a diff/branch → `caveman:cavecrew-reviewer` or `superpowers:requesting-code-review`
- Any code writing/review/refactor (dashboard, mod — near-universal) → apply `andrej-karpathy-skills:karpathy-guidelines` before proposing the change, not just when explicitly asked
- Post-implementation cleanup pass (reuse, redundant abstractions, dead flexibility) → `simplify`
- dashboard/client component or layout work → `frontend-design` for aesthetic/UX choices
- Adding a chart to the dashboard (recharts, production history, etc.) → `dataviz` before writing chart code
- Pre-merge security pass beyond mod/server auth flows (auth, cookies, slaycraft token) → `security-review`
- Library/API doc lookup (Fastify, React Query, zod, better-sqlite3) → `context7` MCP instead of relying on training data
- Multi-step reasoning on a hard bug or design tradeoff → `sequential-thinking` MCP
- Symbol-level code nav (find definition/references) in dashboard → `serena` MCP instead of grepping full files
- Before claiming a fix/feature/test-pass is done → `superpowers:verification-before-completion`, actually run the command (this repo's history has claimed "N/N pass" — verify, don't restate)
- Starting isolated feature work (e.g. a new dashboard fixes batch) → `superpowers:using-git-worktrees`
- 2+ independent open items → `superpowers:dispatching-parallel-agents` instead of serializing them
- Executing a written plan across a fresh/separate session → `superpowers:executing-plans`
- Acting on code-review feedback → `superpowers:receiving-code-review` before implementing suggestions verbatim
- Verifying a UI change actually works (dashboard/client) → `run` skill to launch and screenshot, not just typecheck
- Committing + opening a PR together → `commit-commands:commit-push-pr`
- After a session that changed conventions or repo layout → `claude-md-management:revise-claude-md` to keep this file current
- Whole-repo architecture or cross-service relationship questions (dashboard ↔ slaycraft HTTP) → `graphify` over ad-hoc grepping across all pieces; distinct from `serena` (single-symbol lookup) — use graphify when the question spans services, not one file
