# Phase A: Style Refresh — Design

## Context

This is phase 1 of a 4-phase site overhaul (A: style refresh → B: navigation/IA →
C: animations → D: 3D player renders). Each phase gets its own spec/plan/implementation
cycle. This spec covers Phase A only.

MineCoop Wiki is an Astro 7 + Tailwind 4 info site for a Minecraft cooperative server
(proyectos, granjas, jugadores, tareas, galería, mapa). Current theme is a GitHub-dark-style
palette (near-black bg, blue accent, Inter font). Direction confirmed: **subtle refinement
only** — keep the dark, docs-flavored aesthetic; tighten spacing/contrast/hierarchy and
polish cards/hover states. No thematic (Minecraft pixel-art) pivot.

Scope: general consistency pass across all pages, not tied to specific reported pain points.

## Goals

- Eliminate duplicated markup between `proyectos` and `granjas` pages by extracting shared
  components, while upgrading their visual polish in the process.
- Make typographic hierarchy (page headers, section headers) consistent across all pages.
- Make the sidebar's current-page indicator clearer.
- Polish cards, pills/tags, and task priority so they're visually consistent and easier to scan.
- Verify muted-text and border contrast meet reasonable readability.

## Non-goals

- No new content sections, no IA/navigation restructuring (Phase B).
- No motion/animation work (Phase C).
- No 3D player renders (Phase D).
- No theme pivot (still dark, still the current color family).

## Components

### `ItemCard.astro` (new)
Thumbnail + title grid card. Replaces the duplicated `<li><a>...</a></li>` block in
`proyectos/index.astro` and `granjas/index.astro`.

- Props: `href`, `image` (`ImageMetadata`), `alt`, `title`.
- Style: `rounded-lg` border, `aspect-[4/3]` image, hover transitions from flat
  `opacity-80` fade to `border-accent` + subtle shadow + slight scale on the image.

### `RelatedTareas.astro` (new)
"Tareas relacionadas" checklist block. Replaces the duplicated block in
`proyectos/[slug].astro` and `granjas/[slug].astro`.

- Props: `tareas` (filtered task entries for the current proyecto/granja).
- Same status-label logic and checklist rendering as today, just de-duplicated.
- Back-link + `h1` in each `[slug].astro` stays inline (only 3 lines, not worth a
  third component).

No other new components. `Gallery.astro` and `CoordList.astro` are unchanged.

## Typography & layout

- Page header pattern (`h1` `text-2xl font-semibold` + `text-text-muted` subtitle) is
  already consistent across jugadores/tareas/galeria/proyectos/granjas index pages — keep
  as-is, no change needed.
- Section sub-headers currently mix scales for similar-purpose headers (e.g. "Tareas
  relacionadas" is `text-sm font-medium`, tareas page group headers are `text-lg
  font-semibold`). Normalize to two fixed scales:
  - **Group header** (top-level section on a page, e.g. "Pendiente (3)"): `text-lg font-semibold`.
  - **Section label** (subordinate block within a page, e.g. "Tareas relacionadas",
    "Coordenadas" if labeled): `text-sm font-medium text-text-muted`.
- Sidebar (`Sidebar.astro`): active link gets a left accent bar (`border-l-2
  border-accent`) in addition to the current background tint, so the current page reads
  clearly at a glance. Applies to both `/` and section links.

## Visual polish

- **Cards** (`ItemCard`, jugadores grid images, galeria thumbnails): unify to
  `rounded-lg` (currently mixed `rounded`/`rounded-full` across pages). Hover state
  becomes border-color transition to `accent` + `shadow-md`, replacing the flat opacity
  fade used today.
- **Pills/tags** (proyecto/granja tags on tareas list, "Copiar" button on `CoordList`):
  tighten padding, slightly raise contrast so they read as clickable at rest, not just
  on hover.
- **Tareas priority**: add a small left-border color indicator per priority (1=alta,
  2=media, 3=baja) using existing `accent`/`accent-muted` tokens plus one new muted
  amber-ish token if needed for the "media" tier, so priority is scannable without
  reading the label text.
- **Global contrast**: bump `--color-border` slightly lighter and re-check
  `--color-text-muted` against `--color-bg`/`--color-surface` for reasonable contrast;
  adjust only if it's clearly borderline.

## Testing

This is a visual/CSS-only pass with no new logic branches — no unit tests apply. Verification
is manual: run `astro dev --background`, visually check every page (inicio, proyectos index +
detail, granjas index + detail, jugadores, tareas, galeria, mapa) at mobile and desktop
widths, confirm no regressions (existing lightbox/gallery/copy-to-clipboard interactions
still work), and spot-check contrast.
