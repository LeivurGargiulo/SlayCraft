# Visual UX/UI Overhaul v2 — Design

## Context

The first overhaul pass (`docs/superpowers/specs/2026-07-29-visual-uxui-overhaul-design.md`,
already implemented on `feature/visual-uxui-overhaul`) was deliberately scoped as
"accent-level theming on a modern base": palette retune, hero parallax, card tilt, a
pixel font used only on tiny badges, a header-band restructure for detail pages. Once
deployed, it read as too subtle — the changes are real but easy to miss (hover-only
tilt, scroll-only parallax, a 40%-opacity texture) and the site's structure, typography,
and data organization are essentially unchanged from before.

This spec supersedes v1's restraint. It keeps everything v1 already shipped (tokens
infra, tilt/parallax mechanics, reduced-motion handling, image-loading tuning) but goes
much further: a real per-section visual identity, a bigger typographic system, and
actual structural changes to the homepage, list pages, detail pages, sidebar, and admin
— not just restyling.

## Goals

- A Minecraft *material* palette: each content section (granjas, proyectos, jugadores,
  tareas, galería) gets its own accent color, used consistently as a color-coding system
  across nav, cards, and detail pages — not one or two generic accent colors.
- A visibly bigger typographic system: larger display-type scale, and the pixel font
  promoted from tiny badges to section labels/page eyebrows.
- A pixel-grid/block-texture motif used structurally (section dividers, card
  backgrounds), not just as a hero accent.
- A single shared `PriorityBadge` component, replacing the priority markup currently
  duplicated in `tareas.astro` and the plain-text priority in `admin/tareas.astro`, and
  added to `RelatedTareas.astro` (which today shows status only).
- Homepage restructured into a bento-style dashboard: section-colored cards, a
  "recently active" widget.
- List pages (granjas/proyectos/jugadores) get richer cards (related-tareas count, top
  priority, section color) and real client-side sort controls, matching the interaction
  pattern `tareas.astro` already uses for its filters.
- Detail pages (granja/proyecto/jugador) restructured into a two-column body: media on
  one side, a metadata + related-tareas sidebar (with `PriorityBadge`, sorted by
  priority) on the other, below the v1 header-band.
- Sidebar reorganized into labeled, color-coded groups, with the still-missing Admin
  link added.
- `/admin/*` gets the same tokens/type/badge/section-color treatment; `admin/index.astro`
  becomes a bento dashboard mirroring the public homepage's layout.

## Non-goals

- No new npm dependencies — sort/filter interactivity reuses the vanilla
  `<script data-astro-rerun>` + `<select>` pattern already in `tareas.astro`.
- No React, no WebGL/3D engine — carried forward from v1.
- No category/tag field added to granjas or proyectos. They have no groupable metadata
  today (just title/id/coordinates) and adding one was explicitly declined — list pages
  stay flat grids, richer via presentation (counts, sort) rather than true grouping.
- No change to admin's CRUD interaction mechanics (`<details>` create/edit forms, the
  fetch + delayed-reload pattern) — visual/structural layer only.
- No fabricated "recently active" data — it's driven by a real new `updatedAt` field
  (see §4), not a guess.

## Design

### 1. Color tokens (`src/styles/global.css`)

Add per-section accent tokens alongside the existing `--color-bg`/`--color-surface` dark
base and the untouched priority palette:

- `--color-granjas`: emerald green
- `--color-proyectos`: lapis blue (close to today's `--color-accent` so the base palette
  doesn't feel alien)
- `--color-jugadores`: amethyst purple (close to today's `--color-accent-2`)
- `--color-tareas`: diamond cyan — deliberately distinct from the priority palette
  (redstone/gold/emerald/gray) so section color and priority color are never confused
- `--color-galeria`: glowstone gold
- `--color-admin`: muted netherite gray-purple, signaling "different area" without
  competing with content colors
- `--color-wood` (from v1) stays for hero texture + Mapa/server-adjacent accents

Pick exact hex values during implementation, checking WCAG AA contrast against
`--color-bg`/`--color-surface` for any text use, same as v1's process for its two
tokens. `--color-accent`/`--color-accent-2` remain as generic fallbacks (focus rings,
selection, non-section-specific UI) — they are not removed, just no longer the only
accent story.

### 2. Typography (`src/styles/global.css`, `BaseLayout.astro`)

- Increase the display type scale: bump `h1`/`h2` sizes (and their line-height/tracking)
  a tier up from v1, for real size contrast against body text.
- Promote the pixel font from "tiny badge only" to also cover section
  labels/eyebrows — a small pixel-font label (e.g. "GRANJAS") above the real `<h1>` on
  list/detail pages, and above the "Secciones" bento grid on the homepage. Body text
  (Inter) and the `.prose` markdown body are never pixel-font — readability-critical
  text is unaffected.
- Voxel-grid texture (from v1, currently a hero-only overlay) becomes a reusable
  utility class, applied at low opacity to section dividers and select card backgrounds
  (bento cards, detail-page metadata sidebar) so it reads as a structural motif rather
  than a one-off hero decoration.

### 3. `PriorityBadge` component (new: `src/components/PriorityBadge.astro`)

- Props: `priority: number` (1–5). Renders the pill markup currently inlined in
  `tareas.astro` (`priorityLabels`/`priorityTextClass`/border classes) as a standalone
  component.
- Replaces: the inline pill in `tareas.astro`, the plain-text
  `"Prioridad {t.priority}"` in `admin/tareas.astro`.
- Added to `RelatedTareas.astro`: each related tarea row gains a `PriorityBadge` next to
  its status label, and the list is sorted by priority (ascending, matching
  `tareas.astro`'s existing sort) instead of source order. This is the only behavior
  change to `RelatedTareas.astro` — it still shows the same tareas, just ordered and
  badged.

### 4. `updatedAt` timestamp (`src/lib/tareas.ts`, `granjas.ts`, `proyectos.ts`,
`jugadores.ts`, and their admin API routes)

- Add an `updatedAt: string` (ISO timestamp) field to each of the four blob-backed
  types, set server-side on every create/edit in the corresponding
  `/api/admin/*` route — not user-editable, no new form field.
- Existing records without the field are treated as "unknown recency" (excluded from
  the homepage "recently active" widget rather than sorted as oldest/newest) until
  they're next edited.

### 5. Homepage bento dashboard (`src/pages/index.astro`)

- Restructure into a bento-grid layout: the gallery banner stays large/prominent at the
  top (unchanged from v1's parallax treatment). Below it, the stat tiles and the 6
  section link cards are laid out as differently-sized bento cells, each section card
  tinted with its `--color-*` token from §1 (border/glow, not full background fill, to
  keep the dark base consistent).
- New "recently active" cell: the 3–5 most recently updated granjas/proyectos/jugadores
  (via §4's `updatedAt`), each a small link with its section-color accent.
- Stat tiles keep the pixel-font number treatment from v1.

### 6. List pages (`granjas/index.astro`, `proyectos/index.astro`, `jugadores.astro`,
`tareas.astro`)

- Granjas/proyectos: still flat grids (no category field — see Non-goals), but
  `ItemCard` gains: a related-tareas count and top-priority `PriorityBadge` (computed
  from each granja/proyecto's linked tareas), and a thin section-color border. Add a
  sort `<select>` (alphabetical / most pending tareas / highest priority) using the same
  vanilla `data-astro-rerun` script pattern as `tareas.astro`'s existing filters — client
  reorders the DOM list, no new fetch.
- Jugadores: keeps its `actividad` grouping; cards gain the same related-tareas-count +
  priority-badge treatment as granjas/proyectos cards.
- Tareas: keeps existing status-grouping and filter `<select>`s; its inline priority
  pill is replaced by `PriorityBadge` (§3).

### 7. Detail pages (`granjas/[slug].astro`, `proyectos/[slug].astro`,
`jugadores/[slug].astro`)

- Keep v1's header-band (title over hero image) on top.
- Below it, a two-column body (stacks to one column on mobile): gallery/media in the
  main column, a metadata + related-tareas sidebar in the secondary column. The sidebar
  shows coordinates (granjas/proyectos) or actividad (jugadores) plus the
  `RelatedTareas` list (now priority-sorted and badged per §3).
- Each detail page type is tinted with its section color (granja page uses
  `--color-granjas`, etc.) on the header-band accent and sidebar borders.

### 8. Sidebar (`src/components/Sidebar.astro`)

- Reorganize the current flat link list into labeled groups:
  - **Contenido**: Proyectos, Granjas, Jugadores — each link gets a small color dot
    matching its `--color-*` token.
  - **Actividad**: Tareas, Galería.
  - **Servidor**: Mapa (external link, unchanged).
  - **Admin**: the Admin link (already planned in v1, not yet added) — its own group at
    the bottom.
- Inicio stays as its own top item, unchanged. Same total link set as today — this is a
  grouping/labeling change, not a navigation redesign.

### 9. Admin parity (`src/pages/admin/*`)

- `admin/index.astro` restructured into a bento dashboard mirroring §5's layout (stat
  cards as bento cells, `--color-admin` as the page's accent instead of a section
  color).
- `admin/tareas.astro`, `admin/granjas.astro`, `admin/proyectos.astro`,
  `admin/jugadores.astro`: pick up the relevant section color and `PriorityBadge` (for
  `admin/tareas.astro`) — same `<details>`-based create/edit/delete/reload mechanics,
  visual layer only.

### 10. Motion (carried forward from v1, extended)

- Tilt (`data-tilt`) and parallax (`data-parallax`) mechanics are unchanged from v1's
  shared vanilla script — now also applied to the new bento cards (§5, §9) and detail
  sidebar (§7).
- Voxel-grid texture (§2) and all motion remain gated by
  `prefers-reduced-motion: reduce`, matching the existing pattern.

## Testing

Same manual-verification shape as v1, expanded for the new surface area:

- `astro dev --background`; visually check every public page and `/admin/*` at mobile
  and desktop widths, confirming section colors are correctly applied per page/card.
- Confirm `PriorityBadge` renders identically (same colors/labels) in `tareas.astro`,
  `admin/tareas.astro`, and `RelatedTareas.astro` on all three detail page types.
- Confirm related-tareas lists are priority-sorted on granja/proyecto/jugador detail
  pages.
- Confirm the homepage "recently active" widget reflects real edits: edit a granja in
  admin, verify it appears/reorders on the next homepage load; confirm records without
  `updatedAt` are excluded rather than mis-sorted.
- Confirm granjas/proyectos/jugadores list-page sort controls reorder correctly and
  degrade gracefully (no JS = default alphabetical order, matching current behavior).
- Confirm existing interactions still work: lightbox/gallery nav, copy-to-clipboard,
  tareas priority/status filters, username cross-links, admin CRUD forms.
- Confirm `prefers-reduced-motion: reduce` still disables tilt/parallax/texture-motion
  entirely (behavior unchanged from v1, just wider surface area).
- Spot-check WCAG AA contrast for all six new `--color-*` tokens against
  `--color-bg`/`--color-surface`, and for pixel-font labels at their sizes.
- Two-column detail-page layout and bento homepage/admin layout checked at mobile width
  (single column) and desktop width (multi-column) — this is genuinely new layout code,
  not just restyling, so needs real responsive verification.
