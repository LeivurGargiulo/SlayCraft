# Site Overhaul Status

Tracks the MineCoop Wiki overhaul: style, navigation. Originally scoped as 4 phases (style,
navigation, animations, 3D player renders) — **Phases C (animations) and D (3D player renders)
were both cut**; the overhaul is complete at the end of Phase B, pending a merge decision. Each
completed phase has its own spec (`docs/superpowers/specs/`) and plan
(`docs/superpowers/plans/`). Update this file whenever status changes.

## Phase A: Style Refresh — DONE, not merged

Branch: `phase-a-style-refresh` (branched off `main`)
Spec: `docs/superpowers/specs/2026-07-22-phase-a-style-refresh-design.md`
Plan: `docs/superpowers/plans/2026-07-22-phase-a-style-refresh.md`

Subtle visual polish pass: deduped `ItemCard`/`RelatedTareas` components, sidebar active-link
accent bar, card hover polish (border/shadow/scale), pill/tag contrast, tareas priority
color-coding. 8 commits, all individually reviewed. Production build clean.

**Not yet merged to `main`.**

## Phase B: Navigation & Cross-Linking — DONE, not merged

Branch: `phase-b-navigation` (branched off `phase-a-style-refresh`, since it reuses `ItemCard`/`RelatedTareas`)
Spec: `docs/superpowers/specs/2026-07-25-phase-b-navigation-design.md`
Plan: `docs/superpowers/plans/2026-07-25-phase-b-navigation.md`

Fixed weak cross-linking: jugadores now have detail pages (`/jugadores/{slug}`) listing their
assigned tareas (including subtask-only assignments); the jugadores grid is clickable; every
`@username` mention on `tareas.astro` links to that player's page. 4 commits. Production build
clean (66 pages).

**Not yet merged to `main`. Stacked on top of Phase A — merge Phase A first, or merge both together.**

## Phase C: Animations — CUT

Considered during brainstorming: Phase A already covers hover micro-interactions (border/shadow/
scale on cards, sidebar accent bar); the option on the table for Phase C was entrance/reveal
animations (fade/slide-in on load and scroll) with page transitions as a further option.
**Descoped: decided no more animation work is needed.** No spec/plan/branch created.

## Phase D: 3D Player Renders — CUT

Originally planned (raw Minecraft skin texture files would have been needed for a real
interactive 3D viewer, e.g. via `skinview3d` — the current `src/content/jugadores/img/*.webp`
files are pre-rendered flat portraits, not raw skins, and couldn't have been used for this).
**Descoped.**

## Overhaul complete

With Phases C and D both cut, the overhaul's remaining work is Phase A + Phase B, both DONE and
awaiting a merge decision (see below). No further phases are planned.

## Merge order note

Phase B depends on Phase A's components (`ItemCard`, `RelatedTareas`, priority tokens) and is
branched on top of it — merge/rebase order matters: Phase A → Phase B → main, in that order,
whenever merging is decided.
