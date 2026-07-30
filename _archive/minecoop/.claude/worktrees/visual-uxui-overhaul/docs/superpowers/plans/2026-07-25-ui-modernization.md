# UI Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MineCoop Wiki feel modern, elaborate, and fun to browse while staying inside its existing dark docs aesthetic — no new dependencies, no thematic pivot, only subtle motion.

**Architecture:** Pure CSS/Tailwind-token and Astro-markup changes across existing files. No new components except small inline markup blocks that don't warrant extraction (each used on exactly one page). Motion comes from CSS `@keyframes`/`transition` and Astro's built-in `<ClientRouter />` — no client-side JS libraries.

**Tech Stack:** Astro 7, Tailwind 4 (CSS-first `@theme` config in `src/styles/global.css`), no test runner in this repo (see Testing below).

## Global Constraints

- No new npm dependencies (spec non-goal).
- No thematic (Minecraft pixel-art) visual pivot (spec non-goal).
- No scroll-driven or "notorious" animation — hover, load-in, and page-transition motion only, all must respect `prefers-reduced-motion: reduce`.
- No content-schema changes (`tareas`, `jugadores`, `proyectos`, `granjas` collections untouched).
- All work happens on branch `ui-modernization` (already checked out), never on `main`.
- This repo has no test runner (`package.json` scripts: `dev`, `build`, `preview`, `astro`). "Test" steps in this plan mean: `npm run build` for a type/syntax check, plus a manual visual check via `astro dev --background` per `CLAUDE.md`. There are no unit tests to write — this is a CSS/markup-only change set with no new logic branches.

---

## Task 1: Color & typography foundation

**Files:**
- Modify: `src/styles/global.css:1-14` (`@theme` block)
- Modify: `src/layouts/BaseLayout.astro:20-26` (font `<link>` tags)

**Interfaces:**
- Produces: CSS custom properties `--color-accent-2` (`#a371f7`, violet) and `--color-surface-2` (`#21262d`) — consumed by Task 3 (homepage stat tiles/hero glow) and Task 2 (sidebar icons). `--font-display` (`"Space Grotesk"`) — applied globally to all `h1`/`h2` via a plain CSS rule, no consumer needs to reference it directly.

- [ ] **Step 1: Add the two color tokens**

In `src/styles/global.css`, inside the existing `@theme` block, add after `--color-accent-muted: #3d8b37;`:

```css
  --color-accent-2: #a371f7;
  --color-surface-2: #21262d;
```

- [ ] **Step 2: Add the display font token and Google Fonts import**

Still in the `@theme` block, after `--font-mono: "JetBrains Mono", ui-monospace, monospace;`, add:

```css
  --font-display: "Space Grotesk", var(--font-sans);
```

In `src/layouts/BaseLayout.astro`, the existing font `<link>` (line 24) loads Inter + JetBrains Mono from Google Fonts on one URL. Extend the same URL to also request Space Grotesk:

```astro
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
```

- [ ] **Step 3: Apply the display font to all page headings**

In `src/styles/global.css`, after the `:focus-visible` block (after line 34), add:

```css
h1,
h2 {
  font-family: var(--font-display);
}
```

This is a plain element selector, so it applies to every `h1`/`h2` across every page (all of which already use bare `<h1>`/`<h2>` tags with Tailwind size/weight utilities) with zero markup changes.

- [ ] **Step 4: Verify build and visually check**

Run: `npm run build`
Expected: build succeeds with no errors.

Run: `astro dev --background` (per `CLAUDE.md`), then open `/` and `/tareas` in a browser.
Expected: "Minecraft Cooperativo" (h1) and "Secciones"/"Tareas" (h1/h2) render in Space Grotesk (visually distinct, more geometric than Inter body text); body text and nav are unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/layouts/BaseLayout.astro
git commit -m "Add accent-2/surface-2 tokens and display font for page headings"
```

---

## Task 2: Sidebar icons, active-state transition, and native view transitions

**Files:**
- Modify: `src/components/Sidebar.astro:1-42`
- Modify: `src/layouts/BaseLayout.astro`

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: nothing consumed by later tasks — self-contained.

- [ ] **Step 1: Add inline SVG icons to each sidebar link**

In `src/components/Sidebar.astro`, replace the `links` array (lines 5-12) with an array that pairs each link to a small inline icon (simple 16x16 outline glyphs, `stroke="currentColor"`, no fill, so they inherit the link's text color):

```astro
---
const path = Astro.url.pathname;
const isActive = (href: string) => path === href || (href !== '/' && path.startsWith(href));

const icon = {
  home: '<path d="M3 9.5 8 5l5 4.5V14a1 1 0 0 1-1 1h-2.5v-3.5h-3V15H4a1 1 0 0 1-1-1V9.5Z"/>',
  proyectos: '<rect x="3" y="3" width="4" height="4" rx="0.5"/><rect x="9" y="3" width="4" height="4" rx="0.5"/><rect x="3" y="9" width="4" height="4" rx="0.5"/><rect x="9" y="9" width="4" height="4" rx="0.5"/>',
  granjas: '<path d="M2 13h12M4 13V7l4-3 4 3v6"/><path d="M7 13v-3h2v3"/>',
  mapa: '<path d="M2 4.5 6 3l4 1.5 4-1.5v9L10 13.5 6 12l-4 1.5v-9Z"/><path d="M6 3v9M10 4.5v9"/>',
  tareas: '<rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/>',
  jugadores: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/>',
  galeria: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><circle cx="6" cy="6.5" r="1.2"/><path d="M3 12l3.5-3.5L9 11l2-2 2 3"/>',
} as const;

const links = [
  { href: '/proyectos', label: 'Proyectos', icon: icon.proyectos },
  { href: '/granjas', label: 'Granjas', icon: icon.granjas },
  { href: 'http://190.244.136.239:25566', label: 'Mapa', icon: icon.mapa, external: true },
  { href: '/tareas', label: 'Tareas', icon: icon.tareas },
  { href: '/jugadores', label: 'Jugadores', icon: icon.jugadores },
  { href: '/galeria', label: 'Galería', icon: icon.galeria },
];
---
```

- [ ] **Step 2: Render icons and add the active-state transition**

Replace the `<nav>` block (lines 15-41) with:

```astro
<nav aria-label="Navegación principal" class="flex flex-col gap-1 p-4 text-sm">
  <a
    href="/"
    class:list={[
      'flex items-center gap-2.5 rounded border-l-2 px-2 py-1.5 font-medium transition-colors duration-150 hover:bg-border/40',
      path === '/' ? 'border-accent bg-border/40 text-accent' : 'border-transparent text-text',
    ]}
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" set:html={icon.home} />
    Inicio
  </a>

  {
    links.map((link) => (
      <a
        href={link.href}
        target={link.external ? '_blank' : undefined}
        rel={link.external ? 'noopener noreferrer' : undefined}
        class:list={[
          'flex items-center gap-2.5 rounded border-l-2 px-2 py-1.5 font-medium transition-colors duration-150 hover:bg-border/40',
          isActive(link.href) ? 'border-accent bg-border/40 text-accent' : 'border-transparent text-text',
        ]}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" set:html={link.icon} />
        {link.label}
      </a>
    ))
  }
</nav>
```

Note: `set:html` is used here (not user input — the icon strings are hardcoded constants above), Astro's standard way to inject a raw SVG path fragment into an element.

- [ ] **Step 3: Enable native view transitions**

In `src/layouts/BaseLayout.astro`, add the import at the top of the frontmatter (after the existing `import Sidebar from '../components/Sidebar.astro';`):

```astro
import { ClientRouter } from 'astro:transitions';
```

Add `<ClientRouter />` inside `<head>`, right after the `<title>` tag (line 19):

```astro
    <title>{title} · MineCoop Wiki</title>
    <ClientRouter />
```

- [ ] **Step 4: Verify build and visually check**

Run: `npm run build`
Expected: build succeeds.

Run: `astro dev --background`, open `/`, then click through every sidebar link (including the mobile hamburger menu at a narrow viewport).
Expected: every link shows a small icon before its label; the active link's accent border/background appears with a brief transition rather than an instant snap; clicking between pages cross-fades instead of a hard white/black flash; the "Mapa" external link still opens in a new tab; mobile nav-toggle behavior (checkbox-driven sidebar) still works.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.astro src/layouts/BaseLayout.astro
git commit -m "Add sidebar icons, active-link transition, and native view transitions"
```

---

## Task 3: Homepage stat tiles, sections grid, and hero glow

**Files:**
- Modify: `src/pages/index.astro:28-58`

**Interfaces:**
- Consumes: `--color-accent-2`, `--color-surface-2` from Task 1 — used directly (`bg-surface-2`, `text-accent-2`). Not a hard build dependency (Tailwind just won't generate those utilities if the tokens are missing, so the tiles would render with no background/number color instead of erroring), but do Task 1 first for the intended look.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Replace the stats line with stat tiles**

In `src/pages/index.astro`, replace the single stats paragraph (lines 36-38):

```astro
  <p class="mt-4 font-mono text-sm text-text-muted">
    jugadores: {JUGADORES.length} · proyectos: {proyectos.length} · granjas: {granjas.length} · fotos: {galeriaCount} · desde: 2025-01
  </p>
```

with a tile row:

```astro
  <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
    {
      [
        { value: JUGADORES.length, label: 'jugadores' },
        { value: proyectos.length, label: 'proyectos' },
        { value: granjas.length, label: 'granjas' },
        { value: galeriaCount, label: 'fotos' },
        { value: '2025-01', label: 'desde' },
      ].map((stat) => (
        <div class="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center">
          <p class="font-mono text-lg font-semibold text-accent-2">{stat.value}</p>
          <p class="text-xs text-text-muted">{stat.label}</p>
        </div>
      ))
    }
  </div>
```

- [ ] **Step 2: Replace the sections list with a card grid**

Replace the `<h2>` + `<ul>` block (lines 40-57):

```astro
  <h2 class="mt-10 text-xl font-semibold">Secciones</h2>
  <ul class="mt-3 flex flex-col divide-y divide-border border-t border-b border-border">
    {
      sections.map((s) => (
        <li>
          <a
            href={s.href}
            target={s.external ? '_blank' : undefined}
            rel={s.external ? 'noopener noreferrer' : undefined}
            class="flex flex-col gap-0.5 py-3 hover:text-accent"
          >
            <span class="font-medium">{s.label}</span>
            <span class="text-sm text-text-muted">{s.desc}</span>
          </a>
        </li>
      ))
    }
  </ul>
```

with:

```astro
  <h2 class="mt-10 text-xl font-semibold">Secciones</h2>
  <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
    {
      sections.map((s) => (
        <li>
          <a
            href={s.href}
            target={s.external ? '_blank' : undefined}
            rel={s.external ? 'noopener noreferrer' : undefined}
            class="group flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-3 transition-all hover:border-accent hover:shadow-md hover:shadow-black/40"
          >
            <span class="font-medium group-hover:text-accent">{s.label}</span>
            <span class="text-sm text-text-muted">{s.desc}</span>
          </a>
        </li>
      ))
    }
  </ul>
```

- [ ] **Step 3: Add a hero glow behind the banner**

Wrap the existing `<Gallery>` call (line 29) in a positioned container with a radial-gradient backdrop:

```astro
  <div class="relative">
    <div
      class="pointer-events-none absolute -inset-x-8 -top-16 h-64 rounded-full blur-3xl"
      style="background: radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent);"
      aria-hidden="true"
    ></div>
    <Gallery images={bannerImages} alt="" />
  </div>
```

`color-mix()` is used instead of adding another CSS variable, since this is the only place a 10%-opacity accent tint is needed — Tailwind arbitrary-value opacity utilities don't apply to `background` radial-gradients directly, and this keeps it to one CSS declaration.

- [ ] **Step 4: Verify build and visually check**

Run: `npm run build`
Expected: build succeeds.

Run: `astro dev --background`, open `/` at mobile and desktop widths.
Expected: stats render as 5 (mobile: 2-col wrap) tiles with the surface-2 tone and accent-2-colored numbers; "Secciones" is a 2-3 column card grid with border/shadow hover matching `ItemCard`'s hover language; a soft glow is visible behind the banner without overpowering it or causing horizontal scroll.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "Redesign homepage stats and sections as tiles/card grid, add hero glow"
```

---

## Task 4: List load-in stagger animation

**Files:**
- Modify: `src/styles/global.css` (append new rule block)
- Modify: `src/pages/proyectos/index.astro:13`
- Modify: `src/pages/granjas/index.astro:13`
- Modify: `src/pages/jugadores.astro:23`
- Modify: `src/pages/tareas.astro:72`

**Interfaces:**
- Consumes: nothing.
- Produces: `[data-stagger]` attribute convention — any `<ul>`/`<div>` marked with it gets its direct children fade/slide in with a capped, escalating delay. Reusable by any future list without new CSS.

- [ ] **Step 1: Add the stagger keyframes and rule to global.css**

Append to `src/styles/global.css`:

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: no-preference) {
  [data-stagger] > * {
    animation: fade-in-up 0.4s ease-out backwards;
  }
  [data-stagger] > *:nth-child(1) {
    animation-delay: 0ms;
  }
  [data-stagger] > *:nth-child(2) {
    animation-delay: 40ms;
  }
  [data-stagger] > *:nth-child(3) {
    animation-delay: 80ms;
  }
  [data-stagger] > *:nth-child(4) {
    animation-delay: 120ms;
  }
  [data-stagger] > *:nth-child(5) {
    animation-delay: 160ms;
  }
  [data-stagger] > *:nth-child(6) {
    animation-delay: 200ms;
  }
  [data-stagger] > *:nth-child(n + 7) {
    animation-delay: 240ms;
  }
}
```

The delay is capped at 240ms (7th+ item) so long lists (e.g. 28 tareas) don't produce a multi-second cascade. Wrapping in `prefers-reduced-motion: no-preference` means reduced-motion users get the un-animated, always-visible state (the `backwards` fill mode still applies the `from` keyframe's `opacity: 0` only *during* the animation — outside the media query, no animation is attached at all, so elements render at their natural final opacity of 1).

- [ ] **Step 2: Apply `data-stagger` to the four list wrappers**

In `src/pages/proyectos/index.astro:13`, change:
```astro
  <ul class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
```
to:
```astro
  <ul data-stagger class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
```

In `src/pages/granjas/index.astro:13`, apply the identical change (same class string).

In `src/pages/jugadores.astro:23`, change:
```astro
            <ul class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
```
to:
```astro
            <ul data-stagger class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
```
(this is inside the `groups.map(...)` loop, so each activity section's grid staggers independently — correct, since they're visually separate lists).

In `src/pages/tareas.astro:72`, change:
```astro
            <ul data-tareas-list class="mt-3 flex flex-col divide-y divide-border border-t border-b border-border">
```
to:
```astro
            <ul data-tareas-list data-stagger class="mt-3 flex flex-col divide-y divide-border border-t border-b border-border">
```
The `[data-stagger] > *` selector only targets direct `<li>` children of this list, not the nested `<ul>` of subtareas inside each `<li>` — so subtareas are unaffected, as intended.

- [ ] **Step 3: Verify build and visually check**

Run: `npm run build`
Expected: build succeeds.

Run: `astro dev --background`, open `/proyectos`, `/granjas`, `/jugadores`, and `/tareas`.
Expected: on each page load, grid/list items fade and slide up into place with a quick staggered cadence (not simultaneous, not slow). In browser DevTools, enable "prefers-reduced-motion: reduce" (Rendering tab) and reload each page: items appear instantly with no animation.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css src/pages/proyectos/index.astro src/pages/granjas/index.astro src/pages/jugadores.astro src/pages/tareas.astro
git commit -m "Add reduced-motion-aware stagger fade-in to list/grid pages"
```

---

## Task 5: Task priority color tokens, left-border indicator, and badge

**Files:**
- Modify: `src/styles/global.css` (`@theme` block)
- Modify: `src/pages/tareas.astro:17, 74-108`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `--color-priority-*` theme tokens (5 levels), consumed only within this task.

Context found while planning this task: an earlier commit (`1ab71c6c`) added a left-border priority indicator, but it referenced Tailwind classes (`border-priority-alta`, etc.) that were never defined as theme tokens in `global.css` — so the border never actually rendered any color. That code was later removed entirely (commit `45703aba`, during the priority-scale renumbering from 3 levels to today's 5-level 1–5 scale). This task defines the tokens for real this time, for the current 5-level scale, and adds the badge on top.

- [ ] **Step 1: Add the 5 priority color tokens**

In `src/styles/global.css`, inside the `@theme` block, add after `--color-accent-2: #a371f7;` (from Task 1 — if Task 1 hasn't landed yet in your working copy, add after `--color-accent-muted: #3d8b37;` instead):

```css
  --color-priority-muy-alta: #f85149;
  --color-priority-alta: #db6d28;
  --color-priority-media: #d29922;
  --color-priority-baja: #3d8b37;
  --color-priority-muy-baja: #6e7681;
```

These auto-generate Tailwind utilities `border-priority-muy-alta`, `text-priority-muy-alta`, `bg-priority-muy-alta`, etc. (same mechanism as the existing `--color-accent` → `border-accent`/`text-accent` utilities already used throughout this codebase).

- [ ] **Step 2: Map priority numbers to token classes**

In `src/pages/tareas.astro`, after the existing `priorityLabels` map (line 17), add:

```ts
const priorityBorderClass: Record<number, string> = {
  1: 'border-priority-muy-alta',
  2: 'border-priority-alta',
  3: 'border-priority-media',
  4: 'border-priority-baja',
  5: 'border-priority-muy-baja',
};
const priorityTextClass: Record<number, string> = {
  1: 'text-priority-muy-alta',
  2: 'text-priority-alta',
  3: 'text-priority-media',
  4: 'text-priority-baja',
  5: 'text-priority-muy-baja',
};
```

Each value is a complete, literal Tailwind class name. This is deliberate: Tailwind's scanner extracts candidate class names by matching literal substrings in the source file, and does not evaluate JS — a dynamically-concatenated class like `` `border-${priorityClass[n]}` `` never appears in the source as a contiguous string, so Tailwind would silently fail to generate CSS for it (the same failure mode as the original broken indicator described above, just via a different mechanism). Two small lookup maps, each holding complete strings, avoids that trap.

- [ ] **Step 3: Add the left-border indicator**

Change the `<li>` opening tag (line 74-85) from:

```astro
                <li
                  class="flex items-start gap-3 py-3 pl-3"
                  data-priority={t.data.priority}
```

to:

```astro
                <li
                  class:list={['flex items-start gap-3 border-l-2 py-3 pl-3', priorityBorderClass[t.data.priority]]}
                  data-priority={t.data.priority}
```

- [ ] **Step 4: Add the priority badge next to the title, remove the redundant inline text**

Change (lines 89-109):

```astro
                  <div class="min-w-0 flex-1">
                    <p class="font-medium uppercase">{t.data.title}</p>
                    <p class="mt-0.5 text-sm text-text-muted">
                      {t.data.assignee && (
                        <span class="font-mono">
                          {t.data.assignee.map((a, i) => (
                            <>
                              {i > 0 && ' '}
                              {jugadoresSet.has(a) ? (
                                <a href={`/jugadores/${a}`} class="hover:text-accent hover:underline">
                                  @{a}
                                </a>
                              ) : (
                                <>@{a}</>
                              )}
                            </>
                          ))}
                        </span>
                      )}
                      <span> · prioridad: {priorityLabels[t.data.priority]}</span>
                    </p>
```

to:

```astro
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-medium uppercase">{t.data.title}</p>
                      <span
                        class:list={[
                          'rounded-full border px-2 py-0.5 text-xs font-medium',
                          priorityBorderClass[t.data.priority],
                          priorityTextClass[t.data.priority],
                        ]}
                      >
                        {priorityLabels[t.data.priority]}
                      </span>
                    </div>
                    {t.data.assignee && (
                      <p class="mt-0.5 text-sm text-text-muted">
                        <span class="font-mono">
                          {t.data.assignee.map((a, i) => (
                            <>
                              {i > 0 && ' '}
                              {jugadoresSet.has(a) ? (
                                <a href={`/jugadores/${a}`} class="hover:text-accent hover:underline">
                                  @{a}
                                </a>
                              ) : (
                                <>@{a}</>
                              )}
                            </>
                          ))}
                        </span>
                      </p>
                    )}
```

Note the assignee `<p>` is now conditionally rendered only when there's an assignee (previously it always rendered because the priority `<span>` guaranteed non-empty content even with no assignee) — this avoids an empty `<p>` when a task has no assignee.

- [ ] **Step 5: Verify build and visually check**

Run: `npm run build`
Expected: build succeeds.

Run: `astro dev --background`, open `/tareas`.
Expected: every task row has a colored left border matching its priority (red=Muy Alta through gray=Muy Baja) and a matching small pill badge with the priority label next to the title; the old "· prioridad: ..." inline text is gone; tasks with no assignee no longer show an empty muted line; the existing jugador/priority/proyecto filters still work (they read `data-priority`/`data-assignees`/`data-proyectos`, all untouched).

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css src/pages/tareas.astro
git commit -m "Add priority color tokens with working left-border indicator and badge"
```

---

## Final check

- [ ] **Run a full build and manual pass across every page**

Run: `npm run build`
Expected: no errors.

Run: `astro dev --background`, then visit `/`, `/proyectos`, `/proyectos/<any-slug>`, `/granjas`, `/granjas/<any-slug>`, `/jugadores`, `/jugadores/<any-username>`, `/tareas`, `/galeria`, at both a mobile (~375px) and desktop (~1280px) viewport width.

Expected: no layout breakage, no console errors, existing interactions still work (lightbox prev/next, gallery dots/swipe, copy-to-clipboard on `CoordList`, tareas filters, username cross-links, mobile hamburger nav), and the cumulative effect reads as more "elaborate" per the design goals without introducing a thematic pivot or heavy motion.

- [ ] **Stop the dev server**

Run: `astro dev stop`
