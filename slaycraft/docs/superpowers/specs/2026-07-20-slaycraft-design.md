# SlayCraft Showcase Site — Design Spec

Date: 2026-07-20

## Purpose

A static showcase/documentation site for SlayCraft, a cooperative Minecraft
survival server. Content-driven via markdown (Astro Content Collections) so
the site owner (only editor) can add projects/players/tasks/gallery entries
by dropping a new `.md` file — no code changes for routine updates. No
backend, no database, no auth. Deployed as a static build.

## Language

The entire site — nav, UI copy, buttons, labels, seed content — is written in
**Argentine Spanish (voseo)**. This is fixed, not user-selectable. No i18n
framework: a single hardcoded language needs no abstraction layer, just
Spanish strings directly in components and content.

## Tech stack

- **Astro** (latest, 5/6-era APIs) + `@astrojs/react` for interactive
  islands only (theme toggle, project filter/sort, gallery lightbox).
  Everything else renders as static Astro components — no unnecessary
  hydration.
- **Tailwind CSS** for styling, CSS custom properties for theme tokens.
- **Astro Content Collections**, defined in `src/content.config.ts` (current
  Astro convention — not the legacy `src/content/config.ts`) using the
  `glob` loader per collection, content files under `src/content/<name>/`.
- **No animation library.** Parallax and scroll-reveals are done with plain
  CSS transforms driven by a small shared scroll listener / a single
  `IntersectionObserver` hook, gated behind `prefers-reduced-motion`. Framer
  Motion was considered and dropped — it doesn't add anything CSS can't do
  for this feature set and pulls in a real dependency.
- **Package manager: npm.**
- **Deploy target: Netlify** — root-domain static hosting, no GitHub
  Pages `base` path juggling needed. Site must still build cleanly with
  `npm run build` and be portable to Pages later if that ever changes (no
  Netlify-specific coupling beyond the default build output).

## Theming — "surface vs underground"

Light mode = surface, dark mode = underground. The accent color itself
changes (not just inverted lightness) to sell the metaphor.

**Light (`data-theme="light"` / default):**
- `--bg: #F5F1E3`
- `--accent: #3D8B37`
- `--border-strong: #7A5230`
- `--info: #5C7A99`
- `--text: #2B2B2B`

**Dark (`data-theme="dark"`):**
- `--bg: #151515`
- `--surface: #1E1E1E`
- `--accent: #4A9EFF`
- `--border-strong: #8B6F47`
- `--text: #E8E3D3`

Tokens are CSS custom properties on `:root`/`[data-theme]`, consumed via
`var(--token)` everywhere — no hardcoded hex in components.

**No-flash-of-wrong-theme:** an inline `<script>` in `<head>`, before any
CSS, reads `localStorage.theme` → falls back to
`matchMedia('(prefers-color-scheme: dark)')` → sets `data-theme` on
`<html>` synchronously. The toggle (a small React island) just flips the
attribute and writes `localStorage`.

## Typography

- **Display** — `Press Start 2P` (Google Fonts). Wordmark "SLAYCRAFT",
  section eyebrows, standalone large numbers (coordinate callouts) only.
  Never body text.
- **Body** — `Inter`. Prose, descriptions, nav labels.
- **Utility/data** — `JetBrains Mono`. Coordinates, dates, stats, usernames,
  task IDs.

Loaded via standard Google Fonts `<link>` with `preconnect` — self-hosting
would be extra build tooling for a marginal perf gain on a small static
site; not worth it here.

## Signature layout: terrain cross-section hero

Full-width layered cross-section on the Home hero: sky + drifting clouds at
top, grass band, stone band, deepslate band at the bottom. Built as stacked
`<div>`/inline-SVG bands in a fixed-height container, not an image.

- Each band gets `transform: translateY()` scaled by a different multiplier
  from scroll position (rAF-throttled scroll listener, `will-change:
  transform`).
- Under `prefers-reduced-motion: reduce`, the scroll listener is never
  attached — bands render at rest, fully static, no JS cost.
- Cloud drift (independent of scroll) is a slow CSS `@keyframes` animation,
  also disabled under reduced-motion.
- This is the one signature animated moment on the site. Section reveals
  elsewhere (Projects grid, Players grid, etc.) are subtle
  fade/slide-on-scroll-into-view via the shared `IntersectionObserver` hook
  — not competing for attention.

Section framing leans on the metaphor where earned (Proyectos as
"estructuras construidas en la superficie", Mapa as "el mundo visto desde
arriba", Jugadores as "puntos de spawn") without forcing numbered
"01/02/03" sequencing anywhere — the content has no real order.

## Content Collections

All in `src/content.config.ts`, `glob` loader, Zod schemas.

### `projects`
```
title: string
author: string            // player slug reference, e.g. "lei"
biome: string
coordinates: { x: number, y: number, z: number }
mapPosition: { x: number, y: number }.optional()   // % position for pin map
status: "in-progress" | "completed"
date: coerce.date()
coverImage: image path (string, resolved from src/assets/ or public/)
tags: string[].optional()
body: markdown
```
Card: cover image, title, author, status badge, coordinates in mono.
Detail page (`/proyectos/[slug]`): full body, image gallery if multiple
images given, "Copiar coordenadas" button (clipboard API).
Grid has client-side filter/sort (status, author, biome) — a React island,
no backend needed since the dataset is small and fully known at build time.

Cross-collection references (`author` → player slug, task `assignee` →
player slug) are plain strings, resolved by lookup at render time, not
validated by Zod. A custom FK-validation layer isn't worth building for a
single-editor, few-dozen-entries content set — a typo just shows as a
missing author link, which is easy to spot and fix by hand.

### `players`
```
username: string
role: string          // e.g. "redstone", "builder", "farmer"
joinDate: coerce.date()
skinImage: image path
body: markdown (bio)
```
Grid framed lightly as "puntos de spawn" — label, not a forced theme.

### `tasks`
```
title: string
status: "todo" | "in-progress" | "done"
assignee: string.optional()     // player slug reference
priority: string.optional()
notes: string.optional()
```
Three static columns — "Por hacer / En progreso / Terminado" — read-only,
non-interactive checkbox styling reflecting status. No drag-and-drop (single
editor, edits markdown directly).

### `gallery`
```
image: image path
caption: string
date: coerce.date()
tags: string[].optional()
```
Masonry/grid layout, click opens a lightbox (React island, focus-trapped,
Escape/click-outside to close, arrow-key navigation between images).

## Pages

| Route | Content |
|---|---|
| `/` | Terrain hero + wordmark + one-line description; stat callouts (mono font) computed from collection counts at build time ("Desde [fecha]", "X jugadores", "X estructuras registradas") |
| `/proyectos` | Filterable/sortable grid |
| `/proyectos/[slug]` | Full project detail |
| `/mapa` | "Abrir mapa en vivo ↗" card linking to the external squaremap URL (opens new tab) + static image map with clickable/hoverable pins from `mapPosition` |
| `/tareas` | Three-column read-only kanban |
| `/jugadores` | Player card grid |
| `/galeria` | Masonry grid + lightbox |

Nav (persistent header, all pages): Inicio / Proyectos / Mapa / Tareas /
Jugadores / Galería, plus theme toggle. Visible keyboard focus states
throughout (`:focus-visible` styling using the accent token).

## Map page — link-out, not embed

Decision: **no iframe embed of the self-hosted squaremap**, because:
1. It's only reachable on the site owner's LAN/machine — not resolvable by
   public visitors without port-forwarding or a tunnel.
2. squaremap serves plain HTTP by default; a Netlify HTTPS page can't embed
   an HTTP iframe (mixed content blocking) without the map also sitting
   behind TLS.
3. It isn't always online, and cross-origin iframes give no reliable way to
   detect that and swap in a fallback — not worth building detection logic
   for a self-controlled toggle.

Implementation: one config constant, `MAP_URL` (empty by default → renders
"Mapa no configurado todavía" state). When set, renders an "Abrir mapa en
vivo ↗" link/button opening the external squaremap URL in a new tab. The
static pin map (built regardless, using `coordinates`/`mapPosition` from
the `projects` collection, pins linking to project detail pages) is the
reliable always-on complement.

An iframe code path is *not* included at all in this pass — if the map
ever moves behind stable HTTPS the owner can add an `<iframe src={MAP_URL}>`
next to the link button later; no premature toggle/flag for a mode that
isn't used today.

## Build quality bar

- Fully responsive to mobile.
- Visible keyboard focus states everywhere interactive.
- `prefers-reduced-motion` respected (parallax/scroll animation off,
  static cross-section instead).
- No flash of unstyled/wrong-theme content on load.
- Clean nav IA as listed above.

## Seed content

Two example entries per collection (`projects`, `players`, `tasks`,
`gallery`), Argentine Spanish placeholder copy in a plain, non-marketing
register. Placeholder cover/skin/gallery images are simple generated SVGs
committed under `src/assets/` (no real screenshots available yet).

## Explicitly out of scope

- i18n framework (single fixed language).
- Live map iframe embed (see above).
- Drag-and-drop task board (read-only, markdown-driven).
- Any backend, database, auth, or dynamic API — fully static build.
- Cross-collection referential validation beyond string lookup.
