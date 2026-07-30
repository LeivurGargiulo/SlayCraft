# Visual UX/UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give MineCoop Wiki a Minecraft-accent visual identity — retuned palette, hero/detail-page parallax, pointer-tilt cards, restructured detail pages, tuned image loading — without adding any npm dependency.

**Architecture:** All motion (tilt, parallax) is driven by one small vanilla JS module (`src/scripts/motion.js`) exposing pure, unit-testable math functions plus thin DOM-wiring functions, invoked once via Astro's `astro:page-load` lifecycle event (fires on initial load and after every `<ClientRouter />` view transition). Visual changes are CSS custom properties (`--rx`, `--ry`, `--parallax-y`) set by that JS and consumed by plain CSS rules in `global.css`. New/changed markup is Astro components and pages; no new page-level JS frameworks.

**Tech Stack:** Astro 7, Tailwind 4 (`@theme` tokens), `astro:assets` `<Image>` (Sharp-backed), vanilla JS, Node's built-in `node:test`/`node:assert` for the one piece of real logic (tilt/parallax math). Node >=22.12 (already the repo's engine floor) runs `node:test` without flags.

## Global Constraints

- No new npm dependencies (runtime or dev) — spec non-goal, verified per task.
- All motion (tilt, parallax, transitions) must be inert under `prefers-reduced-motion: reduce`.
- Retuned accent colors must hold WCAG AA (≥4.5:1) contrast against both `--color-bg` (`#0d1117`) and `--color-surface` (`#161b22`) — pre-verified below, no further calculation needed during implementation.
- UI copy stays in Spanish, matching existing site conventions (e.g. "← Granjas", "Admin").
- Follow existing code style: Astro components use `interface Props`, Tailwind utility classes inline, no CSS-in-JS.
- `view-transition-name` values must be unique per rendered element on a page (browser requirement) — the convention used throughout this plan is `hero-${id}` where `id` is the content collection entry id (already URL-slug-safe, used verbatim in existing `href`s like `/granjas/${granja.id}`).

---

### Task 1: Motion utility module (pure math + DOM wiring)

**Files:**
- Create: `src/scripts/motion.js`
- Test: `src/scripts/motion.test.mjs`

**Interfaces:**
- Produces: `computeTilt(offsetX, offsetY, width, height, maxDeg = 8) => { rx: number, ry: number }` — degrees, clamped to `[-maxDeg, maxDeg]`.
- Produces: `computeParallaxOffset(progress, maxOffsetPx = 40) => number` — px, `progress` clamped to `[0, 1]`, maps to `[-maxOffsetPx, maxOffsetPx]`.
- Produces: `initTilt(root = document) => void` — finds `[data-tilt]` elements, wires `pointermove`/`pointerleave` to set `--rx`/`--ry` custom properties. No-ops under `prefers-reduced-motion: reduce`. Idempotent per element (safe to call again after a view transition — skips elements already bound).
- Produces: `initParallax(root = document) => void` — finds `[data-parallax]` elements, wires one scroll listener (rAF-throttled, bound once globally) to set `--parallax-y`. No-ops under `prefers-reduced-motion: reduce`. Safe to call again after a view transition (re-scans `root` for current elements; does not double-bind the scroll listener).
- Consumes: nothing (foundational task).

- [ ] **Step 1: Write the failing tests**

Create `src/scripts/motion.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTilt, computeParallaxOffset } from './motion.js';

test('computeTilt returns zero rotation at element center', () => {
  const { rx, ry } = computeTilt(50, 50, 100, 100, 8);
  assert.equal(rx, 0);
  assert.equal(ry, 0);
});

test('computeTilt tilts toward the top-left corner', () => {
  const { rx, ry } = computeTilt(0, 0, 100, 100, 8);
  assert.equal(rx, 8);
  assert.equal(ry, -8);
});

test('computeTilt tilts toward the bottom-right corner', () => {
  const { rx, ry } = computeTilt(100, 100, 100, 100, 8);
  assert.equal(rx, -8);
  assert.equal(ry, 8);
});

test('computeTilt clamps pointer positions outside element bounds', () => {
  const { rx, ry } = computeTilt(200, -50, 100, 100, 8);
  assert.ok(rx <= 8 && rx >= -8);
  assert.ok(ry <= 8 && ry >= -8);
});

test('computeParallaxOffset maps progress 0..1 to -max..max', () => {
  assert.equal(computeParallaxOffset(0, 40), -40);
  assert.equal(computeParallaxOffset(1, 40), 40);
  assert.equal(computeParallaxOffset(0.5, 40), 0);
});

test('computeParallaxOffset clamps out-of-range progress', () => {
  assert.equal(computeParallaxOffset(-0.5, 40), -40);
  assert.equal(computeParallaxOffset(1.5, 40), 40);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/scripts/motion.test.mjs`
Expected: FAIL — `motion.js` does not exist yet (module not found).

- [ ] **Step 3: Implement `src/scripts/motion.js`**

```js
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeTilt(offsetX, offsetY, width, height, maxDeg = 8) {
  const normX = clamp(offsetX / width - 0.5, -0.5, 0.5);
  const normY = clamp(offsetY / height - 0.5, -0.5, 0.5);
  return {
    rx: -normY * 2 * maxDeg,
    ry: normX * 2 * maxDeg,
  };
}

export function computeParallaxOffset(progress, maxOffsetPx = 40) {
  const p = clamp(progress, 0, 1);
  return (p - 0.5) * 2 * maxOffsetPx;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initTilt(root = document) {
  if (prefersReducedMotion()) return;
  root.querySelectorAll('[data-tilt]').forEach((el) => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = 'true';
    const maxDeg = Number(el.dataset.tiltMax) || 8;
    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect();
      const { rx, ry } = computeTilt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        maxDeg
      );
      el.style.setProperty('--rx', `${rx}deg`);
      el.style.setProperty('--ry', `${ry}deg`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });
}

let parallaxBound = false;
let parallaxTicking = false;

function updateParallax(root) {
  root.querySelectorAll('[data-parallax]').forEach((el) => {
    const rect = el.getBoundingClientRect();
    const progress = 1 - rect.top / window.innerHeight;
    const maxOffset = Number(el.dataset.parallaxMax) || 40;
    el.style.setProperty('--parallax-y', `${computeParallaxOffset(progress, maxOffset)}px`);
  });
  parallaxTicking = false;
}

export function initParallax(root = document) {
  if (prefersReducedMotion()) return;
  if (!parallaxBound) {
    parallaxBound = true;
    window.addEventListener(
      'scroll',
      () => {
        if (parallaxTicking) return;
        parallaxTicking = true;
        requestAnimationFrame(() => updateParallax(document));
      },
      { passive: true }
    );
  }
  updateParallax(root);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/scripts/motion.test.mjs`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/motion.js src/scripts/motion.test.mjs
git commit -m "Add tilt/parallax motion utility module"
```

---

### Task 2: Design tokens & motion CSS (`src/styles/global.css`)

**Files:**
- Modify: `src/styles/global.css:3-22` (theme tokens), append new rules after line 167 (end of file).

**Interfaces:**
- Consumes: CSS custom property contract from Task 1 (`--rx`, `--ry` in degrees set on `[data-tilt]` elements; `--parallax-y` in px set on `[data-parallax]` elements).
- Produces: Tailwind utility classes `font-pixel` (from `--font-pixel` theme token, following the existing `--font-mono`/`--font-display` pattern) and `bg-voxel-grid` (custom utility). CSS token `--color-wood` for non-text texture use. Retuned `--color-accent` / `--color-accent-2` hex values, contrast-verified below.

- [ ] **Step 1: Retune accent tokens and add new tokens**

Edit the `@theme` block (`src/styles/global.css:3-22`):

```css
@theme {
  --color-bg: #0d1117;
  --color-surface: #161b22;
  --color-border: #30363d;
  --color-text: #c9d1d9;
  --color-text-muted: #8b949e;
  --color-accent: #5a9bf5;
  --color-accent-muted: #3d8b37;
  --color-accent-2: #3fb968;
  --color-surface-2: #21262d;
  --color-wood: #7a5233;
  --color-priority-muy-alta: #f85149;
  --color-priority-alta: #db6d28;
  --color-priority-media: #d29922;
  --color-priority-baja: #3d8b37;
  --color-priority-muy-baja: #6e7681;

  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --font-display: "Space Grotesk", var(--font-sans);
  --font-pixel: "Press Start 2P", var(--font-mono);
}
```

`--color-accent` (`#5a9bf5`, lapis blue) is 6.71:1 against `--color-bg` and 6.13:1 against
`--color-surface`. `--color-accent-2` (`#3fb968`, emerald) is 7.53:1 / 6.88:1. Both clear
WCAG AA (4.5:1) with margin. `--color-wood` is texture-only (borders, background patterns),
never used for text, so it isn't contrast-constrained.

- [ ] **Step 2: Add motion CSS rules**

Append to the end of `src/styles/global.css` (after the existing `@media (prefers-reduced-motion: reduce)` block):

```css
[data-tilt] {
  transform: perspective(600px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  will-change: transform;
}

[data-parallax] {
  transform: translateY(var(--parallax-y, 0px));
}

@media (prefers-reduced-motion: no-preference) {
  [data-tilt] {
    transition: transform 0.15s ease-out;
  }
}

.bg-voxel-grid {
  background-image:
    repeating-linear-gradient(
      0deg,
      color-mix(in srgb, var(--color-wood) 14%, transparent) 0 1px,
      transparent 1px 32px
    ),
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-wood) 14%, transparent) 0 1px,
      transparent 1px 32px
    );
}
```

`[data-tilt]`/`[data-parallax]` default to `0deg`/`0px` via the CSS custom property fallback,
so if `prefers-reduced-motion: reduce` causes Task 1's JS to skip attaching listeners
entirely, these rules stay visually inert (no transform applied) — no extra media-query
guard needed around the transform rules themselves, only around the transition.

- [ ] **Step 3: Verify no dependency was added**

Run: `git diff package.json package-lock.json`
Expected: empty (this task only touches CSS).

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css
git commit -m "Add Minecraft-accent palette and tilt/parallax CSS tokens"
```

---

### Task 3: Layout chrome — motion init, pixel font, admin nav link

**Files:**
- Modify: `src/layouts/BaseLayout.astro:26` (font link), `src/layouts/BaseLayout.astro:67-76` (add script)
- Modify: `src/components/Sidebar.astro:5-13` (icon map), `src/components/Sidebar.astro:36-52` (nav links)

**Interfaces:**
- Consumes: `initTilt`, `initParallax` from `src/scripts/motion.js` (Task 1); `--font-pixel` token (Task 2).
- Produces: nothing new consumed by later tasks — this wires the mechanism every later task's markup relies on being *active*.

- [ ] **Step 1: Add the pixel font to the Google Fonts link**

In `src/layouts/BaseLayout.astro`, replace the `<link>` at line 25-28:

```astro
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=Press+Start+2P&display=swap"
      rel="stylesheet"
    />
```

- [ ] **Step 2: Wire motion init to the view-transition lifecycle**

In `src/layouts/BaseLayout.astro`, add a new `<script>` block right after the existing clipboard-copy `<script>` (after line 76, before `</body>`):

```astro
    <script>
      import { initTilt, initParallax } from '../scripts/motion.js';

      document.addEventListener('astro:page-load', () => {
        initTilt();
        initParallax();
      });
    </script>
```

`astro:page-load` fires once on initial load and again after every `<ClientRouter />`
navigation, so this single listener covers both cases — no separate `DOMContentLoaded`
handling needed.

- [ ] **Step 3: Add an Admin icon and nav entry to the sidebar**

In `src/components/Sidebar.astro`, add to the `icon` object (line 5-13):

```ts
const icon = {
  home: '<path d="M3 9.5 8 5l5 4.5V14a1 1 0 0 1-1 1h-2.5v-3.5h-3V15H4a1 1 0 0 1-1-1V9.5Z"/>',
  proyectos: '<rect x="3" y="3" width="4" height="4" rx="0.5"/><rect x="9" y="3" width="4" height="4" rx="0.5"/><rect x="3" y="9" width="4" height="4" rx="0.5"/><rect x="9" y="9" width="4" height="4" rx="0.5"/>',
  granjas: '<path d="M2 13h12M4 13V7l4-3 4 3v6"/><path d="M7 13v-3h2v3"/>',
  mapa: '<path d="M2 4.5 6 3l4 1.5 4-1.5v9L10 13.5 6 12l-4 1.5v-9Z"/><path d="M6 3v9M10 4.5v9"/>',
  tareas: '<rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/>',
  jugadores: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/>',
  galeria: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><circle cx="6" cy="6.5" r="1.2"/><path d="M3 12l3.5-3.5L9 11l2-2 2 3"/>',
  admin: '<circle cx="8" cy="8" r="2"/><path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2M4.3 4.3l1.4 1.4M10.3 10.3l1.4 1.4M4.3 11.7l1.4-1.4M10.3 5.7l1.4-1.4"/>',
} as const;
```

- [ ] **Step 4: Add the Admin link, visually separated from content nav**

In `src/components/Sidebar.astro`, after the `{links.map(...)}` block (after line 52, still inside `<nav>`):

```astro
  <div class="mt-3 border-t border-border pt-3">
    <a
      href="/admin"
      class:list={[
        'flex items-center gap-2.5 rounded border-l-2 px-2 py-1.5 font-medium transition-colors duration-150 hover:bg-border/40',
        isActive('/admin') ? 'border-accent bg-border/40 text-accent' : 'border-transparent text-text',
      ]}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" set:html={icon.admin} />
      Admin
    </a>
  </div>
```

- [ ] **Step 5: Manually verify**

Run: `astro dev --background`, then check:
- Every page still loads (font link change doesn't break the page).
- Sidebar shows an "Admin" entry below a divider; clicking it goes to `/admin` (redirects to `/admin/login` if not authenticated — expected, unchanged behavior).
- Browser console has no errors on load or after clicking between pages (confirms the `motion.js` import resolves and `astro:page-load` fires without throwing).

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BaseLayout.astro src/components/Sidebar.astro
git commit -m "Wire motion init lifecycle, pixel font, and admin sidebar link"
```

---

### Task 4: Card tilt & image tuning (`ItemCard`, jugadores grid)

**Files:**
- Modify: `src/components/ItemCard.astro` (whole file)
- Modify: `src/pages/jugadores.astro:30-40`

**Interfaces:**
- Consumes: `[data-tilt]` CSS contract (Task 2), motion init (Task 3).
- Produces: `ItemCard` gains an optional `id` prop — when present and `image` is present, the rendered `<Image>` gets `style="view-transition-name: hero-${id}"`. Task 8 (detail pages) matches this exact naming convention.

- [ ] **Step 1: Update `ItemCard.astro`**

Replace the full contents of `src/components/ItemCard.astro`:

```astro
---
import { Image } from 'astro:assets';

interface Props {
  href: string;
  id?: string;
  image?: ImageMetadata;
  alt: string;
  title: string;
}
const { href, id, image, alt, title } = Astro.props;
---

<a
  href={href}
  data-tilt
  class="group block overflow-hidden rounded-lg border border-border bg-surface transition-all hover:border-accent hover:shadow-md hover:shadow-black/40"
>
  {image ? (
    <Image
      src={image}
      alt={alt}
      format="webp"
      quality={78}
      widths={[320, 480, 640]}
      sizes="(min-width: 640px) 33vw, 50vw"
      style={id ? `view-transition-name: hero-${id}` : undefined}
      class="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
    />
  ) : (
    <div class="aspect-[4/3] w-full bg-surface-2" aria-hidden="true" />
  )}
  <p class="p-2 text-sm font-medium">{title}</p>
</a>
```

- [ ] **Step 2: Pass `id` from both call sites**

In `src/pages/granjas/index.astro:26`:

```astro
<ItemCard href={`/granjas/${granja.id}`} id={granja.id} image={image} alt={granja.title} title={granja.title} />
```

In `src/pages/proyectos/index.astro:26`:

```astro
<ItemCard href={`/proyectos/${proyecto.id}`} id={proyecto.id} image={image} alt={proyecto.title} title={proyecto.title} />
```

- [ ] **Step 3: Add tilt to the jugadores grid card**

In `src/pages/jugadores.astro`, replace lines 30-40:

```astro
                  <a href={`/jugadores/${username}`} data-tilt data-tilt-max="6" class="group flex flex-col items-center gap-2">
                    <img
                      src={skinBodyUrl(username, 160)}
                      alt={username}
                      width={160}
                      height={200}
                      loading="lazy"
                      class="w-32 rounded-lg border border-border object-cover transition-all duration-200 group-hover:scale-[1.03] group-hover:border-accent group-hover:shadow-md group-hover:shadow-black/40"
                    />
                    <p class="font-medium">{username}</p>
                  </a>
```

(Only change: `data-tilt data-tilt-max="6"` added to the `<a>` — a smaller max tilt than the
8° default since this card is narrower.)

- [ ] **Step 4: Manually verify**

Run: `astro dev --background`. On `/granjas`, `/proyectos`, and `/jugadores`:
- Hovering a card tilts it toward the pointer and resets on mouse-leave.
- Grid thumbnails still load correctly (no broken images from the new `widths`/`sizes`/`format` props).
- Open devtools Network tab, confirm thumbnail images are served as `.webp`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ItemCard.astro src/pages/granjas/index.astro src/pages/proyectos/index.astro src/pages/jugadores.astro
git commit -m "Add pointer-tilt and tuned image loading to card grids"
```

---

### Task 5: Gallery image tuning + parallax prop

**Files:**
- Modify: `src/components/Gallery.astro:1-23`

**Interfaces:**
- Consumes: `[data-parallax]` CSS contract (Task 2), `computeParallaxOffset`/`initParallax` (Task 1, wired in Task 3).
- Produces: `Gallery` gains optional props `parallax?: boolean` and `parallaxMax?: number` (px). When `parallax` is true, the root `<div data-gallery>` also gets `data-parallax` and `data-parallax-max={parallaxMax}`. Tasks 6 and 8 pass these.

- [ ] **Step 1: Update `Gallery.astro` props and root markup**

Replace lines 1-23 of `src/components/Gallery.astro`:

```astro
---
import { Image } from 'astro:assets';

interface Props {
  images: ImageMetadata[];
  alt: string;
  parallax?: boolean;
  parallaxMax?: number;
}
const { images, alt, parallax = false, parallaxMax = 40 } = Astro.props;
---

<div
  class="relative"
  data-gallery
  data-parallax={parallax ? true : undefined}
  data-parallax-max={parallax ? parallaxMax : undefined}
>
  <div
    class="flex snap-x snap-mandatory overflow-x-auto rounded border border-border bg-surface scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    data-track
  >
    {
      images.map((img) => (
        <div class="flex w-full shrink-0 snap-center items-center justify-center">
          <Image src={img} alt={alt} format="webp" quality={82} widths={[640, 960, 1280]} sizes="(min-width: 768px) 900px, 100vw" class="max-h-[70vh] w-full object-contain" />
        </div>
      ))
    }
  </div>
```

(Lines 24 onward — the prev/next buttons, dots, and `<script>` — are unchanged.)

- [ ] **Step 2: Manually verify**

Run: `astro dev --background`. On any granja/proyecto detail page:
- Gallery carousel still scrolls/swipes and the prev/next/dot controls still work (unchanged
  script logic).
- No parallax movement yet (no call site passes `parallax` until Tasks 6/8) — this task alone
  should be visually a no-op besides `.webp` format in Network tab.

- [ ] **Step 3: Commit**

```bash
git add src/components/Gallery.astro
git commit -m "Add parallax prop and tuned image loading to Gallery"
```

---

### Task 6: Homepage hero, stat tiles, section cards

**Files:**
- Modify: `src/pages/index.astro:35-85` (the `<BaseLayout>` body; frontmatter above is unchanged)

**Interfaces:**
- Consumes: `Gallery` `parallax` prop (Task 5), `[data-tilt]`/`.bg-voxel-grid`/`font-pixel` (Task 2/3).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the hero, stats, and sections markup**

Replace `src/pages/index.astro` lines 35-85 (the full `<BaseLayout title="Inicio">...</BaseLayout>` block):

```astro
<BaseLayout title="Inicio">
  <div class="relative">
    <div
      class="pointer-events-none absolute -inset-x-8 -top-16 h-64 rounded-full blur-3xl"
      style="background: radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent);"
      aria-hidden="true"
    ></div>
    <div class="bg-voxel-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden="true"></div>
    <Gallery images={bannerImages} alt="" parallax parallaxMax={28} />
  </div>

  <h1 class="mt-8 text-3xl font-semibold">Minecraft Cooperativo</h1>
  <p class="mt-3 text-text-muted">
    Documentación interna de del mundo.
  </p>

  <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
    {
      [
        { value: jugadores.length, label: 'jugadores' },
        { value: proyectos.length, label: 'proyectos' },
        { value: granjas.length, label: 'granjas' },
        { value: galeriaCount, label: 'fotos' },
        { value: '2025-01', label: 'desde' },
      ].map((stat) => (
        <div data-tilt data-tilt-max="6" class="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center">
          <p class="font-pixel text-xs text-accent-2">{stat.value}</p>
          <p class="mt-1 text-xs text-text-muted">{stat.label}</p>
        </div>
      ))
    }
  </div>

  <h2 class="mt-10 text-xl font-semibold">Secciones</h2>
  <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
    {
      sections.map((s) => (
        <li>
          <a
            href={s.href}
            target={s.external ? '_blank' : undefined}
            rel={s.external ? 'noopener noreferrer' : undefined}
            data-tilt
            class="group flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-3 transition-all hover:border-accent hover:shadow-md hover:shadow-black/40"
          >
            <span class="font-medium group-hover:text-accent">{s.label}</span>
            <span class="text-sm text-text-muted">{s.desc}</span>
          </a>
        </li>
      ))
    }
  </ul>
</BaseLayout>
```

(Only the `<div class="relative">` wrapper gains the voxel-grid overlay div and the `parallax`
props on `Gallery`; the stat tiles gain `data-tilt` + swap `font-mono font-semibold text-lg`
for `font-pixel text-xs`; the section cards gain `data-tilt`. Everything else — the imports,
frontmatter data fetching, `sections` array — is unchanged from the current file.)

- [ ] **Step 2: Manually verify**

Run: `astro dev --background`. On `/`:
- The banner area shows a faint grid-line texture behind the gallery and shifts position
  slightly on scroll (parallax).
- Stat numbers render in the blocky pixel font at a readable size (not oversized/clipped).
- Stat tiles and section cards tilt on pointer hover.
- Check `prefers-reduced-motion: reduce` (devtools > Rendering > Emulate CSS
  prefers-reduced-motion) disables both the tilt and the parallax shift.

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "Add hero parallax, voxel texture, and card tilt to homepage"
```

---

### Task 7: `DetailHeader` component

**Files:**
- Create: `src/components/DetailHeader.astro`

**Interfaces:**
- Consumes: `astro:assets` `Image`, `--color-bg` gradient token, `hero-${id}` view-transition naming convention (matches Task 4's `ItemCard`).
- Produces: `DetailHeader` component with props `{ backHref: string; backLabel: string; title: string; heroImage?: ImageMetadata; id?: string }`. When `heroImage` is present, renders a full-width banner with the title overlaid and `view-transition-name: hero-${id}` on the image (requires `id` to be passed alongside `heroImage`). When absent, renders a plain breadcrumb + `<h1>`. Task 8 is the only consumer.

- [ ] **Step 1: Create the component**

```astro
---
import { Image } from 'astro:assets';

interface Props {
  backHref: string;
  backLabel: string;
  title: string;
  heroImage?: ImageMetadata;
  id?: string;
}
const { backHref, backLabel, title, heroImage, id } = Astro.props;
---

<nav aria-label="Breadcrumb" class="text-sm text-text-muted">
  <a href={backHref} class="hover:text-accent">{backLabel}</a>
  <span aria-hidden="true"> / </span>
  <span class="text-text">{title}</span>
</nav>

{heroImage ? (
  <div class="relative mt-3 overflow-hidden rounded-lg border border-border">
    <Image
      src={heroImage}
      alt={title}
      format="webp"
      quality={82}
      loading="eager"
      fetchpriority="high"
      style={id ? `view-transition-name: hero-${id}` : undefined}
      class="h-64 w-full object-cover sm:h-80"
    />
    <div class="absolute inset-0 flex items-end bg-gradient-to-t from-bg/90 via-bg/10 to-transparent p-5">
      <h1 class="text-2xl font-semibold text-text sm:text-3xl">{title}</h1>
    </div>
  </div>
) : (
  <h1 class="mt-2 text-2xl font-semibold">{title}</h1>
)}
```

- [ ] **Step 2: Manually verify in isolation**

There's no page wired to this component yet (Task 8 does that). Confirm it type-checks:

Run: `astro check` (or `astro build` if `check` isn't configured) and confirm no new
TypeScript errors reference `DetailHeader.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/components/DetailHeader.astro
git commit -m "Add DetailHeader component for detail-page hero band"
```

---

### Task 8: Wire `DetailHeader` into granjas/proyectos/jugadores detail pages

**Files:**
- Modify: `src/pages/granjas/[slug].astro:20-29`
- Modify: `src/pages/proyectos/[slug].astro:20-29`
- Modify: `src/pages/jugadores/[slug].astro:19-34`

**Interfaces:**
- Consumes: `DetailHeader` (Task 7), `Gallery` `parallax` prop (Task 5), `hero-${id}` naming convention (matches `ItemCard`, Task 4) so the browser morphs the thumbnail into the header band on navigation.

- [ ] **Step 1: Update `granjas/[slug].astro`**

Replace lines 20-29:

```astro
<BaseLayout title={granja.title}>
  <DetailHeader
    backHref="/granjas"
    backLabel="Granjas"
    title={granja.title}
    heroImage={imageEntry?.data.images[0]}
    id={granja.id}
  />

  {imageEntry && (
    <div class="mt-6">
      <Gallery images={imageEntry.data.images} alt={granja.title} parallax parallaxMax={16} />
    </div>
  )}
```

And add the import near the top (after line 6, alongside the other component imports):

```astro
import DetailHeader from '../../components/DetailHeader.astro';
```

- [ ] **Step 2: Update `proyectos/[slug].astro`** — identical pattern

Replace lines 20-29:

```astro
<BaseLayout title={proyecto.title}>
  <DetailHeader
    backHref="/proyectos"
    backLabel="Proyectos"
    title={proyecto.title}
    heroImage={imageEntry?.data.images[0]}
    id={proyecto.id}
  />

  {imageEntry && (
    <div class="mt-6">
      <Gallery images={imageEntry.data.images} alt={proyecto.title} parallax parallaxMax={16} />
    </div>
  )}
```

Add the same import near the top.

- [ ] **Step 3: Update `jugadores/[slug].astro`** — no `heroImage` (no gallery asset for players)

Replace lines 19-34:

```astro
<BaseLayout title={username}>
  <DetailHeader backHref="/jugadores" backLabel="Jugadores" title={username} />

  <div class="mt-4 flex items-center gap-4">
    <img
      src={skinBodyUrl(username, 240)}
      alt={username}
      width={240}
      height={300}
      data-tilt
      data-tilt-max="6"
      class="w-60 rounded-lg border border-border object-cover"
    />
    <p class="text-sm text-text-muted">{ACTIVIDAD_LABELS[actividad]}</p>
  </div>
```

Add the import near the top (after line 5):

```astro
import DetailHeader from '../../components/DetailHeader.astro';
```

- [ ] **Step 4: Manually verify**

Run: `astro dev --background`. For a granja and a proyecto with at least one image:
- Detail page shows a breadcrumb, then a full-width hero banner with the title overlaid,
  then the full gallery carousel below (including the same first image again — expected,
  not a bug).
- Navigate from `/granjas` (click a card) to its detail page: the thumbnail visually morphs
  into the header banner instead of a flat cross-fade (Chrome/Edge; other browsers fall back
  to the default cross-fade, which is fine).
- For a jugador detail page: breadcrumb + plain `<h1>`, skin portrait tilts on hover.
- For an entity with zero images: no hero band, plain `<h1>` fallback, no console errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/granjas/\[slug\].astro src/pages/proyectos/\[slug\].astro src/pages/jugadores/\[slug\].astro
git commit -m "Wire DetailHeader into granja/proyecto/jugador detail pages"
```

---

### Task 9: Tareas priority pill in pixel font

**Files:**
- Modify: `src/pages/tareas.astro:120-128`

**Interfaces:**
- Consumes: `font-pixel` utility (Task 2).

- [ ] **Step 1: Update the priority badge classes**

In `src/pages/tareas.astro`, replace lines 120-128:

```astro
                      <span
                        class:list={[
                          'rounded-full border px-2 py-0.5 text-[9px] font-pixel',
                          priorityBorderClass[t.priority],
                          priorityTextClass[t.priority],
                        ]}
                      >
                        {priorityLabels[t.priority]}
                      </span>
```

(Only the class string changes: `text-xs font-medium` → `text-[9px] font-pixel` — the pixel
font renders visually larger per-em than a normal sans font, so the size drops accordingly.)

- [ ] **Step 2: Manually verify**

Run: `astro dev --background`. On `/tareas`:
- Priority pills render in the blocky pixel font, legible at the smaller size, still colored
  per priority.
- Filters (jugador/priority/proyecto dropdowns) still work unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/pages/tareas.astro
git commit -m "Use pixel font for task priority pills"
```

---

### Task 10: Admin dashboard grid tilt

**Files:**
- Modify: `src/pages/admin/index.astro:38-46`

**Interfaces:**
- Consumes: `[data-tilt]` CSS contract (Task 2), motion init (Task 3).

- [ ] **Step 1: Add tilt to the dashboard section cards**

In `src/pages/admin/index.astro`, replace lines 38-46:

```astro
      <li>
        <a
          href={s.href}
          data-tilt
          class="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent"
        >
          <p class="text-2xl font-semibold">{s.count}</p>
          <p class="text-sm text-text-muted">{s.label}</p>
        </a>
      </li>
```

- [ ] **Step 2: Manually verify**

Run: `astro dev --background`, log in at `/admin/login`, confirm the dashboard cards
(`/admin`) tilt on hover and still navigate correctly to each admin subsection.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/index.astro
git commit -m "Add pointer-tilt to admin dashboard cards"
```

---

### Task 11: Final manual QA pass

**Files:** none (verification only).

**Interfaces:** none — this task consumes the full set of changes from Tasks 1-10.

- [ ] **Step 1: Full-site visual pass**

Run: `astro dev --background`. Visit every page at both a mobile width (375px) and a desktop
width (1280px) in the browser devtools responsive mode: `/`, `/proyectos`, `/proyectos/<slug>`,
`/granjas`, `/granjas/<slug>`, `/jugadores`, `/jugadores/<slug>`, `/tareas`, `/galeria`,
`/admin` (after logging in), `/admin/tareas`, `/admin/granjas`, `/admin/proyectos`,
`/admin/jugadores`.

Confirm: no layout breakage, no console errors, sidebar mobile toggle still works, gallery
lightbox/carousel nav still works, copy-to-clipboard still works, tareas filters still work,
admin CRUD forms (create/edit/delete) still work.

- [ ] **Step 2: Reduced-motion check**

In devtools, enable "Emulate CSS prefers-reduced-motion: reduce" (Rendering tab). Reload `/`
and a granja detail page. Confirm: no tilt on card hover, no parallax shift on scroll, no
load-in stagger animation, view transitions between pages either disabled or reduced per
Astro's native handling.

- [ ] **Step 3: Touch-device check**

In devtools, switch to a touch device emulation (e.g. "iPhone 14"). Confirm tilt is inert
(no `pointermove` events fire on touch, so cards never rotate) and tapping cards still
navigates normally.

- [ ] **Step 4: Contrast spot-check**

Use devtools' contrast checker (or the browser's accessibility inspector) on: a body link
in `--color-accent`, a stat-tile number in `--color-accent-2`, and the priority pill text
colors. Confirm all pass AA at their rendered size (already computed at 6.1:1+ for the two
retuned tokens in Task 2 — this step is a spot-check against the actual rendered page, not
a recalculation).

- [ ] **Step 5: Image loading check**

Open devtools Network tab, filter by Img, reload `/` and a granja/proyecto detail page.
Confirm: images are served as `.webp`, the hero/header-band image has priority hints
(`fetchpriority=high` visible in the request), and grid thumbnails are the smaller
`widths` variants rather than one full-size image reused everywhere.

- [ ] **Step 6: Node test suite**

Run: `node --test src/scripts/motion.test.mjs`
Expected: PASS (still — confirms no later task edited the pure functions).

- [ ] **Step 7: Confirm no dependency drift**

Run: `git diff main -- package.json package-lock.json` (or `git log --oneline main..HEAD --
package.json package-lock.json`)
Expected: no changes across the whole branch — the "no new npm dependencies" constraint held
from Task 1 through Task 10.

- [ ] **Step 8: Commit (if any fixes were needed during QA)**

```bash
git add -A
git commit -m "Fix issues found during visual overhaul QA pass"
```

(Skip this step if QA found nothing to fix.)
