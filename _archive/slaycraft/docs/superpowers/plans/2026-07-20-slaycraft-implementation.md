# SlayCraft Showcase Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, markdown-driven Astro + React showcase site for SlayCraft (a co-op Minecraft server), deployable to Netlify with `npm run build`.

**Architecture:** Astro (content collections, static output) with Tailwind v4 for styling and CSS custom properties for the light/dark ("surface"/"underground") token system. Interactivity is mostly vanilla TS driven by DOM `data-*` attributes and native platform features (`<dialog>` for the lightbox, `IntersectionObserver` for reveals) rather than framework state — the one genuine React island is the theme toggle, satisfying the explicit "Astro + React integration" requirement without pulling framework overhead into pieces native HTML/CSS/JS already handle well (image-optimized project cards stay server-rendered Astro markup; a React re-implementation of the card grid would have meant losing `astro:assets` optimization or duplicating markup). All non-trivial pure logic (theme resolution, coordinate/date formatting, parallax math, filter/sort, gallery index wraparound) lives in small tested modules under `src/lib/`.

**Tech Stack:** Astro (latest 5.x/6.x APIs), @astrojs/react, Tailwind v4 (`@tailwindcss/vite`), Zod (via `astro/zod`), Vitest, npm. No Framer Motion, no map-embed library, no i18n framework.

## Global Constraints

- Deploy target: Netlify (root-domain static hosting, no base-path config).
- Package manager: npm; project must build with `npm run build`.
- Entire site copy (nav, UI labels, seed content) is in **Argentine Spanish (voseo)** — no i18n framework, strings hardcoded directly.
- Light ("surface") tokens: `--bg:#F5F1E3` `--accent:#3D8B37` `--border-strong:#7A5230` `--info:#5C7A99` `--text:#2B2B2B`.
- Dark ("underground") tokens: `--bg:#151515` `--surface:#1E1E1E` `--accent:#4A9EFF` `--border-strong:#8B6F47` `--text:#E8E3D3` (`--info` unchanged).
- Fonts: `Press Start 2P` (display — wordmark/eyebrows/large numbers only, never body), `Inter` (body/nav/prose), `JetBrains Mono` (coordinates/dates/stats/usernames/task data).
- No flash of wrong theme on load: theme resolved via a synchronous inline (`is:inline`) script in `<head>`, before any paint.
- `prefers-reduced-motion: reduce` disables the hero parallax scroll listener and cloud drift entirely (static cross-section), plus a global CSS animation/transition kill-switch.
- Visible `:focus-visible` outline (accent color) on all interactive elements.
- `/mapa` never embeds the self-hosted squaremap in an iframe — link-out only (`MAP_URL` config constant, empty by default) plus the static pin map built from `projects` collection data (`coordinates`/`mapPosition`).
- Content lives under `src/content/<name>/*.md`, schemas in `src/content.config.ts` (current Astro convention, not the legacy `src/content/config.ts`), using the `glob` loader.
- Cross-collection references (`author`, `assignee`) are plain string slugs, not Zod-validated foreign keys — not worth building for a single-editor, few-dozen-entry content set.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/env.d.ts`
- Create: `.gitignore`
- Create: `src/pages/index.astro`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `preview`, `check`, `test` — every later task's verification step runs `npm run build` and/or `npm test`.

- [ ] **Step 1: Install dependencies**

```bash
npm init -y
npm install astro@latest @astrojs/react@latest react@latest react-dom@latest @tailwindcss/vite@latest tailwindcss@latest
npm install -D @astrojs/check@latest typescript@latest @types/react@latest @types/react-dom@latest vitest@latest
```

- [ ] **Step 2: Edit `package.json`**

Add `"type": "module"` and a `"scripts"` block (keep the `dependencies`/`devDependencies` npm already wrote):

```json
{
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Write `astro.config.mjs`**

```js
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 5: Write `src/env.d.ts`**

```ts
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
```

- [ ] **Step 6: Write `.gitignore`**

```
node_modules/
dist/
.astro/
.env
```

- [ ] **Step 7: Write placeholder `src/pages/index.astro`**

```astro
---
---
<html lang="es-AR">
  <head>
    <meta charset="utf-8" />
    <title>SlayCraft</title>
  </head>
  <body>
    <h1>SlayCraft</h1>
  </body>
</html>
```

- [ ] **Step 8: Verify the build**

Run: `npm run build`
Expected: completes with no errors, `dist/index.html` exists.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Scaffold Astro project with React and Tailwind integrations"
```

---

### Task 2: Design tokens (global.css)

**Files:**
- Create: `src/styles/global.css`
- Modify: `src/pages/index.astro` (import the stylesheet so Tailwind actually processes it, temporary verification only — this page is rewritten in Task 12)

**Interfaces:**
- Produces: CSS custom properties `--bg --surface --accent --border-strong --info --text` (swapped via `[data-theme]`), Tailwind color utilities `bg-bg`, `bg-surface`, `text-accent`, `border-border-strong`, `text-info`, `text-text`, and font utilities `font-display`, `font-body`, `font-mono`. Every later component task consumes these utility names.

- [ ] **Step 1: Write `src/styles/global.css`**

```css
@import "tailwindcss";

:root,
[data-theme="light"] {
  --bg: #F5F1E3;
  --surface: #F5F1E3;
  --accent: #3D8B37;
  --border-strong: #7A5230;
  --info: #5C7A99;
  --text: #2B2B2B;
}

[data-theme="dark"] {
  --bg: #151515;
  --surface: #1E1E1E;
  --accent: #4A9EFF;
  --border-strong: #8B6F47;
  --info: #5C7A99;
  --text: #E8E3D3;
}

@theme {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-accent: var(--accent);
  --color-border-strong: var(--border-strong);
  --color-info: var(--info);
  --color-text: var(--text);
  --font-display: "Press Start 2P", cursive;
  --font-body: "Inter", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
}

body {
  background-color: var(--bg);
  color: var(--text);
}

*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Wire it into the placeholder page**

Edit `src/pages/index.astro`:

```astro
---
import "../styles/global.css";
---
<html lang="es-AR" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <title>SlayCraft</title>
  </head>
  <body class="bg-bg font-body text-text">
    <h1 class="font-display text-accent">SlayCraft</h1>
  </body>
</html>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds; inspect `dist/index.html` — the inlined/linked CSS should contain `#3D8B37` (proof Tailwind picked up the token).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add surface/underground theme tokens and typography scale"
```

---

### Task 3: Theme logic and toggle

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/theme.test.ts`
- Create: `src/components/ThemeToggle.tsx`

**Interfaces:**
- Consumes: `--bg`/`--text`/`--accent`/`--border-strong` Tailwind utilities from Task 2.
- Produces: `resolveInitialTheme(stored: string | null, prefersDark: boolean): "light" | "dark"` (pure, tested here; also used inside `ThemeToggle`). Default export `ThemeToggle` (React component) — consumed by `src/components/Nav.astro` in Task 4 as `<ThemeToggle client:load />`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/theme.test.ts
import { describe, it, expect } from "vitest";
import { resolveInitialTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("uses the stored theme when it's valid", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  it("falls back to system preference when nothing is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
    expect(resolveInitialTheme(null, false)).toBe("light");
  });

  it("ignores garbage stored values", () => {
    expect(resolveInitialTheme("banana", true)).toBe("dark");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: FAIL — `theme.ts` does not exist / `resolveInitialTheme` is not exported.

- [ ] **Step 3: Write `src/lib/theme.ts`**

```ts
export type Theme = "light" | "dark";

export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `src/components/ThemeToggle.tsx`**

```tsx
import { useEffect, useState } from "react";
import { resolveInitialTheme, type Theme } from "../lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark" || current === "light") {
      setTheme(current);
      return;
    }
    setTheme(
      resolveInitialTheme(
        localStorage.getItem("theme"),
        window.matchMedia("(prefers-color-scheme: dark)").matches
      )
    );
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Cambiar a modo superficie" : "Cambiar a modo subterráneo"}
      className="rounded border border-border-strong px-3 py-1 font-mono text-sm text-text transition-colors hover:text-accent"
    >
      {theme === "dark" ? "☀ superficie" : "☾ subterráneo"}
    </button>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run build`
Expected: vitest passes, build succeeds (ThemeToggle isn't mounted on a page yet, but must compile).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add theme resolution logic and toggle component"
```

---

### Task 4: BaseLayout and Nav

**Files:**
- Create: `src/components/Nav.astro`
- Create: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/index.astro` (temporary stub using the new layout, so Nav/toggle are visually checkable before Task 12 writes the real home page)

**Interfaces:**
- Consumes: `ThemeToggle` (Task 3), theme tokens (Task 2).
- Produces: `BaseLayout` Astro component with `Props { title: string; description?: string }` and a default `<slot />` — every page task (5 through 19) wraps its content in `<BaseLayout title="...">`.

- [ ] **Step 1: Write `src/components/Nav.astro`**

```astro
---
import ThemeToggle from "./ThemeToggle";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/mapa", label: "Mapa" },
  { href: "/tareas", label: "Tareas" },
  { href: "/jugadores", label: "Jugadores" },
  { href: "/galeria", label: "Galería" },
];
const currentPath = Astro.url.pathname;
---
<header class="border-b border-border-strong bg-bg">
  <nav class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
    <a href="/" class="font-display text-xs tracking-wide text-accent">SLAYCRAFT</a>
    <ul class="flex flex-wrap gap-4 font-body text-sm">
      {links.map((link) => (
        <li>
          <a
            href={link.href}
            aria-current={currentPath === link.href ? "page" : undefined}
            class="text-text hover:text-accent aria-[current=page]:text-accent aria-[current=page]:underline"
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
    <ThemeToggle client:load />
  </nav>
</header>
```

- [ ] **Step 2: Write `src/layouts/BaseLayout.astro`**

```astro
---
import Nav from "../components/Nav.astro";
import "../styles/global.css";

interface Props {
  title: string;
  description?: string;
}

const {
  title,
  description = "SlayCraft, un servidor de Minecraft cooperativo de supervivencia.",
} = Astro.props;
---
<html lang="es-AR">
  <head>
    <script is:inline>
      (function () {
        var stored = localStorage.getItem("theme");
        var theme =
          stored === "light" || stored === "dark"
            ? stored
            : window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light";
        document.documentElement.setAttribute("data-theme", theme);
      })();
    </script>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · SlayCraft</title>
    <meta name="description" content={description} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
  </head>
  <body class="min-h-screen bg-bg font-body text-text">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-bg"
    >
      Saltar al contenido
    </a>
    <Nav />
    <main id="main">
      <slot />
    </main>
    <footer class="border-t border-border-strong px-4 py-6 text-center font-mono text-xs text-text">
      SlayCraft — servidor cooperativo de Minecraft
    </footer>
  </body>
</html>
```

- [ ] **Step 3: Wire the stub home page**

Replace `src/pages/index.astro`:

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
---
<BaseLayout title="Inicio">
  <h1 class="px-4 py-10 font-display text-accent">SlayCraft</h1>
</BaseLayout>
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: succeeds.
Then run `npm run dev`, open the page, confirm: nav links render in Spanish, clicking the theme toggle flips the page colors instantly with no flash on reload, and the toggle/nav links show a visible focus ring when tabbed to.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add BaseLayout and Nav with no-flash theme script"
```

---

### Task 5: Content collection schemas

**Files:**
- Create: `src/config.ts`
- Create: `src/content/schemas.ts`
- Create: `src/content/schemas.test.ts`
- Create: `src/content.config.ts`

**Interfaces:**
- Produces: `MAP_URL: string` constant (Task 16 reads it). Zod schemas `projectDataSchema`, `playerDataSchema`, `taskSchema`, `galleryDataSchema` (tested here). Collections `projects`, `players`, `tasks`, `gallery` registered in `src/content.config.ts`, each entry typed as `CollectionEntry<"projects" | "players" | "tasks" | "gallery">` — consumed via `getCollection(name)` / `getEntry(name, id)` from `astro:content` in every page task from Task 12 onward.

- [ ] **Step 1: Write `src/config.ts`**

```ts
export const MAP_URL = "";
```

- [ ] **Step 2: Write the failing test**

```ts
// src/content/schemas.test.ts
import { describe, it, expect } from "vitest";
import { projectDataSchema, playerDataSchema, taskSchema, galleryDataSchema } from "./schemas";

describe("projectDataSchema", () => {
  it("accepts a valid project", () => {
    const result = projectDataSchema.safeParse({
      title: "Granja de hierro",
      author: "lei",
      biome: "llanura",
      coordinates: { x: 100, y: 64, z: -200 },
      status: "completed",
      date: "2026-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = projectDataSchema.safeParse({
      title: "Granja de hierro",
      author: "lei",
      biome: "llanura",
      coordinates: { x: 100, y: 64, z: -200 },
      status: "en-pausa",
      date: "2026-01-15",
    });
    expect(result.success).toBe(false);
  });
});

describe("taskSchema", () => {
  it("accepts a task without optional fields", () => {
    const result = taskSchema.safeParse({ title: "Terminar el hub del nether", status: "todo" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    const result = taskSchema.safeParse({ title: "x", status: "bloqueada" });
    expect(result.success).toBe(false);
  });
});

describe("playerDataSchema and galleryDataSchema", () => {
  it("accept valid data", () => {
    expect(
      playerDataSchema.safeParse({ username: "lei", role: "redstone", joinDate: "2025-06-01" }).success
    ).toBe(true);
    expect(
      galleryDataSchema.safeParse({ caption: "Se cayó en lava", date: "2026-01-10" }).success
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/content/schemas.test.ts`
Expected: FAIL — `./schemas` does not exist.

- [ ] **Step 4: Write `src/content/schemas.ts`**

```ts
import { z } from "astro/zod";

export const projectDataSchema = z.object({
  title: z.string(),
  author: z.string(),
  biome: z.string(),
  coordinates: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  mapPosition: z.object({ x: z.number(), y: z.number() }).optional(),
  status: z.enum(["in-progress", "completed"]),
  date: z.coerce.date(),
  tags: z.array(z.string()).optional(),
});

export const playerDataSchema = z.object({
  username: z.string(),
  role: z.string(),
  joinDate: z.coerce.date(),
});

export const taskSchema = z.object({
  title: z.string(),
  status: z.enum(["todo", "in-progress", "done"]),
  assignee: z.string().optional(),
  priority: z.string().optional(),
  notes: z.string().optional(),
});

export const galleryDataSchema = z.object({
  caption: z.string(),
  date: z.coerce.date(),
  tags: z.array(z.string()).optional(),
});
```

Image fields (`coverImage`, `skinImage`, `images`, `image`) are deliberately **not** in these schemas — they need Astro's `image()` schema helper, which only exists inside `defineCollection`'s `astro:content` context and can't be unit-tested standalone. They're added by `.extend()` in `content.config.ts` (Step 6).

- [ ] **Step 5: Run it to confirm it passes**

Run: `npx vitest run src/content/schemas.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Write `src/content.config.ts`**

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { projectDataSchema, playerDataSchema, taskSchema, galleryDataSchema } from "./content/schemas";

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: ({ image }) =>
    projectDataSchema.extend({
      coverImage: image(),
      images: z.array(image()).optional(),
    }),
});

const players = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/players" }),
  schema: ({ image }) => playerDataSchema.extend({ skinImage: image() }),
});

const tasks = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/tasks" }),
  schema: taskSchema,
});

const gallery = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/gallery" }),
  schema: ({ image }) => galleryDataSchema.extend({ image: image() }),
});

export const collections = { projects, players, tasks, gallery };
```

- [ ] **Step 7: Commit**

```bash
mkdir -p src/content/projects src/content/players src/content/tasks src/content/gallery
git add -A
git commit -m "Add content collection schemas and MAP_URL config"
```

---

### Task 6: Seed content

**Files:**
- Create: `src/content/projects/placeholder-cover.svg`
- Create: `src/content/players/placeholder-avatar.svg`
- Create: `src/content/gallery/placeholder-photo.svg`
- Create: `src/content/projects/granja-de-hierro.md`
- Create: `src/content/projects/catedral-del-nether.md`
- Create: `src/content/players/lei.md`
- Create: `src/content/players/facu.md`
- Create: `src/content/tasks/terminar-hub-del-nether.md`
- Create: `src/content/tasks/organizar-bodega-comunal.md`
- Create: `src/content/gallery/2026-01-caida-en-lava.md`
- Create: `src/content/gallery/2026-05-aldea-completa.md`

**Interfaces:**
- Produces: 2 entries per collection with ids `granja-de-hierro`, `catedral-del-nether`, `lei`, `facu`, `terminar-hub-del-nether`, `organizar-bodega-comunal`, `2026-01-caida-en-lava`, `2026-05-aldea-completa` — referenced by slug in later manual verification steps.

- [ ] **Step 1: Write the placeholder SVGs**

```svg
<!-- src/content/projects/placeholder-cover.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#3D8B37"/>
  <rect y="380" width="800" height="120" fill="#7A5230"/>
  <text x="400" y="250" text-anchor="middle" font-family="monospace" font-size="28" fill="#F5F1E3">imagen no disponible</text>
</svg>
```

```svg
<!-- src/content/players/placeholder-avatar.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#5C7A99"/>
  <text x="100" y="105" text-anchor="middle" font-family="monospace" font-size="16" fill="#F5F1E3">skin</text>
</svg>
```

```svg
<!-- src/content/gallery/placeholder-photo.svg -->
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#151515"/>
  <text x="400" y="300" text-anchor="middle" font-family="monospace" font-size="26" fill="#E8E3D3">captura sin cargar</text>
</svg>
```

- [ ] **Step 2: Write the project entries**

```markdown
<!-- src/content/projects/granja-de-hierro.md -->
---
title: "Granja de hierro automática"
author: "lei"
biome: "llanura"
coordinates: { x: 120, y: 64, z: -340 }
mapPosition: { x: 62, y: 38 }
status: "completed"
date: 2026-02-10
coverImage: "./placeholder-cover.svg"
tags: ["redstone", "farmeo"]
---

Granja de hierro con dos aldeanos y un golem, junta todo automáticamente
con tolvas hacia un cofre central. Rinde entre 40 y 60 lingotes por hora
según la actividad de los aldeanos.

Está cerca del spawn para que sea fácil de visitar.
```

```markdown
<!-- src/content/projects/catedral-del-nether.md -->
---
title: "Catedral del Nether"
author: "facu"
biome: "nether"
coordinates: { x: -45, y: 90, z: 210 }
mapPosition: { x: 41, y: 55 }
status: "in-progress"
date: 2026-05-03
coverImage: "./placeholder-cover.svg"
tags: ["construcción", "nether"]
---

Estructura grande de piedra del nether y blackstone pulida, pensada como
punto central para el hub de portales. Falta el techo y la iluminación.
```

- [ ] **Step 3: Write the player entries**

```markdown
<!-- src/content/players/lei.md -->
---
username: "lei"
role: "redstone"
joinDate: 2025-06-01
skinImage: "./placeholder-avatar.svg"
---

Arma la redstone del server: granjas, puertas automáticas, algún que otro
contador que nadie más entiende del todo.
```

```markdown
<!-- src/content/players/facu.md -->
---
username: "facu"
role: "constructor"
joinDate: 2025-07-15
skinImage: "./placeholder-avatar.svg"
---

Construye las estructuras grandes y le tiene fe a la simetría. A cargo de
que el hub del nether quede prolijo.
```

- [ ] **Step 4: Write the task entries**

```markdown
<!-- src/content/tasks/terminar-hub-del-nether.md -->
---
title: "Terminar el hub del Nether"
status: "in-progress"
assignee: "facu"
priority: "alta"
notes: "Falta el techo y conectar los últimos dos portales."
---
```

```markdown
<!-- src/content/tasks/organizar-bodega-comunal.md -->
---
title: "Organizar la bodega comunal"
status: "todo"
priority: "media"
notes: "Separar por categoría, hay cofres mezclados de todo."
---
```

- [ ] **Step 5: Write the gallery entries**

```markdown
<!-- src/content/gallery/2026-01-caida-en-lava.md -->
---
image: "./placeholder-photo.svg"
caption: "facu se cayó en lava buscando diamantes, se salvó por un bloque"
date: 2026-01-18
tags: ["gracioso"]
---
```

```markdown
<!-- src/content/gallery/2026-05-aldea-completa.md -->
---
image: "./placeholder-photo.svg"
caption: "la aldea de comerciantes terminada, once aldeanos instalados"
date: 2026-05-20
tags: ["hito"]
---
```

- [ ] **Step 6: Verify**

Run: `npm run build`
Expected: succeeds with no content-schema validation errors (a bad frontmatter value here would fail the build with a Zod error naming the offending file/field).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Seed content collections with placeholder Argentine-Spanish entries"
```

---

### Task 7: Coordinate and date formatting

**Files:**
- Create: `src/lib/format.ts`
- Create: `src/lib/format.test.ts`

**Interfaces:**
- Produces: `formatCoordinates(coords: {x:number,y:number,z:number}): string`, `formatFecha(date: Date): string` — consumed by `ProjectCard.astro` (Task 13), `CopyCoordinatesButton.astro` and `[slug].astro` (Task 15), `PlayerCard.astro` (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/format.test.ts
import { describe, it, expect } from "vitest";
import { formatCoordinates, formatFecha } from "./format";

describe("formatCoordinates", () => {
  it("formats x/y/z including negative values", () => {
    expect(formatCoordinates({ x: 120, y: 64, z: -340 })).toBe("X: 120 Y: 64 Z: -340");
  });
});

describe("formatFecha", () => {
  it("formats a date in Argentine Spanish", () => {
    expect(formatFecha(new Date("2026-02-10T00:00:00Z"))).toMatch(/10 feb\.? 2026/i);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/format.ts`**

```ts
export function formatCoordinates(coords: { x: number; y: number; z: number }): string {
  return `X: ${coords.x} Y: ${coords.y} Z: ${coords.z}`;
}

export function formatFecha(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add coordinate and Argentine-Spanish date formatting helpers"
```

---

### Task 8: Parallax math

**Files:**
- Create: `src/lib/scroll.ts`
- Create: `src/lib/scroll.test.ts`

**Interfaces:**
- Produces: `clamp(value:number,min:number,max:number):number`, `parallaxOffset(scrollY:number,speed:number,maxOffset:number):number` — consumed by `TerrainHero.astro`'s client script (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/scroll.test.ts
import { describe, it, expect } from "vitest";
import { clamp, parallaxOffset } from "./scroll";

describe("clamp", () => {
  it("clamps within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("parallaxOffset", () => {
  it("scales scroll position by speed", () => {
    expect(parallaxOffset(100, 0.5, 1000)).toBe(50);
  });

  it("clamps to maxOffset", () => {
    expect(parallaxOffset(10000, 0.5, 200)).toBe(200);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/scroll.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/scroll.ts`**

```ts
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function parallaxOffset(scrollY: number, speed: number, maxOffset: number): number {
  return clamp(scrollY * speed, -maxOffset, maxOffset);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/scroll.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add parallax offset math"
```

---

### Task 9: Project filter/sort logic

**Files:**
- Create: `src/lib/filterSort.ts`
- Create: `src/lib/filterSort.test.ts`

**Interfaces:**
- Produces: `interface ProjectSummary { status: string; author: string; biome: string; date: string; title: string }`, `interface ProjectFilters { status?: string; author?: string; biome?: string }`, `type SortKey = "date-desc" | "date-asc" | "title-asc"`, `matchesFilters(project: ProjectSummary, filters: ProjectFilters): boolean`, `compareProjects(a: ProjectSummary, b: ProjectSummary, sortKey: SortKey): number` — consumed by `src/scripts/project-filters.ts` (Task 14), which reads these same field names off `data-status`/`data-author`/`data-biome`/`data-date`/`data-title` attributes.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/filterSort.test.ts
import { describe, it, expect } from "vitest";
import { matchesFilters, compareProjects, type ProjectSummary } from "./filterSort";

const projects: ProjectSummary[] = [
  { status: "completed", author: "lei", biome: "llanura", date: "2026-02-10", title: "Granja de hierro" },
  { status: "in-progress", author: "facu", biome: "nether", date: "2026-05-03", title: "Catedral del Nether" },
];

describe("matchesFilters", () => {
  it("matches everything when no filters are set", () => {
    expect(matchesFilters(projects[0], {})).toBe(true);
  });

  it("filters by status", () => {
    expect(matchesFilters(projects[0], { status: "in-progress" })).toBe(false);
    expect(matchesFilters(projects[1], { status: "in-progress" })).toBe(true);
  });

  it("filters by author and biome together", () => {
    expect(matchesFilters(projects[1], { author: "facu", biome: "nether" })).toBe(true);
    expect(matchesFilters(projects[1], { author: "facu", biome: "llanura" })).toBe(false);
  });
});

describe("compareProjects", () => {
  it("sorts by date descending by default", () => {
    expect(compareProjects(projects[0], projects[1], "date-desc")).toBeGreaterThan(0);
  });

  it("sorts by title ascending", () => {
    expect(compareProjects(projects[1], projects[0], "title-asc")).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/filterSort.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/filterSort.ts`**

```ts
export interface ProjectSummary {
  status: string;
  author: string;
  biome: string;
  date: string;
  title: string;
}

export interface ProjectFilters {
  status?: string;
  author?: string;
  biome?: string;
}

export function matchesFilters(project: ProjectSummary, filters: ProjectFilters): boolean {
  if (filters.status && project.status !== filters.status) return false;
  if (filters.author && project.author !== filters.author) return false;
  if (filters.biome && project.biome !== filters.biome) return false;
  return true;
}

export type SortKey = "date-desc" | "date-asc" | "title-asc";

export function compareProjects(a: ProjectSummary, b: ProjectSummary, sortKey: SortKey): number {
  switch (sortKey) {
    case "date-asc":
      return a.date.localeCompare(b.date);
    case "title-asc":
      return a.title.localeCompare(b.title, "es");
    case "date-desc":
    default:
      return b.date.localeCompare(a.date);
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/filterSort.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add project filter and sort logic"
```

---

### Task 10: Gallery index wraparound and scroll reveal

**Files:**
- Create: `src/lib/gallery.ts`
- Create: `src/lib/gallery.test.ts`
- Create: `src/scripts/reveal.ts`
- Create: `src/components/RevealSection.astro`
- Modify: `src/layouts/BaseLayout.astro` (call `initReveal()` once per page load)

**Interfaces:**
- Produces: `nextIndex(current:number,length:number,delta:number):number` (Task 19 lightbox), `initReveal(): void` (called from `BaseLayout.astro`, scans `[data-reveal]`), `RevealSection` Astro component wrapping `<slot />` in a `[data-reveal]` div with `is-revealed` fade/slide transition classes — consumed by `pages/index.astro` (Task 12).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/gallery.test.ts
import { describe, it, expect } from "vitest";
import { nextIndex } from "./gallery";

describe("nextIndex", () => {
  it("wraps forward past the end", () => {
    expect(nextIndex(2, 3, 1)).toBe(0);
  });

  it("wraps backward past the start", () => {
    expect(nextIndex(0, 3, -1)).toBe(2);
  });

  it("steps normally within range", () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/lib/gallery.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/gallery.ts`**

```ts
export function nextIndex(current: number, length: number, delta: number): number {
  return (current + delta + length) % length;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/lib/gallery.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `src/scripts/reveal.ts`**

```ts
export function initReveal(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      el.classList.add("is-revealed");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => observer.observe(el));
}
```

- [ ] **Step 6: Write `src/components/RevealSection.astro`**

```astro
---
interface Props {
  class?: string;
}
const { class: className = "" } = Astro.props;
---
<div
  data-reveal
  class:list={[
    "opacity-0 translate-y-4 transition-all duration-700 [&.is-revealed]:opacity-100 [&.is-revealed]:translate-y-0",
    className,
  ]}
>
  <slot />
</div>
```

- [ ] **Step 7: Wire it into `BaseLayout.astro`**

Add just before `</body>`:

```astro
    <script>
      import { initReveal } from "../scripts/reveal";
      initReveal();
    </script>
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`
Expected: all vitest suites pass, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add gallery index math and scroll-reveal wrapper"
```

---

### Task 11: Terrain cross-section hero

**Files:**
- Create: `src/components/TerrainHero.astro`

**Interfaces:**
- Consumes: `parallaxOffset` from `src/lib/scroll.ts` (Task 8).
- Produces: `TerrainHero` Astro component (no props) — consumed by `pages/index.astro` (Task 12).

- [ ] **Step 1: Write `src/components/TerrainHero.astro`**

```astro
---
---
<section
  id="hero-cross-section"
  class="relative h-[70vh] min-h-[420px] w-full overflow-hidden"
  aria-label="Corte transversal del mundo de SlayCraft"
>
  <div data-parallax data-speed="0.2" class="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-sky-300 to-sky-100">
    <div class="cloud absolute left-[10%] top-[15%] h-10 w-32 rounded-full bg-white/70"></div>
    <div class="cloud absolute left-[55%] top-[30%] h-8 w-40 rounded-full bg-white/60" style="animation-delay: -6s;"></div>
    <div class="cloud absolute left-[75%] top-[10%] h-6 w-24 rounded-full bg-white/50" style="animation-delay: -12s;"></div>
  </div>
  <div data-parallax data-speed="0.4" class="absolute inset-x-0 top-[45%] h-[12%] bg-[#3D8B37]"></div>
  <div data-parallax data-speed="0.6" class="absolute inset-x-0 top-[57%] h-[23%] bg-[#8A8578]"></div>
  <div data-parallax data-speed="0.8" class="absolute inset-x-0 top-[80%] h-[20%] bg-[#1F1F24]"></div>

  <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
    <h1 class="font-display text-2xl text-bg drop-shadow-md sm:text-3xl">SLAYCRAFT</h1>
    <p class="max-w-md font-body text-bg drop-shadow-md">
      Servidor de Minecraft cooperativo de supervivencia. Sin apuro, sin reglas raras: construimos entre todos.
    </p>
  </div>
</section>

<style>
  .cloud {
    animation: drift 60s linear infinite;
  }

  @keyframes drift {
    from {
      transform: translateX(-10vw);
    }
    to {
      transform: translateX(10vw);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .cloud {
      animation: none;
    }
  }
</style>

<script>
  import { parallaxOffset } from "../lib/scroll";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reduceMotion) {
    const layers = document.querySelectorAll<HTMLElement>("#hero-cross-section [data-parallax]");
    let ticking = false;

    function update() {
      const scrollY = window.scrollY;
      layers.forEach((layer) => {
        const speed = Number(layer.dataset.speed ?? "0");
        const offset = parallaxOffset(scrollY, speed, 200);
        layer.style.transform = `translateY(${offset}px)`;
      });
      ticking = false;
    }

    window.addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
  }
</script>
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds (not mounted on a page yet, but must compile clean).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add terrain cross-section hero with reduced-motion-aware parallax"
```

---

### Task 12: Home page

**Files:**
- Modify: `src/pages/index.astro` (replace the Task 4 stub with the real home page)

**Interfaces:**
- Consumes: `TerrainHero` (Task 11), `RevealSection` (Task 10), `getCollection` from `astro:content` (Task 5 registrations).

- [ ] **Step 1: Write `src/pages/index.astro`**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import TerrainHero from "../components/TerrainHero.astro";
import RevealSection from "../components/RevealSection.astro";
import { getCollection } from "astro:content";

const projects = await getCollection("projects");
const players = await getCollection("players");

const oldestJoinDate = players
  .map((p) => p.data.joinDate)
  .sort((a, b) => a.getTime() - b.getTime())[0];

const sinceLabel = oldestJoinDate
  ? new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(oldestJoinDate)
  : "—";
---
<BaseLayout title="Inicio">
  <TerrainHero />
  <RevealSection class="mx-auto grid max-w-4xl grid-cols-1 gap-6 px-4 py-16 text-center font-mono sm:grid-cols-3">
    <div>
      <p class="text-3xl text-accent">{sinceLabel}</p>
      <p class="text-sm text-text">desde</p>
    </div>
    <div>
      <p class="text-3xl text-accent">{players.length}</p>
      <p class="text-sm text-text">jugadores</p>
    </div>
    <div>
      <p class="text-3xl text-accent">{projects.length}</p>
      <p class="text-sm text-text">estructuras registradas</p>
    </div>
  </RevealSection>
</BaseLayout>
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds; `dist/index.html` contains the hero bands and the stat numbers `2` and `2` (2 seed players, 2 seed projects).
Then `npm run dev`: scroll the hero and confirm the sky/grass/stone/deepslate bands move at different speeds; confirm the stat block fades/slides in on scroll.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Build the home page with hero and stat callouts"
```

---

### Task 13: Project card

**Files:**
- Create: `src/components/StatusBadge.astro`
- Create: `src/components/ProjectCard.astro`

**Interfaces:**
- Consumes: `formatCoordinates` (Task 7).
- Produces: `ProjectCard` Astro component with `Props { project: CollectionEntry<"projects"> }`, rendering an `<a>` with `data-project-card data-status data-author data-biome data-date data-title` attributes — Task 14's filter script reads exactly these attribute names. Consumed by `pages/proyectos/index.astro` (Task 14).

- [ ] **Step 1: Write `src/components/StatusBadge.astro`**

```astro
---
interface Props {
  status: "in-progress" | "completed";
}
const { status } = Astro.props;
const label = status === "completed" ? "completado" : "en progreso";
---
<span class="rounded-full border border-border-strong px-2 py-0.5 font-mono text-xs text-text">
  {label}
</span>
```

- [ ] **Step 2: Write `src/components/ProjectCard.astro`**

```astro
---
import { Image } from "astro:assets";
import type { CollectionEntry } from "astro:content";
import StatusBadge from "./StatusBadge.astro";
import { formatCoordinates } from "../lib/format";

interface Props {
  project: CollectionEntry<"projects">;
}
const { project } = Astro.props;
const { title, author, biome, coordinates, status, coverImage, date } = project.data;
---
<a
  href={`/proyectos/${project.id}`}
  data-project-card
  data-status={status}
  data-author={author}
  data-biome={biome}
  data-date={date.toISOString()}
  data-title={title}
  class="block overflow-hidden rounded border border-border-strong bg-surface transition-transform hover:-translate-y-1"
>
  <Image src={coverImage} alt={title} width={400} height={250} class="h-40 w-full object-cover" />
  <div class="space-y-1 p-3">
    <div class="flex items-center justify-between gap-2">
      <h3 class="font-body font-semibold text-text">{title}</h3>
      <StatusBadge status={status} />
    </div>
    <p class="font-body text-sm text-info">{author} · {biome}</p>
    <p class="font-mono text-xs text-text">{formatCoordinates(coordinates)}</p>
  </div>
</a>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds (not mounted on a page yet).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add ProjectCard and StatusBadge components"
```

---

### Task 14: Projects grid with filter/sort

**Files:**
- Create: `src/scripts/project-filters.ts`
- Create: `src/pages/proyectos/index.astro`

**Interfaces:**
- Consumes: `matchesFilters`, `compareProjects`, `SortKey` (Task 9), `ProjectCard` (Task 13).

- [ ] **Step 1: Write `src/scripts/project-filters.ts`**

```ts
import { matchesFilters, compareProjects, type SortKey } from "../lib/filterSort";

export function initProjectFilters(): void {
  const grid = document.querySelector<HTMLElement>("[data-project-grid]");
  const statusSelect = document.querySelector<HTMLSelectElement>("[data-filter-status]");
  const authorSelect = document.querySelector<HTMLSelectElement>("[data-filter-author]");
  const biomeSelect = document.querySelector<HTMLSelectElement>("[data-filter-biome]");
  const sortSelect = document.querySelector<HTMLSelectElement>("[data-sort]");
  if (!grid || !statusSelect || !authorSelect || !biomeSelect || !sortSelect) return;

  const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-project-card]"));

  function toSummary(card: HTMLElement) {
    return {
      status: card.dataset.status ?? "",
      author: card.dataset.author ?? "",
      biome: card.dataset.biome ?? "",
      date: card.dataset.date ?? "",
      title: card.dataset.title ?? "",
    };
  }

  function apply() {
    const filters = {
      status: statusSelect!.value || undefined,
      author: authorSelect!.value || undefined,
      biome: biomeSelect!.value || undefined,
    };
    const sortKey = sortSelect!.value as SortKey;

    const visible = cards.filter((card) => matchesFilters(toSummary(card), filters));

    visible
      .sort((a, b) => compareProjects(toSummary(a), toSummary(b), sortKey))
      .forEach((card) => grid!.appendChild(card));

    cards.forEach((card) => {
      card.hidden = !visible.includes(card);
    });
  }

  for (const select of [statusSelect, authorSelect, biomeSelect, sortSelect]) {
    select.addEventListener("change", apply);
  }
}
```

- [ ] **Step 2: Write `src/pages/proyectos/index.astro`**

```astro
---
import BaseLayout from "../../layouts/BaseLayout.astro";
import ProjectCard from "../../components/ProjectCard.astro";
import { getCollection } from "astro:content";

const projects = (await getCollection("projects")).sort(
  (a, b) => b.data.date.getTime() - a.data.date.getTime()
);
const authors = [...new Set(projects.map((p) => p.data.author))];
const biomes = [...new Set(projects.map((p) => p.data.biome))];
---
<BaseLayout title="Proyectos" description="Estructuras construidas en la superficie de SlayCraft.">
  <section class="mx-auto max-w-5xl px-4 py-10">
    <p class="font-display text-xs text-accent">ESTRUCTURAS</p>
    <h1 class="mt-2 font-body text-2xl text-text">Proyectos</h1>

    <div class="mt-6 flex flex-wrap gap-3 font-mono text-sm">
      <select data-filter-status class="rounded border border-border-strong bg-bg px-2 py-1 text-text">
        <option value="">Todos los estados</option>
        <option value="in-progress">En progreso</option>
        <option value="completed">Completado</option>
      </select>
      <select data-filter-author class="rounded border border-border-strong bg-bg px-2 py-1 text-text">
        <option value="">Todos los autores</option>
        {authors.map((author) => <option value={author}>{author}</option>)}
      </select>
      <select data-filter-biome class="rounded border border-border-strong bg-bg px-2 py-1 text-text">
        <option value="">Todos los biomas</option>
        {biomes.map((biome) => <option value={biome}>{biome}</option>)}
      </select>
      <select data-sort class="rounded border border-border-strong bg-bg px-2 py-1 text-text">
        <option value="date-desc">Más nuevo primero</option>
        <option value="date-asc">Más viejo primero</option>
        <option value="title-asc">Título (A-Z)</option>
      </select>
    </div>

    <div data-project-grid class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => <ProjectCard project={project} />)}
    </div>
  </section>
</BaseLayout>

<script>
  import { initProjectFilters } from "../../scripts/project-filters";
  initProjectFilters();
</script>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds; `dist/proyectos/index.html` exists.
Then `npm run dev`, open `/proyectos`, confirm: 2 cards render, changing the status/author/biome selects hides non-matching cards, changing sort reorders them.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add projects grid page with client-side filter and sort"
```

---

### Task 15: Project detail page

**Files:**
- Create: `src/components/CopyCoordinatesButton.astro`
- Create: `src/pages/proyectos/[slug].astro`

**Interfaces:**
- Consumes: `formatCoordinates`, `formatFecha` (Task 7), `StatusBadge` (Task 13).

- [ ] **Step 1: Write `src/components/CopyCoordinatesButton.astro`**

```astro
---
interface Props {
  coordinates: { x: number; y: number; z: number };
}
const { coordinates } = Astro.props;
const value = `${coordinates.x} ${coordinates.y} ${coordinates.z}`;
---
<button
  type="button"
  data-copy-coordinates
  data-value={value}
  class="rounded border border-border-strong px-3 py-1 font-mono text-sm text-text hover:text-accent"
>
  Copiar coordenadas
</button>

<script>
  document.querySelectorAll<HTMLButtonElement>("[data-copy-coordinates]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.value ?? "";
      await navigator.clipboard.writeText(value);
      const original = button.textContent;
      button.textContent = "¡Copiado!";
      setTimeout(() => {
        button.textContent = original;
      }, 1500);
    });
  });
</script>
```

- [ ] **Step 2: Write `src/pages/proyectos/[slug].astro`**

```astro
---
import { getCollection, render } from "astro:content";
import { Image } from "astro:assets";
import BaseLayout from "../../layouts/BaseLayout.astro";
import StatusBadge from "../../components/StatusBadge.astro";
import CopyCoordinatesButton from "../../components/CopyCoordinatesButton.astro";
import { formatCoordinates, formatFecha } from "../../lib/format";

export async function getStaticPaths() {
  const projects = await getCollection("projects");
  return projects.map((project) => ({
    params: { slug: project.id },
    props: { project },
  }));
}

const { project } = Astro.props;
const { title, author, biome, coordinates, status, date, coverImage, images } = project.data;
const { Content } = await render(project);
---
<BaseLayout title={title}>
  <article class="mx-auto max-w-3xl px-4 py-10">
    <p class="font-mono text-xs text-info">{biome} · {formatFecha(date)}</p>
    <div class="mt-1 flex items-center gap-3">
      <h1 class="font-body text-2xl text-text">{title}</h1>
      <StatusBadge status={status} />
    </div>
    <p class="mt-1 font-body text-sm text-info">por {author}</p>

    <Image src={coverImage} alt={title} width={800} height={500} class="mt-6 w-full rounded" />

    <div class="mt-4 flex items-center gap-4">
      <p class="font-mono text-sm text-text">{formatCoordinates(coordinates)}</p>
      <CopyCoordinatesButton coordinates={coordinates} />
    </div>

    <div class="mt-8 font-body leading-relaxed text-text [&_h2]:mt-6 [&_h2]:font-semibold [&_p]:mt-3">
      <Content />
    </div>

    {images && images.length > 0 && (
      <div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {images.map((img) => (
          <Image src={img} alt={title} width={400} height={300} class="rounded" />
        ))}
      </div>
    )}
  </article>
</BaseLayout>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds; `dist/proyectos/granja-de-hierro/index.html` and `dist/proyectos/catedral-del-nether/index.html` exist.
Then `npm run dev`, open `/proyectos/granja-de-hierro`, click "Copiar coordenadas", confirm the button label flips to "¡Copiado!" and the clipboard holds `120 64 -340`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add project detail page with copy-coordinates button"
```

---

### Task 16: Map page

**Files:**
- Create: `src/components/MapPins.astro`
- Create: `src/pages/mapa.astro`

**Interfaces:**
- Consumes: `MAP_URL` (Task 5).

- [ ] **Step 1: Write `src/components/MapPins.astro`**

```astro
---
import type { CollectionEntry } from "astro:content";
interface Props {
  projects: CollectionEntry<"projects">[];
}
const { projects } = Astro.props;
const pinned = projects.filter((p) => p.data.mapPosition);
---
<div class="relative aspect-video w-full overflow-hidden rounded border border-border-strong bg-surface">
  <div class="absolute inset-0 bg-gradient-to-br from-[#3D8B37]/30 to-[#1F1F24]/30"></div>
  {pinned.map((project) => (
    <a
      href={`/proyectos/${project.id}`}
      class="group absolute -translate-x-1/2 -translate-y-1/2"
      style={`left: ${project.data.mapPosition!.x}%; top: ${project.data.mapPosition!.y}%;`}
      aria-label={project.data.title}
    >
      <span class="block h-3 w-3 rounded-full border-2 border-bg bg-accent shadow"></span>
      <span class="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-bg px-2 py-1 font-mono text-xs text-text opacity-0 shadow group-hover:opacity-100 group-focus:opacity-100">
        {project.data.title}
      </span>
    </a>
  ))}
</div>
```

- [ ] **Step 2: Write `src/pages/mapa.astro`**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import MapPins from "../components/MapPins.astro";
import { getCollection } from "astro:content";
import { MAP_URL } from "../config";

const projects = await getCollection("projects");
---
<BaseLayout title="Mapa" description="El mundo de SlayCraft visto desde arriba.">
  <section class="mx-auto max-w-5xl px-4 py-10">
    <p class="font-display text-xs text-accent">DESDE ARRIBA</p>
    <h1 class="mt-2 font-body text-2xl text-text">Mapa</h1>

    {MAP_URL ? (
      <a
        href={MAP_URL}
        target="_blank"
        rel="noopener noreferrer"
        class="mt-6 inline-block rounded border border-border-strong bg-surface px-4 py-2 font-mono text-sm text-text hover:text-accent"
      >
        Abrir mapa en vivo ↗
      </a>
    ) : (
      <p class="mt-6 font-mono text-sm text-info">Mapa no configurado todavía.</p>
    )}

    <div class="mt-8">
      <MapPins projects={projects} />
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds; `dist/mapa/index.html` exists and contains "Mapa no configurado todavía" (since `MAP_URL` is empty by default).
Then `npm run dev`, open `/mapa`, confirm both project pins are positioned inside the map box and hovering shows the project title, clicking a pin navigates to its detail page.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add map page with link-out card and static pin overlay"
```

---

### Task 17: Tasks board

**Files:**
- Create: `src/components/TaskColumn.astro`
- Create: `src/pages/tareas.astro`

**Interfaces:**
- (none beyond `astro:content` collection access)

- [ ] **Step 1: Write `src/components/TaskColumn.astro`**

```astro
---
import type { CollectionEntry } from "astro:content";
interface Props {
  title: string;
  tasks: CollectionEntry<"tasks">[];
  checked: boolean;
}
const { title, tasks, checked } = Astro.props;
---
<div class="rounded border border-border-strong bg-surface p-4">
  <h2 class="font-body font-semibold text-text">{title}</h2>
  <ul class="mt-3 space-y-2">
    {tasks.map((task) => (
      <li class="flex items-start gap-2 font-mono text-sm text-text">
        <input type="checkbox" checked={checked} disabled class="mt-1 accent-[color:var(--accent)]" />
        <div>
          <p>{task.data.title}</p>
          {task.data.assignee && <p class="text-xs text-info">{task.data.assignee}</p>}
        </div>
      </li>
    ))}
    {tasks.length === 0 && <li class="font-mono text-sm text-info">Sin tareas.</li>}
  </ul>
</div>
```

- [ ] **Step 2: Write `src/pages/tareas.astro`**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import TaskColumn from "../components/TaskColumn.astro";
import { getCollection } from "astro:content";

const tasks = await getCollection("tasks");
const todo = tasks.filter((t) => t.data.status === "todo");
const inProgress = tasks.filter((t) => t.data.status === "in-progress");
const done = tasks.filter((t) => t.data.status === "done");
---
<BaseLayout title="Tareas">
  <section class="mx-auto max-w-5xl px-4 py-10">
    <p class="font-display text-xs text-accent">PENDIENTES</p>
    <h1 class="mt-2 font-body text-2xl text-text">Tareas</h1>
    <div class="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
      <TaskColumn title="Por hacer" tasks={todo} checked={false} />
      <TaskColumn title="En progreso" tasks={inProgress} checked={false} />
      <TaskColumn title="Terminado" tasks={done} checked={true} />
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds; `dist/tareas/index.html` exists.
Then `npm run dev`, open `/tareas`, confirm the seed task "Terminar el hub del Nether" appears under "En progreso" and "Organizar la bodega comunal" under "Por hacer", both as disabled (read-only) checkboxes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add read-only kanban tasks board"
```

---

### Task 18: Players page

**Files:**
- Create: `src/components/PlayerCard.astro`
- Create: `src/pages/jugadores.astro`

**Interfaces:**
- Consumes: `formatFecha` (Task 7).

- [ ] **Step 1: Write `src/components/PlayerCard.astro`**

```astro
---
import { Image } from "astro:assets";
import type { CollectionEntry } from "astro:content";
import { formatFecha } from "../lib/format";

interface Props {
  player: CollectionEntry<"players">;
}
const { player } = Astro.props;
const { username, role, joinDate, skinImage } = player.data;
---
<div class="flex flex-col items-center rounded border border-border-strong bg-surface p-4 text-center">
  <Image src={skinImage} alt={username} width={100} height={100} class="h-20 w-20 rounded" />
  <p class="mt-3 font-mono text-sm text-text">{username}</p>
  <p class="font-body text-sm text-info">{role}</p>
  <p class="mt-1 font-mono text-xs text-text">desde {formatFecha(joinDate)}</p>
</div>
```

- [ ] **Step 2: Write `src/pages/jugadores.astro`**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import PlayerCard from "../components/PlayerCard.astro";
import { getCollection } from "astro:content";

const players = await getCollection("players");
---
<BaseLayout title="Jugadores">
  <section class="mx-auto max-w-5xl px-4 py-10">
    <p class="font-display text-xs text-accent">PUNTOS DE SPAWN</p>
    <h1 class="mt-2 font-body text-2xl text-text">Jugadores</h1>
    <div class="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
      {players.map((player) => <PlayerCard player={player} />)}
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: succeeds; `dist/jugadores/index.html` exists with both seed players.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add players grid page"
```

---

### Task 19: Gallery with lightbox

**Files:**
- Create: `src/components/GalleryGrid.astro`
- Create: `src/scripts/lightbox.ts`
- Create: `src/pages/galeria.astro`

**Interfaces:**
- Consumes: `nextIndex` (Task 10).

- [ ] **Step 1: Write `src/components/GalleryGrid.astro`**

```astro
---
import { Image, getImage } from "astro:assets";
import type { CollectionEntry } from "astro:content";
interface Props {
  items: CollectionEntry<"gallery">[];
}
const { items } = Astro.props;
const fullSizes = await Promise.all(items.map((item) => getImage({ src: item.data.image, width: 1200 })));
---
<div data-gallery class="columns-2 gap-4 sm:columns-3">
  {items.map((item, index) => (
    <button
      type="button"
      data-gallery-item
      data-index={index}
      data-caption={item.data.caption}
      data-full-src={fullSizes[index].src}
      class="mb-4 block w-full break-inside-avoid"
    >
      <Image src={item.data.image} alt={item.data.caption} width={500} height={400} class="w-full rounded" />
    </button>
  ))}
</div>

<dialog data-lightbox class="w-full max-w-3xl rounded border border-border-strong bg-surface p-4 backdrop:bg-black/70">
  <button type="button" data-lightbox-close class="float-right font-mono text-sm text-text hover:text-accent">
    cerrar ✕
  </button>
  <img data-lightbox-image src="" alt="" class="mt-8 w-full rounded" />
  <p data-lightbox-caption class="mt-2 font-mono text-sm text-text"></p>
  <div class="mt-3 flex justify-between">
    <button type="button" data-lightbox-prev class="font-mono text-sm text-text hover:text-accent">
      ← anterior
    </button>
    <button type="button" data-lightbox-next class="font-mono text-sm text-text hover:text-accent">
      siguiente →
    </button>
  </div>
</dialog>
```

- [ ] **Step 2: Write `src/scripts/lightbox.ts`**

```ts
import { nextIndex } from "../lib/gallery";

export function initLightbox(): void {
  const dialog = document.querySelector<HTMLDialogElement>("[data-lightbox]");
  const items = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-gallery-item]"));
  const image = dialog?.querySelector<HTMLImageElement>("[data-lightbox-image]");
  const caption = dialog?.querySelector<HTMLElement>("[data-lightbox-caption]");
  const closeButton = dialog?.querySelector<HTMLButtonElement>("[data-lightbox-close]");
  const prevButton = dialog?.querySelector<HTMLButtonElement>("[data-lightbox-prev]");
  const nextButton = dialog?.querySelector<HTMLButtonElement>("[data-lightbox-next]");
  if (!dialog || !image || !caption || !closeButton || !prevButton || !nextButton || items.length === 0) return;

  let current = 0;

  function show(index: number) {
    current = index;
    const item = items[current];
    image!.src = item.dataset.fullSrc ?? "";
    image!.alt = item.dataset.caption ?? "";
    caption!.textContent = item.dataset.caption ?? "";
  }

  items.forEach((item, index) => {
    item.addEventListener("click", () => {
      show(index);
      dialog.showModal();
    });
  });

  closeButton.addEventListener("click", () => dialog.close());
  prevButton.addEventListener("click", () => show(nextIndex(current, items.length, -1)));
  nextButton.addEventListener("click", () => show(nextIndex(current, items.length, 1)));

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(nextIndex(current, items.length, -1));
    if (event.key === "ArrowRight") show(nextIndex(current, items.length, 1));
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
```

Native `<dialog>.showModal()` provides focus trapping and Escape-to-close for free — no custom focus-trap code needed.

- [ ] **Step 3: Write `src/pages/galeria.astro`**

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
import GalleryGrid from "../components/GalleryGrid.astro";
import { getCollection } from "astro:content";

const items = (await getCollection("gallery")).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
---
<BaseLayout title="Galería">
  <section class="mx-auto max-w-5xl px-4 py-10">
    <p class="font-display text-xs text-accent">MOMENTOS</p>
    <h1 class="mt-2 font-body text-2xl text-text">Galería</h1>
    <div class="mt-8">
      <GalleryGrid items={items} />
    </div>
  </section>
</BaseLayout>

<script>
  import { initLightbox } from "../scripts/lightbox";
  initLightbox();
</script>
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: succeeds; `dist/galeria/index.html` exists.
Then `npm run dev`, open `/galeria`, click a thumbnail, confirm the dialog opens with the full image and caption, Escape closes it, and the ← → buttons and arrow keys cycle between the two seed images.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add gallery grid with native-dialog lightbox"
```

---

### Task 20: Netlify config and final verification

**Files:**
- Create: `netlify.toml`

**Interfaces:**
- (none — final integration task)

- [ ] **Step 1: Write `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all suites pass — `theme.test.ts` (3), `schemas.test.ts` (5), `format.test.ts` (2), `scroll.test.ts` (3), `filterSort.test.ts` (5), `gallery.test.ts` (3).

- [ ] **Step 3: Run the full build**

Run: `npm run build`
Expected: succeeds; `dist/` contains `index.html`, `proyectos/index.html`, `proyectos/granja-de-hierro/index.html`, `proyectos/catedral-del-nether/index.html`, `mapa/index.html`, `tareas/index.html`, `jugadores/index.html`, `galeria/index.html`.

- [ ] **Step 4: Manual QA pass**

Run: `npm run dev`, then in a browser:
- Resize to a mobile width (375px) and confirm every page reflows without horizontal scroll or overlapping content.
- Tab through the nav, theme toggle, filter selects, copy-coordinates button, and gallery thumbnails — confirm a visible accent-colored focus ring on each.
- Toggle the OS `prefers-reduced-motion` setting (or DevTools "Emulate CSS media feature") and reload the home page — confirm the hero bands and clouds are static, no parallax on scroll.
- Toggle dark mode and confirm the accent color switches from green to blue (not just an inverted palette) and the choice survives a page reload.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Netlify build config"
```
