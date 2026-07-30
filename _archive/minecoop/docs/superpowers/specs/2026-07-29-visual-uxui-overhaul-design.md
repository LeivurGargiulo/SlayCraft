# Visual UX/UI Overhaul — Design

## Context

MineCoop Wiki is an Astro 7 + Tailwind 4 site for a Minecraft cooperative server
(proyectos, granjas, jugadores, tareas, galería, plus an internal `/admin` CRUD area).
The last UI pass (2026-07-25) was deliberately conservative: "stay within the docs
aesthetic, no thematic pivot, no new dependencies, no scroll-driven animation." That
pass shipped tokens, icons, load-in animation, and native view transitions.

The user now wants to go further: a real visual identity, not just polish. This spec
explicitly supersedes the prior non-goals around palette and motion — the deferred
"Phase C (animations) / Phase D (3D-ish)" ideas from that era, plus more.

## Goals

- A Minecraft-inspired palette and micro-theming (accent-level, not a full pixel skin)
  layered onto the existing dark, modern layout.
- A hero with real depth: scroll parallax, a pure-CSS block-texture overlay, no new
  image assets.
- Cards (`ItemCard`, homepage sections, admin sections) that feel dimensional — pointer
  tilt on hover, not just border/shadow swaps.
- Detail pages (`granjas/[slug]`, `proyectos/[slug]`, `jugadores/[slug]`) restructured
  with a header band (title over hero image) and breadcrumbs, instead of the current
  flat "back-link / h1 / gallery" stack.
- `/admin/*` gets the same design-system treatment as public pages (it already reuses
  the same layout/components, so this mostly falls out of the token and component
  changes).
- An Admin entry added to the sidebar nav — currently unreachable without typing the
  URL.
- Image loading tuned: explicit format/quality/responsive widths on every `<Image>`,
  eager+high-priority loading for each page's LCP image, lazy elsewhere.
- All motion respects `prefers-reduced-motion`, consistent with the existing pattern.

## Non-goals

- No full pixel-art skin (blocky fonts throughout, dithered textures everywhere) — this
  is accent-level theming on a modern base.
- No React, no WebGL/three.js, no 3D-rendered models. "3D-model-like" motion means CSS
  3D transforms (pointer-follow tilt, `perspective`/`rotateX`/`rotateY`), not a 3D
  engine.
- No new npm dependencies. Parallax, tilt, and reveal-on-scroll are CSS
  (`animation-timeline: view()`) + small vanilla `<script>` blocks, matching how the
  gallery carousel and nav toggle already work. Image compression uses Astro's existing
  Sharp-backed `<Image>` component.
- No changes to content schemas (`tareas`, `jugadores`, `proyectos`, `granjas`) or the
  admin auth/CRUD logic itself — visual/markup layer only.

## Design

### 1. Color & typography tokens (`src/styles/global.css`)

- Retune `--color-accent` (currently blue) toward a **lapis blue** and
  `--color-accent-2` (currently violet) toward an **emerald/grass green** — same token
  slots, new hex values, pick during implementation by checking contrast against
  `--color-bg`/`--color-surface` (WCAG AA for text use).
- Add one new token, `--color-wood` (a dirt/wood brown), for hero texture accents and
  section dividers only — not used for text or interactive states.
- Priority colors (redstone red, gold, emerald, stone gray) are unchanged — already
  thematically on-brand.
- Typography stays Inter (body/UI) + Space Grotesk (display, `h1`/`h2`) — unchanged.
  Add one pixel-style accent font (e.g. "Press Start 2P", same Google Fonts `<link>`
  mechanism already in `BaseLayout.astro`) used only for small badge/label accents:
  stat tile numbers (`index.astro`, `admin/index.astro`) and task priority pills
  (`tareas.astro`). Never used for body text or headings.

### 2. Hero (`src/pages/index.astro`, `src/components/Gallery.astro` banner usage)

- Scroll parallax on the banner layer: `animation-timeline: view()` as the primary
  mechanism, with an `IntersectionObserver` + `transform: translateY()` fallback script
  for browsers without scroll-driven animation support.
- A pure-CSS repeating-gradient "voxel grid" overlay at low opacity, layered with the
  existing radial accent glow behind the banner. No new image asset.
- Stat tiles gain the pointer-tilt treatment (see §3).

### 3. Cards & tilt-on-hover (`src/components/ItemCard.astro`, homepage/admin section
grids)

- One shared vanilla JS module: `pointermove` on a tilt-enabled element sets CSS custom
  properties (`--rx`, `--ry`) consumed by a `transform: perspective(600px)
  rotateX(var(--rx)) rotateY(var(--ry))` rule; resets on `pointerleave`. Attached via a
  `data-tilt` attribute, reused across `ItemCard`, homepage section cards, stat tiles,
  and the admin dashboard grid.
- `ItemCard`'s existing hover state (`border-accent`, `shadow-md`, image scale) is kept
  and combined with tilt, not replaced.
- Disabled under `prefers-reduced-motion: reduce` and on touch (no `pointermove`
  events on touch, so it's inert there by default — no extra guard needed).

### 4. Detail pages (`granjas/[slug].astro`, `proyectos/[slug].astro`,
`jugadores/[slug].astro`)

- Replace the current "← back link / h1 / gallery" stack with a header band: first
  gallery image as a large banner with the title overlaid, `loading="eager"
  fetchpriority="high"` (this is each page's LCP element).
- Breadcrumb (`Granjas / <name>`) replaces the plain back-link, styled consistently
  across the three detail page types.
- Gallery below the header band reuses the hero's parallax mechanism from §2 at a
  smaller scale.
- View transitions: named `view-transition-name` on the hero image so it morphs from
  the list card's thumbnail into the detail page's header band, instead of a flat
  cross-fade (building on the existing `<ClientRouter />` already in `BaseLayout`).

### 5. Sidebar (`src/components/Sidebar.astro`)

- Add an "Admin" link (existing inline-SVG icon style, a simple gear/lock glyph) below
  the content nav links, visually separated with a `border-t`. Points to `/admin` —
  relies on the existing `isAdmin` redirect-to-login for unauthenticated visitors, no
  client-side auth check needed in the sidebar itself.

### 6. Images & loading (all `<Image>` usages: `ItemCard`, `Gallery`, hero banner)

- Add explicit `format="webp"` and a tuned `quality` (start at 80, adjust if visibly
  soft) to every `<Image>` call.
- Add `widths` + `sizes` to grid/card thumbnails (`ItemCard`) so Astro generates
  responsive srcsets instead of one full-size image per card — currently unset.
- Each page's single LCP image (homepage hero banner, detail page header band) gets
  `loading="eager" fetchpriority="high"`; every other image keeps Astro's default
  `loading="lazy"`.

### 7. Motion mechanics (cross-cutting, mostly `global.css` + one small shared script)

- Parallax: `animation-timeline: view()` + IntersectionObserver/`transform` fallback
  (§2), reused for hero and detail-page galleries.
- Tilt: one shared vanilla JS module (§3), reused everywhere `data-tilt` appears.
- Reveal-on-scroll for below-the-fold sections: extends the existing `[data-stagger]`
  fade-up pattern (already in `global.css`) rather than introducing a new mechanism.
- Everything wrapped in `@media (prefers-reduced-motion: no-preference)` /
  `(prefers-reduced-motion: reduce)`, matching the existing pattern in `global.css`.

## Testing

Visual/CSS + vanilla JS, no new logic branches warranting unit tests. Verification is
manual, same shape as the prior UI pass:

- `astro dev --background`; visually check every public page (inicio, proyectos index
  + detail, granjas index + detail, jugadores index + detail, tareas, galería) and
  `/admin/*` at mobile and desktop widths.
- Confirm existing interactions still work: lightbox/gallery nav, copy-to-clipboard,
  tareas priority/status filters, username cross-links, admin CRUD forms.
- Confirm tilt is inert on touch devices and both hero/detail-page parallax degrade
  gracefully without JS-detected support.
- Confirm `prefers-reduced-motion: reduce` disables tilt, parallax, and load-in
  animation entirely.
- Spot-check color contrast (WCAG AA) for the retuned `--color-accent` /
  `--color-accent-2` against `--color-bg`/`--color-surface`, and for the pixel accent
  font at its small sizes.
- Lighthouse/PageSpeed pass on homepage and one detail page before/after, to confirm
  the image-loading changes (§6) actually improve LCP rather than just adding motion
  overhead.
