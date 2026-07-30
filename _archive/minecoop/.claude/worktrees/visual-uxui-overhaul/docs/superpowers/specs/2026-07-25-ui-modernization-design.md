# UI Modernization — Design

## Context

MineCoop Wiki is an Astro 7 + Tailwind 4 info site for a Minecraft cooperative server
(proyectos, granjas, jugadores, tareas, galería). The previous overhaul (Phase A: style
refresh, Phase B: navigation/cross-linking, both shipped) explicitly kept a dark,
GitHub-docs-style aesthetic with "subtle refinement only" and no thematic pivot; Phase C
(animations) and Phase D (3D player renders) were cut for scope.

The user now finds the site "tosco y seco" (rough and dry) and wants it to feel more
modern, elaborate, and fun to browse. Direction confirmed through discussion:

- **Stay within the docs aesthetic** — no thematic (Minecraft pixel-art) pivot, no
  editorial/illustrated redesign. Polish what exists.
- **Micro-interactions only** — subtle motion (hover, load-in, page transitions), not
  notorious/scroll-driven animation.
- **General pass** — covers the whole site, not one page.
- **Standard ambition level** (of three proposed: minimal / standard / extensive) —
  meaningfully changes how the site feels without adding new dependencies or content
  systems.

## Goals

- Give the color and typography system more character without abandoning the dark
  docs palette.
- Replace the flattest parts of the site (homepage stats line, homepage section list)
  with components that read as designed, not default.
- Add wayfinding/personality to the sidebar (icons) and make page-to-page navigation
  feel continuous instead of a hard cut.
- Make list/grid content (proyectos, granjas, jugadores, tareas) feel alive on load
  and make task priority scannable at a glance.

## Non-goals

- No thematic (Minecraft pixel-art) visual pivot.
- No new npm dependencies — everything ships with Tailwind, plain CSS, and Astro's
  built-in `<ClientRouter />` view transitions.
- No scroll-driven or "notorious" animation.
- No new content sections (activity feed, illustrations, masonry galleries) — flagged
  explicitly during design and cut for scope.
- No changes to content schemas (`tareas`, `jugadores`, `proyectos`, `granjas`).

## Design

### 1. Color & typography tokens (`src/styles/global.css`)

- Add `--color-accent-2`: a second accent (violet or teal — pick during implementation
  by checking contrast against `--color-bg`/`--color-surface`) for isolated character
  touches (stat tiles, sidebar icons). Does not replace `--color-accent` on links/focus
  states.
- Add `--color-surface-2`: a step lighter than `--color-surface`, for nested-card depth
  (stat tiles, hero glow backdrop).
- Add one display font (Google Fonts, same `<link>` mechanism `BaseLayout.astro`
  already uses for Inter/JetBrains Mono) as `--font-display`, applied only to page-level
  `h1`/`h2` (not section headers, not prose). Inter remains the body/UI font.

### 2. Homepage (`src/pages/index.astro`)

- **Stat tiles**: replace the monospaced `jugadores: N · proyectos: N · ...` line with
  a row of small tiles (`surface` background, `border`, rounded, big number + muted
  label), one per stat (jugadores, proyectos, granjas, fotos, desde). Responsive wrap,
  no new component needed beyond a local markup block — five stats isn't worth
  extracting.
- **Sections as cards**: replace the `<ul>`/`<li>` "Secciones" list with a responsive
  grid (2 cols mobile → 3–4 desktop) of cards sharing `ItemCard`'s visual language
  (border, `rounded-lg`, hover → `border-accent` + `shadow-md`) but without an image
  slot, since sections have no thumbnail. This is a distinct small block inline in
  `index.astro`, not a new shared component (only one page uses it).
- **Hero glow**: a fixed radial gradient using `--color-accent` at ~8–10% opacity with
  a large blur, positioned behind the existing `Gallery` banner. Pure CSS, no new image
  asset.

### 3. Sidebar & page navigation (`src/components/Sidebar.astro`, `src/layouts/BaseLayout.astro`)

- **Icons**: one small inline SVG per nav link (Inicio, Proyectos, Granjas, Mapa,
  Tareas, Jugadores, Galería) — simple outline glyphs authored inline, no icon library.
- **Active-state transition**: the existing left accent border + background tint
  (Phase A) gains a short CSS transition instead of snapping on/off.
- **Cross-page transitions**: enable Astro's built-in `<ClientRouter />` in
  `BaseLayout.astro` for native view transitions (cross-fade) between page loads. No
  custom JS, no dependency — this is the framework's own feature.

### 4. Lists, cards, and task priority

- **Load-in animation**: grid/list items (proyectos, granjas, jugadores grids; tareas
  list) fade + translate-Y in on load via CSS `@keyframes` with per-item
  `animation-delay` driven by `nth-child`, capped at a small number of steps so long
  lists don't have a multi-second cascade. Wrapped in
  `@media (prefers-reduced-motion: no-preference)` so reduced-motion users get no
  animation at all.
- **Cards**: existing Phase A hover treatment (`border-accent`, `shadow-md`, image
  scale) is unchanged — already meets the "subtle micro-interaction" bar.
- **Task priority badge**: `tareas.astro` gets a small colored pill (priority label,
  e.g. "Alta") next to each task title, using the same priority color tokens as the
  existing left-border indicator, so urgency reads without opening the secondary text.

## Testing

Visual/CSS + one native framework feature (view transitions) — no new logic branches
warranting unit tests. Verification is manual:

- `astro dev --background`; visually check every page (inicio, proyectos index +
  detail, granjas index + detail, jugadores index + detail, tareas, galería) at mobile
  and desktop widths.
- Confirm existing interactions still work: lightbox/gallery nav, copy-to-clipboard,
  tareas priority/status filters, username cross-links.
- Confirm `prefers-reduced-motion: reduce` disables load-in animation and view
  transitions degrade gracefully (Astro's `<ClientRouter />` respects this natively).
- Spot-check color contrast for the two new tokens against `--color-bg`/`--color-surface`.
