# Dashboard fixes batch — design

Six small, independent fixes to the client dashboard (`dashboard/client`, `dashboard/server`).

## 1. Overview — only Alta tasks in "Tareas que necesitan atención"

`dashboard/client/src/pages/Overview.tsx`: `needsAttention` currently includes blocked tasks and overdue tasks in addition to high priority. Change filter to only:

```ts
const needsAttention = (tasks.data?.tasks ?? []).filter(
  (t) => t.status !== 'done' && t.priority === 'high'
);
```

Drop the `blocked` / `due_date` conditions. Keep the existing `slice(0, 5)` display cap.

## 2. Granjas manual toggle for "requieren revisión"

`f.online` on `FarmSummary` is actually server-computed "is producing" (storage counts grew in the last 15 min — see `isProducing` in `farms.ts`), not literal connectivity. Some farms are manual/not run 24/7, so "not producing" alone shouldn't flag them.

- **Schema** (`server/src/schema.sql`): add `manual INTEGER NOT NULL DEFAULT 0` to `farm_metadata`.
- **Server** (`routes/farms.ts`): `getMetadata` returns `manual: boolean`; the config PUT handler's zod schema and upsert accept/store `manual`.
- **Client types** (`api/types.ts`): `FarmSummary.metadata` gains `manual: boolean`.
- **GranjaDetail config form**: add a checkbox "Granja manual (no 24/7)" bound to `config.manual`, saved with the rest of the config.
- **Overview.tsx** flaggedFarms:
  ```ts
  const flaggedFarms = (farms.data?.farms ?? []).filter(
    (f) =>
      (!f.metadata.manual && !f.online) ||
      (f.storageCapacity > 0 && f.storageItemCount > 0.9 * f.storageCapacity)
  );
  ```
  Manual farms are only skipped for the not-producing check; storage-near-full still flags them.

## 3. Card hover glow stuck on

Root cause: `components/Card.tsx` already animates border color via framer-motion `whileHover` (correctly reverts on pointer-leave). `Granjas.tsx` and `Proyectos.tsx` additionally pass a Tailwind `hover:border-gold` className onto the same `Card`, a second, competing hover mechanism. The two fight on settle, leaving the border visually stuck gold after the framer animation reverts and the class-based style doesn't clear as expected.

Fix: remove the redundant `hover:border-gold` from the `className` prop in both `Granjas.tsx` and `Proyectos.tsx` card usages. Card's own `whileHover` remains the sole hover mechanism.

## 4. Granja profile photo

Infra already exists: `farm_images` table, upload route, and `GranjaDetail.tsx` gallery UI. `GET /api/farms` list response already includes `images: FarmImage[]` per farm.

`Granjas.tsx` card gains a cover image, mirroring `Proyectos.tsx`:
```tsx
{f.images[0] ? (
  <img src={`/uploads/${f.images[0].path}`} alt={f.name} className="mb-2 h-32 w-full rounded object-cover" />
) : (
  <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-base text-slate-600">Sin imagen</div>
)}
```
No backend changes needed for this item.

## 5. Jugadores — no duplicate between "En línea" and actividad sections

`byActividad` currently returns all players in that actividad regardless of live status, so an online player appears both under "En línea" and again under their actividad section. Fix: exclude live players from actividad sections.

```ts
const byActividad = (actividad: Actividad) =>
  allPlayers
    .filter((p) => p.actividad === actividad && !liveNames.has(p.minecraft_name))
    .sort((a, b) => a.minecraft_name.localeCompare(b.minecraft_name));
```

Each player now appears exactly once. Category counts (`items.length`) reflect the post-filter count.

## 6. Logout button not working

Server-side auth (`routes/auth.ts`, `app.ts` preHandler) reads correctly on inspection — `/api/logout` clears the session cookie and destroys the server-side session; `/api/me` is behind the auth preHandler so it should 401 after logout. Symptom reported: clicking "Cerrar sesión" does nothing visible.

No root cause confirmed yet — will be diagnosed live via the systematic-debugging skill during implementation (reproduce in browser devtools: confirm whether the `POST /api/logout` request fires, whether the cookie actually clears, whether the invalidated `['me']` query refetches and errors, whether `RequireAuth` re-renders). Fix scope: whatever the diagnosis shows — candidates include the click handler not firing, `invalidateQueries` not triggering a refetch of the mounted `useMe` query, or a stale cookie. Verify by clicking logout in a real browser and confirming redirect to `/login`.

## Testing

- Items 1, 2, 5: existing server/client test suites extended where logic changed (flaggedFarms filter, byActividad filter, needsAttention filter) — pure function-level assertions, no new frameworks.
- Item 2: server test for `manual` column persisting through config PUT/GET round-trip.
- Items 3, 4, 6: no meaningful unit test surface (visual/CSS, image rendering, auth flow) — verified manually in browser per project rule for UI changes.
