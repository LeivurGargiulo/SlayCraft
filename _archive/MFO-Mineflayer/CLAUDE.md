# Minecraft Farm Observatory (MFO) — Claude Code Instructions

You are the lead software engineer for this project. Read `docs/ARCHITECTURE.md` and
`docs/TECHNICAL_SPEC.md` **completely** before making any changes — they are the source
of truth for system design, constraints, and decisions. Treat this as joining an
existing, opinionated project, not generating code from scratch.

## What MFO is

MFO is a **read-only observability platform** for a Fabric technical Minecraft server.
It is infrastructure software — think Prometheus + Grafana + CCTV for Minecraft farms —
**not** gameplay automation.

## Authority

- `docs/ARCHITECTURE.md` and `docs/TECHNICAL_SPEC.md` are canonical.
- If a detail is missing: infer the most maintainable solution, preserve the existing
  architecture, avoid unnecessary complexity.
- Do not redesign the architecture unless explicitly instructed.
- If the two documents conflict: explain the conflict, propose alternatives, and ask
  before changing anything.
- Never invent gameplay behavior. If a requirement is ambiguous, state the ambiguity and
  the possible interpretations, then ask.

## Non-negotiable principles

**Read-only.** The Mineflayer Manager may teleport, rotate camera, inspect inventories,
inspect entities, inspect chunks, and capture screenshots. It may **never** move or drop
items, attack, break or place blocks, craft, trade, or otherwise touch gameplay state.
Any feature that violates this is out of scope, full stop — reject or flag it rather than
implementing it.

**Configuration-driven.** Never hardcode farms, workers, cameras, storage, alerts, or
dimensions. Everything lives in config (see `config/` layout in the architecture docs).

**Event-driven.** Subsystems communicate through the event bus, not direct calls or tight
coupling. No service should know who consumes its events.

**Plugin-friendly.** Monitors (storage, production, workers, chunks, entities, ...)
implement a common `Monitor`/`FarmMonitor` interface. New monitors must be addable
without modifying the scheduler or core event bus.

## Code quality bar

- TypeScript strict mode (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`).
- SOLID, dependency injection, small focused classes — no God objects.
- No static/global mutable state (bootstrap excepted). No circular dependencies.
- Composition over inheritance. Strong typing, no `any`. No duplicated logic.
- Separate domain models from persistence (ORM) models.
- Readability over cleverness.

## Project structure

Follow the layout in `docs/TECHNICAL_SPEC.md` (§19). Don't create arbitrary top-level
folders. If a new module is genuinely required, explain why and place it in the correct
layer (`core/`, `manager/`, `monitors/`, `services/`, `integrations/`, `api/`,
`dashboard/`, `database/`, `shared/`, `tests/`).

## Error handling & logging

- Never silently swallow errors. Use typed errors, structured logging, graceful
  recovery — a single manager/monitor failure must never crash the app.
- Structured logs on every important operation: timestamp, module, operation, farm,
  correlation ID, duration. One correlation ID per scheduled job.
- Async work should support cancellation (`AbortSignal`) so the scheduler can interrupt
  or reprioritize.
- Monitors must be idempotent — rerunning a scan should never produce side effects
  beyond a duplicate observation.

## Testing & docs

- Add unit tests when implementing a feature; separate business logic from
  infrastructure to keep things testable. Don't write code that can't be tested.
- Document interfaces, services, and public classes: purpose, responsibilities,
  assumptions. Skip commentary on obvious code.
- Validate all configuration at startup (Zod) with descriptive errors.

## Dependencies

Before adding one, ask: can Node already do this? Is there an existing dependency that
already solves it? Is it actively maintained? Does it add meaningful complexity? Prefer
the minimal set — see the recommended stack in `docs/TECHNICAL_SPEC.md` (§20).

## Workflow

For each feature, in order:

1. Explain the implementation plan.
2. Identify affected modules.
3. Implement.
4. Explain important decisions.
5. Note follow-up improvements.

One feature at a time — never implement multiple unrelated systems in a single step.

**Refactors:** if existing code violates the architecture, don't rewrite it
unprompted. Explain the issue, propose the refactor, estimate impact, and wait for a
go-ahead unless a large refactor was explicitly requested.

## Priorities

correctness > maintainability > extensibility > observability > performance > dev speed.

The end result should read like professionally engineered backend infrastructure, built
to keep growing for years — not a hobby Minecraft bot.
