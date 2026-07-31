# Dashboard Motion Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Framer Motion driven animations (page transitions, hover feedback, staggered entrances, animated numbers, ambient scroll parallax) to the dashboard's global shell (Layout, Sidebar, Card) and Overview page.

**Architecture:** `framer-motion` is added to `dashboard/client`. A small shared `src/lib/motion.ts` module holds reusable variants. `MotionConfig reducedMotion="user"` wraps the app once so every `motion.*` component auto-respects OS reduced-motion. Layout.tsx gets `AnimatePresence`-driven route transitions plus two ambient parallax background blobs driven by a new `useParallax` hook. Sidebar and Card become `motion` components with hover/active-state animation. Overview.tsx gets staggered mount animations and a `useAnimatedNumber` counter hook for its stat tiles.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, react-router-dom v6, framer-motion (new).

## Global Constraints

- Add `framer-motion` (latest, `^12.43.0`) to `dashboard/client/package.json` dependencies — no other new dependencies.
- No client test framework exists in this project (no vitest/jest, no `*.test.*` files under `dashboard/client`). Verification per task is: `tsc` clean (`npm run build` in `dashboard/client`) plus a manual browser check. Do not introduce a test framework as part of this plan.
- Every animation must respect `prefers-reduced-motion`: covered globally by `MotionConfig` for `motion.*` props, and explicitly checked inside any hook that drives animation via plain JS (`useParallax`, `useAnimatedNumber`).
- Scope is limited to: `main.tsx`/`App.tsx` (MotionConfig wrap only), `Layout.tsx`, `Sidebar.tsx`, `Card.tsx`, `Overview.tsx`, plus new files `src/lib/motion.ts`, `src/lib/useParallax.ts`, `src/lib/useAnimatedNumber.ts`. No other page files are touched.
- Spanish UI copy is untouched — this plan only adds motion/visual behavior, no text changes.

---

### Task 1: Install framer-motion and add shared motion config

**Files:**
- Modify: `dashboard/client/package.json`
- Create: `dashboard/client/src/lib/motion.ts`
- Modify: `dashboard/client/src/main.tsx`

**Interfaces:**
- Produces: `fadeUp` (Framer Motion `Variants`), `staggerContainer` (Framer Motion `Variants`) — exported from `src/lib/motion.ts`, consumed by Task 5 (Overview.tsx).
- Produces: app-wide `MotionConfig reducedMotion="user"` wrapper — all later `motion.*` usage (Tasks 2-5) relies on this being present so per-component reduced-motion handling isn't needed for declarative `motion.*` props.

- [ ] **Step 1: Install the dependency**

Run: `cd dashboard/client && npm install framer-motion@^12.43.0`

Expected: `package.json` dependencies gains `"framer-motion": "^12.43.0"`, lockfile updates.

- [ ] **Step 2: Create the shared motion variants module**

Create `dashboard/client/src/lib/motion.ts`:

```typescript
import type { Variants } from 'framer-motion';

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06 },
  },
};
```

- [ ] **Step 3: Wrap the app in MotionConfig**

In `dashboard/client/src/main.tsx`, import `MotionConfig` from `'framer-motion'` and wrap `<App />` with it (innermost, inside `BrowserRouter`):

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <MotionConfig reducedMotion="user">
            <App />
          </MotionConfig>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 4: Verify build**

Run: `cd dashboard/client && npm run build`
Expected: `tsc` and `vite build` both succeed with no errors.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/package.json dashboard/client/package-lock.json dashboard/client/src/lib/motion.ts dashboard/client/src/main.tsx
git commit -m "feat(dashboard): add framer-motion and shared motion config"
```

---

### Task 2: Layout.tsx — page transitions + ambient scroll parallax

**Files:**
- Create: `dashboard/client/src/lib/useParallax.ts`
- Modify: `dashboard/client/src/components/Layout.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 directly (uses `framer-motion` package directly).
- Produces: `useParallax(factor: number): number` hook — self-contained, not consumed elsewhere in this plan, but available for future pages.

- [ ] **Step 1: Create the parallax hook**

Create `dashboard/client/src/lib/useParallax.ts`:

```typescript
import { useEffect, useState } from 'react';

/**
 * Returns a translateY offset that grows as the page scrolls, scaled by `factor`.
 * Returns 0 (no motion) when the OS-level reduced-motion preference is set.
 */
export function useParallax(factor: number): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setOffset(window.scrollY * factor);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [factor]);

  return offset;
}
```

- [ ] **Step 2: Rewrite Layout.tsx with page transitions and parallax blobs**

Replace `dashboard/client/src/components/Layout.tsx`:

```typescript
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from './Sidebar';
import { useParallax } from '../lib/useParallax';

export default function Layout() {
  const location = useLocation();
  const blobOffsetA = useParallax(0.3);
  const blobOffsetB = useParallax(0.15);

  return (
    <div className="flex">
      <Sidebar />
      <main className="relative min-h-screen flex-1 overflow-hidden bg-base p-6">
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-gold/10 blur-3xl"
          style={{ transform: `translateY(${blobOffsetA}px)` }}
        />
        <div
          className="pointer-events-none absolute -right-32 top-64 h-[28rem] w-[28rem] rounded-full bg-cyan/10 blur-3xl"
          style={{ transform: `translateY(${blobOffsetB}px)` }}
        />
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd dashboard/client && npm run build`
Expected: clean `tsc` + `vite build`.

- [ ] **Step 4: Manual check**

Run: `cd dashboard/client && npm run dev`, open the dashboard, log in.
Expected: navigating between sidebar links fades/slides the page content; scrolling a tall page (e.g. Tareas) drifts the two background blobs at different speeds; enabling OS "reduce motion" and reloading stops the blobs from moving on scroll (page fade transition itself is still handled by `MotionConfig`, which downgrades it automatically).

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/lib/useParallax.ts dashboard/client/src/components/Layout.tsx
git commit -m "feat(dashboard): add page transitions and ambient scroll parallax to Layout"
```

---

### Task 3: Sidebar.tsx — animated active-link pill + hover nudge

**Files:**
- Modify: `dashboard/client/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `framer-motion` (`motion`, `layoutId`) directly, no shared module dependency.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rewrite Sidebar.tsx with an animated active pill**

Replace `dashboard/client/src/components/Sidebar.tsx`:

```typescript
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLogout } from '../api/hooks';

const links = [
  { to: '/', label: 'Resumen' },
  { to: '/tareas', label: 'Tareas' },
  { to: '/granjas', label: 'Granjas' },
  { to: '/jugadores', label: 'Jugadores' },
  { to: '/proyectos', label: 'Proyectos' },
  { to: '/galeria', label: 'Galería' },
  { to: '/mapa', label: 'Mapa' },
];

export default function Sidebar() {
  const logout = useLogout();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-52 flex-col border-r border-border bg-panel">
      <div className="px-4 py-5 font-mono text-lg text-gold">SlayCraft</div>
      <nav className="flex-1 space-y-1 px-2">
        {links.map((l) => {
          const isActive = l.to === '/' ? location.pathname === '/' : location.pathname.startsWith(l.to);
          return (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className="relative block">
              {isActive && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 rounded bg-base"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <motion.span
                whileHover={{ x: 2 }}
                className={`relative block rounded px-3 py-2 text-sm ${isActive ? 'text-gold' : 'text-slate-300 hover:bg-base'}`}
              >
                {l.label}
              </motion.span>
            </NavLink>
          );
        })}
      </nav>
      <button
        onClick={() => logout.mutate()}
        className="m-2 rounded px-3 py-2 text-left text-sm text-slate-400 hover:bg-base hover:text-slate-100"
      >
        Cerrar sesión
      </button>
    </aside>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd dashboard/client && npm run build`
Expected: clean `tsc` + `vite build`.

- [ ] **Step 3: Manual check**

Run: `cd dashboard/client && npm run dev`, click through sidebar links.
Expected: the highlighted background slides smoothly from the previous active link to the new one instead of snapping; hovering an inactive link nudges its text right by 2px.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/components/Sidebar.tsx
git commit -m "feat(dashboard): animate sidebar active-link pill and hover state"
```

---

### Task 4: Card.tsx — hover lift

**Files:**
- Modify: `dashboard/client/src/components/Card.tsx`

**Interfaces:**
- Consumes: `framer-motion` (`motion`) directly.
- Produces: `Card` keeps its existing public interface (`children`, `className` props) — all existing call sites across the app (Overview, Granjas, Jugadores, etc.) keep working unchanged since this is a drop-in internal change.

- [ ] **Step 1: Rewrite Card.tsx as a motion component**

Replace `dashboard/client/src/components/Card.tsx`:

```typescript
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -2, borderColor: '#e8b339' }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`rounded-lg border border-border bg-panel p-4 ${className}`}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd dashboard/client && npm run build`
Expected: clean `tsc` + `vite build`. `Card` is used across many pages (Overview, Granjas, GranjaDetail, Jugadores, Proyectos, etc.) — a clean build confirms none of those call sites break from the prop-interface staying identical.

- [ ] **Step 3: Manual check**

Run: `cd dashboard/client && npm run dev`, hover over any Card (e.g. an Overview stat tile).
Expected: card lifts slightly and its border tints gold on hover, springs back on mouse-leave.

- [ ] **Step 4: Commit**

```bash
git add dashboard/client/src/components/Card.tsx
git commit -m "feat(dashboard): add hover lift animation to Card"
```

---

### Task 5: Overview.tsx — staggered entrances + animated stat numbers

**Files:**
- Create: `dashboard/client/src/lib/useAnimatedNumber.ts`
- Modify: `dashboard/client/src/pages/Overview.tsx`

**Interfaces:**
- Consumes: `fadeUp`, `staggerContainer` from `src/lib/motion.ts` (Task 1).
- Produces: `useAnimatedNumber(target: number, duration?: number): number` hook — self-contained, only used in Overview.tsx in this plan.

- [ ] **Step 1: Create the animated-number hook**

Create `dashboard/client/src/lib/useAnimatedNumber.ts`:

```typescript
import { useEffect, useRef, useState } from 'react';

/**
 * Animates from the previous value to `target` over `duration` ms.
 * Renders `target` immediately (no animation) under reduced-motion.
 */
export function useAnimatedNumber(target: number, duration = 500): number {
  const [value, setValue] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      previous.current = target;
      return;
    }

    const from = previous.current;
    const delta = target - from;
    if (delta === 0) return;

    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(from + delta * progress);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previous.current = target;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
```

- [ ] **Step 2: Verify the hook compiles standalone**

Run: `cd dashboard/client && npx tsc --noEmit`
Expected: no type errors from the new file.

- [ ] **Step 3: Update Overview.tsx with stagger variants and animated numbers**

Replace `dashboard/client/src/pages/Overview.tsx`:

```typescript
// dashboard/client/src/pages/Overview.tsx
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTasks, useFarms, useLivePlayers, usePerformance } from '../api/hooks';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { fadeUp, staggerContainer } from '../lib/motion';
import { useAnimatedNumber } from '../lib/useAnimatedNumber';

export default function Overview() {
  const tasks = useTasks();
  const farms = useFarms();
  const livePlayers = useLivePlayers();
  const performance = usePerformance();

  const today = new Date().toISOString().slice(0, 10);
  const needsAttention = (tasks.data?.tasks ?? []).filter(
    (t) => t.status !== 'done' && (t.status === 'blocked' || t.priority === 'high' || (t.due_date && t.due_date < today))
  );

  const flaggedFarms = (farms.data?.farms ?? []).filter(
    (f) => f.occupantCount === 0 || f.storageItemCount > 0.9 * 2916 // 27 slots * 108 stack size heuristic; real capacity comes per-chest, this is a coarse "likely full" signal
  );
  const healthyFarmCount = (farms.data?.farms.length ?? 0) - flaggedFarms.length;

  const animatedTps = useAnimatedNumber(performance.data?.tps ?? 0);
  const animatedPlayers = useAnimatedNumber(livePlayers.data?.players.length ?? 0);
  const animatedHealthyFarms = useAnimatedNumber(healthyFarmCount);

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl text-gold">Resumen</h1>

      <motion.div
        className="grid grid-cols-3 gap-4"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={fadeUp}>
          <Card>
            <div className="text-sm text-slate-400">TPS del servidor</div>
            <div className={`font-mono text-3xl ${performance.data && performance.data.tps < 18 ? 'text-status-blocked' : 'text-status-done'}`}>
              {performance.data ? animatedTps.toFixed(1) : '—'}
            </div>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <div className="text-sm text-slate-400">Jugadores en línea</div>
            <div className="font-mono text-3xl text-cyan">{livePlayers.data ? Math.round(animatedPlayers) : '—'}</div>
          </Card>
        </motion.div>
        <motion.div variants={fadeUp}>
          <Card>
            <div className="text-sm text-slate-400">Granjas saludables</div>
            {farms.isError ? (
              <div className="font-mono text-3xl text-status-blocked">—</div>
            ) : (
              <div className="font-mono text-3xl text-status-done">{Math.round(animatedHealthyFarms)}</div>
            )}
          </Card>
        </motion.div>
      </motion.div>

      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">Tareas que necesitan atención</h2>
        {needsAttention.length === 0 ? (
          <p className="text-sm text-slate-500">No hay tareas urgentes. Bien ahí.</p>
        ) : (
          <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
            {needsAttention.slice(0, 5).map((t) => (
              <motion.div key={t.id} variants={fadeUp}>
                <Card className="flex items-center justify-between">
                  <span>{t.title}</span>
                  <StatusBadge status={t.status} />
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
        <Link to="/tareas" className="mt-2 inline-block text-sm text-cyan hover:underline">
          Ver todas las tareas →
        </Link>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-lg text-slate-200">Granjas que requieren revisión</h2>
        {farms.isError ? (
          <p className="text-sm text-status-blocked">No se pudo conectar con MCFarmManager.</p>
        ) : flaggedFarms.length === 0 ? (
          <p className="text-sm text-slate-500">Todas las granjas están al día.</p>
        ) : (
          <motion.div className="space-y-2" variants={staggerContainer} initial="hidden" animate="show">
            {flaggedFarms.map((f) => (
              <motion.div key={f.id} variants={fadeUp}>
                <Card className="flex items-center justify-between">
                  <span>{f.name}</span>
                  <StatusBadge status={f.occupantCount > 0 ? 'online' : 'offline'} />
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
        <Link to="/granjas" className="mt-2 inline-block text-sm text-cyan hover:underline">
          Ver todas las granjas →
        </Link>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd dashboard/client && npm run build`
Expected: clean `tsc` + `vite build`.

- [ ] **Step 5: Manual check**

Run: `cd dashboard/client && npm run dev`, open Overview (`/`).
Expected: on load, the three stat tiles and list rows fade/slide in staggered rather than all at once; the TPS/players/healthy-farms numbers count up from 0 to their real value; with OS "reduce motion" enabled, numbers appear at final value immediately with no stagger delay perceptible (fadeUp/staggerContainer still apply opacity/y via `motion.div`, which `MotionConfig` downgrades automatically).

- [ ] **Step 6: Commit**

```bash
git add dashboard/client/src/lib/useAnimatedNumber.ts dashboard/client/src/pages/Overview.tsx
git commit -m "feat(dashboard): add staggered entrances and animated stat numbers to Overview"
```

---

## Post-plan verification

- [ ] Run `cd dashboard/client && npm run build` once more after all 5 tasks to confirm the full sequence still builds clean together.
- [ ] Load the dashboard end-to-end (login → Overview → click through all sidebar links → scroll a long page) and confirm no console errors and no layout shift regressions on any page (Card's new hover/motion wrapper is used by Granjas, GranjaDetail, Jugadores, Proyectos, ProyectoDetail, Galeria, Tareas — all inherit the change).
