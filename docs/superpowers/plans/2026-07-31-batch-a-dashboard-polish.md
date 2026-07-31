# Batch A Dashboard Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four dashboard-only improvements — polling auto-refresh on remaining hooks, an embedded Dynamic Map page, an entity-type display card, and a reworked storage card (total + type breakdown + per-chest accordion) — with zero backend, schema, or MCFarmManager mod changes.

**Architecture:** All four items are pure `dashboard/client/` changes. Auto-refresh is a `refetchInterval` addition to existing `@tanstack/react-query` hooks. The map page is a new route wrapping a static `<iframe>`. Entity/storage displays are derived client-side from fields the `useFarm()` hook already returns (`FarmDetail.entities`, `FarmDetail.storage`) — no new API calls.

**Tech Stack:** React 18, TypeScript, `@tanstack/react-query`, React Router, Tailwind CSS, Vite. No test framework exists in `client/` — verification is `tsc` (via `npm run build`) plus manual browser checks, per task.

## Global Constraints

- No changes to `dashboard/server/` or `MCFarmManager/` in this plan — spec (`docs/superpowers/specs/2026-07-31-batch-a-dashboard-polish-design.md`) scopes this batch to dashboard-only, no mod rebuild.
- Strip the `minecraft:` namespace prefix from item/entity type IDs before display (spec: "strip `minecraft:` prefix for readability").
- Reuse existing visual patterns: `Card` component (`client/src/components/Card.tsx`) for card containers, existing empty-state copy style (e.g. "Sin trabajador asignado.") for empty states.
- Map iframe source is `http://localhost:25566` (confirmed live, no ops work needed).

---

### Task 1: Auto-refresh polling on remaining hooks

**Files:**
- Modify: `dashboard/client/src/api/hooks.ts:28-30` (`useTasks`), `:78-80` (`usePlayers`), `:116-121` (`useFarmHistory`), `:145-147` (`useProjects`), `:185-187` (`useGallery`)

**Interfaces:**
- Consumes: nothing new — these hooks already exist and are called from `Tareas.tsx`, `Jugadores.tsx`, `Proyectos.tsx`, `Galeria.tsx`, `GranjaDetail.tsx`.
- Produces: same hook signatures, unchanged return types — callers need no changes.

- [ ] **Step 1: Add `refetchInterval` to `useTasks`**

In `dashboard/client/src/api/hooks.ts`, change:

```typescript
export function useTasks() {
  return useQuery({ queryKey: ['tasks'], queryFn: () => apiFetch<{ tasks: Task[] }>('/tasks') });
}
```

to:

```typescript
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiFetch<{ tasks: Task[] }>('/tasks'),
    refetchInterval: 15_000,
  });
}
```

- [ ] **Step 2: Add `refetchInterval` to `usePlayers`**

Change:

```typescript
export function usePlayers() {
  return useQuery({ queryKey: ['players'], queryFn: () => apiFetch<{ players: Player[] }>('/players') });
}
```

to:

```typescript
export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: () => apiFetch<{ players: Player[] }>('/players'),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 3: Add `refetchInterval` to `useFarmHistory`**

Change:

```typescript
export function useFarmHistory(id: string, range: string) {
  return useQuery({
    queryKey: ['farms', id, 'history', range],
    queryFn: () => apiFetch<{ samples: FarmHistorySample[] }>(`/farms/${id}/history?range=${range}`),
  });
}
```

to:

```typescript
export function useFarmHistory(id: string, range: string) {
  return useQuery({
    queryKey: ['farms', id, 'history', range],
    queryFn: () => apiFetch<{ samples: FarmHistorySample[] }>(`/farms/${id}/history?range=${range}`),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 4: Add `refetchInterval` to `useProjects`**

Change:

```typescript
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: () => apiFetch<{ projects: Project[] }>('/projects') });
}
```

to:

```typescript
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: Project[] }>('/projects'),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 5: Add `refetchInterval` to `useGallery`**

Change:

```typescript
export function useGallery() {
  return useQuery({ queryKey: ['gallery'], queryFn: () => apiFetch<{ images: GalleryImage[] }>('/gallery') });
}
```

to:

```typescript
export function useGallery() {
  return useQuery({
    queryKey: ['gallery'],
    queryFn: () => apiFetch<{ images: GalleryImage[] }>('/gallery'),
    refetchInterval: 30_000,
  });
}
```

- [ ] **Step 6: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 7: Manual verification**

Start the stack (`docker compose up -d` from repo root, or `npm run dev` in `dashboard/client` against a running server). Open browser DevTools → Network tab, filter to `Fetch/XHR`. Visit `/tareas`, `/jugadores`, `/proyectos`, `/galeria`, and a farm detail page (`/granjas/:id`). Confirm each page issues a repeat request to its endpoint at roughly the configured interval (15s for tasks, 30s for players/projects/gallery/history) without user interaction.

- [ ] **Step 8: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/api/hooks.ts
git commit -m "dashboard: auto-refresh tasks, players, projects, gallery, farm history"
```

---

### Task 2: Embedded Dynamic Map page

**Files:**
- Create: `dashboard/client/src/pages/Mapa.tsx`
- Modify: `dashboard/client/src/App.tsx:1-32`
- Modify: `dashboard/client/src/components/Sidebar.tsx:4-11`

**Interfaces:**
- Consumes: nothing (static page, no hooks, no props).
- Produces: route `/mapa`, nav-visible page named "Mapa".

- [ ] **Step 1: Create the Mapa page**

Create `dashboard/client/src/pages/Mapa.tsx`:

```tsx
export default function Mapa() {
  return (
    <iframe
      src="http://localhost:25566"
      title="Mapa dinámico"
      className="h-[calc(100vh-3rem)] w-full rounded-lg border border-border"
    />
  );
}
```

(`h-[calc(100vh-3rem)]` accounts for the `Layout`'s `p-6` padding — `3rem` = `1.5rem` top + `1.5rem` bottom — so the iframe fills the viewport height without causing page scroll.)

- [ ] **Step 2: Register the route**

In `dashboard/client/src/App.tsx`, add the import:

```tsx
import Mapa from './pages/Mapa';
```

next to the other page imports (after `import Galeria from './pages/Galeria';`), and add the route inside the `<Route element={<Layout />}>` block, after the `/galeria` route:

```tsx
<Route path="/mapa" element={<Mapa />} />
```

- [ ] **Step 3: Add the nav link**

In `dashboard/client/src/components/Sidebar.tsx`, add to the `links` array (after the `/galeria` entry):

```tsx
{ to: '/mapa', label: 'Mapa' },
```

- [ ] **Step 4: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 5: Manual verification**

Start the stack. Log in, click "Mapa" in the sidebar. Confirm the nav item highlights as active, the iframe loads and renders the map UI, and it's interactive (pan/zoom) inside the frame.

- [ ] **Step 6: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/Mapa.tsx dashboard/client/src/App.tsx dashboard/client/src/components/Sidebar.tsx
git commit -m "dashboard: embed Dynamic Map as a new page"
```

---

### Task 3: Entity type display card

**Files:**
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx:70-79` (insert new card after the existing "Trabajador" card)

**Interfaces:**
- Consumes: `FarmDetail.entities: Array<{ id: string; type: string; customName: string | null; position: {...}; health: number }>` (already returned by `useFarm()`, defined in `dashboard/client/src/api/types.ts:59`).
- Produces: nothing consumed by later tasks — self-contained UI addition.

- [ ] **Step 1: Add the grouping helper and card**

In `dashboard/client/src/pages/GranjaDetail.tsx`, insert a new `<Card>` immediately after the closing `</Card>` of the "Trabajador" card (currently ending at line 79) and before the "Almacenamiento" `<Card>`:

```tsx
        <Card>
          <h2 className="mb-2 font-mono text-slate-200">Entidades</h2>
          {f.entities.length > 0 ? (
            <div className="space-y-1">
              {Object.entries(
                f.entities.reduce<Record<string, number>>((acc, e) => {
                  const type = e.type.replace(/^minecraft:/, '');
                  acc[type] = (acc[type] ?? 0) + 1;
                  return acc;
                }, {})
              ).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span>{type}</span>
                  <span className="font-mono text-slate-400">{count}x</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin entidades detectadas.</p>
          )}
        </Card>
```

Note this card goes inside the existing `<div className="grid grid-cols-2 gap-4">` wrapper alongside "Notas" and "Trabajador" — after this change that grid contains three cards ("Notas", "Trabajador", "Entidades"); confirm the grid still reads fine at `grid-cols-2` (third card wraps to a new row, consistent with how the existing two-card grid already behaves for the "Almacenamiento" full-width card below it, which sits outside this grid).

- [ ] **Step 2: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Manual verification**

Visit a farm detail page for a farm with known entities (place/spawn a couple of mobs within its `entityScanRadius` in-game first, or use the existing Iron Farm if it already has iron golems in range). Confirm the "Entidades" card shows grouped counts matching what's actually in the farm (e.g. `iron_golem` with the correct count, `minecraft:` prefix stripped). For a farm/state with zero entities in range, confirm "Sin entidades detectadas." renders.

- [ ] **Step 4: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "dashboard: show entity type counts on farm detail page"
```

---

### Task 4: Storage totals + type breakdown + per-chest accordion

**Files:**
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx` (replace the existing "Almacenamiento" card body, originally lines 82-94 — line numbers will have shifted after Task 3's insertion, locate by the `h2` text "Almacenamiento")

**Interfaces:**
- Consumes: `FarmDetail.storage: Array<{ id: string; label: string; position: {...}; capacity: number; items: Array<{ itemId: string; count: number }> }>` (already returned by `useFarm()`, `dashboard/client/src/api/types.ts:60`).
- Produces: nothing consumed by later tasks — this is the last task in the batch.

- [ ] **Step 1: Replace the Almacenamiento card body**

In `dashboard/client/src/pages/GranjaDetail.tsx`, find the "Almacenamiento" `<Card>` (currently):

```tsx
      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Almacenamiento</h2>
        <div className="space-y-1">
          {f.storage.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span>{s.label}</span>
              <span className="font-mono text-slate-400">
                {s.items.reduce((sum, i) => sum + i.count, 0)} / {s.capacity * 64}
              </span>
            </div>
          ))}
        </div>
      </Card>
```

Replace with:

```tsx
      <Card>
        <h2 className="mb-2 font-mono text-slate-200">Almacenamiento</h2>
        {(() => {
          const allItems = f.storage.flatMap((s) => s.items);
          const total = allItems.reduce((sum, i) => sum + i.count, 0);
          const byType = allItems.reduce<Record<string, number>>((acc, i) => {
            const type = i.itemId.replace(/^minecraft:/, '');
            acc[type] = (acc[type] ?? 0) + i.count;
            return acc;
          }, {});
          return (
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span className="font-mono text-slate-200">{total}</span>
              </div>
              {Object.keys(byType).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(byType).map(([type, count]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span>{type}</span>
                      <span className="font-mono text-slate-400">{count}x</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Sin ítems almacenados.</p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer text-cyan hover:underline">Por contenedor</summary>
                <div className="mt-2 space-y-1">
                  {f.storage.map((s) => (
                    <div key={s.id} className="flex justify-between">
                      <span>{s.label}</span>
                      <span className="font-mono text-slate-400">
                        {s.items.reduce((sum, i) => sum + i.count, 0)} / {s.capacity * 64}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          );
        })()}
      </Card>
```

- [ ] **Step 2: Type-check**

Run: `cd dashboard/client && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Manual verification**

Visit a farm detail page for a farm with items in its configured chests. Confirm: the "Total" row matches the sum you'd get by manually counting all items across all configured chests in-game; the type breakdown lists each distinct item with its summed count across all chests; clicking "Por contenedor" expands to show the original per-chest `count / capacity*64` rows (same numbers as before this change — regression check against the pre-Task-4 behavior).

- [ ] **Step 4: Commit**

```bash
cd /home/leivur/minecraft
git add dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "dashboard: farm storage total, item-type breakdown, per-chest accordion"
```
