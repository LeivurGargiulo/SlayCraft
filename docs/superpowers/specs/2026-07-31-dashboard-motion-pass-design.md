# Dashboard motion pass

## Goal
Make the dashboard feel alive: page transitions, hover feedback, staggered
list/tile entrances, animated stat numbers, subtle ambient parallax. Scope:
global shell (Layout, Sidebar, Card) + Overview page. Other pages inherit the
shell/Card animations for free but get no page-specific work in this pass.

## Dependency
Add `framer-motion` to `dashboard/client/package.json`.

## New shared module
`dashboard/client/src/lib/motion.ts` — exports shared variants used across
pages so each page doesn't redefine them:
- `fadeUp`: `{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }`
- `staggerContainer`: parent variant with `staggerChildren` timing for list/grid children

## App root
Wrap the app in `MotionConfig reducedMotion="user"` (framer-motion) so every
animation in the app automatically respects `prefers-reduced-motion` without
each component checking it manually.

## Layout.tsx
- Wrap `<Outlet/>` in `AnimatePresence mode="wait"` + a `motion.div` keyed by
  `useLocation().pathname`. Fade + small y-shift in/out on route change.
- Add two fixed, `pointer-events-none`, low-opacity radial-gradient blobs
  (gold, cyan) behind the content as ambient background.
- Add `useParallax(factor)` hook (new, no dependency): rAF-throttled scroll
  listener reading `window.scrollY`, returns a translateY value. Apply to the
  two blobs at different factors (~0.3 and ~0.15) so they drift at different
  speeds relative to scroll. `MotionConfig`'s reduced-motion setting doesn't
  cover manual scroll listeners, so `useParallax` checks
  `matchMedia('(prefers-reduced-motion: reduce)')` itself and returns 0 (no
  transform) when set.

## Sidebar.tsx
- Active nav link: replace instant background class swap with a
  `layoutId="active-pill"` `motion.div` behind the active link, animating
  position/size between routes.
- Links get `whileHover={{ x: 2 }}` for a small nudge on hover.

## Card.tsx
- Convert to `motion.div`. Add `whileHover={{ y: -2 }}` and a border-color
  transition on hover. Spring transition, short duration. This is the one
  file most pages already use, so hover feedback propagates app-wide with a
  single change.

## Overview.tsx
- Stat tile grid becomes a `motion.div` with `staggerContainer`; each `Card`
  child uses `fadeUp` so tiles fade/slide in staggered on mount.
- Stat numbers (TPS, players online, healthy farm count) animate via a new
  `useAnimatedNumber(target: number, duration?: number)` hook (plain
  `requestAnimationFrame` counter, no dependency) instead of snapping
  directly to the value. Skips animation (renders target immediately) when
  `prefers-reduced-motion` is set.
- Task/farm list items (`needsAttention`, `flaggedFarms`) use the same
  `staggerContainer`/`fadeUp` pattern as the stat tiles.

## Out of scope
- No animation work on Granjas, Jugadores, Proyectos, Tareas, Galería, Mapa
  beyond what they inherit from Layout/Card/page-transition.
- No cursor-tilt parallax — ambient scroll-parallax only, per user choice.
- No skeleton/shimmer loading states — not requested.

## Testing
- Manual: verify page transitions, sidebar pill animation, card hover,
  Overview stagger + counters, parallax blobs on scroll, and that setting OS
  "reduce motion" disables transitions/parallax/counters.
- `tsc` + `vite build` must stay clean (existing project gate).
