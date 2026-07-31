# Farm Production History Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder "Historial (24h)" card on `GranjaDetail.tsx` with a real chart of storage-count history per item type, with a 1h/24h/7d range selector.

**Architecture:** A new presentational `HistoryChart` component renders a Recharts `LineChart` (one line per `itemId`) from `FarmHistorySample[]`. `GranjaDetail.tsx` owns range state and feeds it to the already-existing `useFarmHistory(id, range)` hook — the mod's history endpoint already supports all three ranges, so no mod or server changes.

**Tech Stack:** React + TypeScript + Vite (existing client), `recharts` (new dependency), Tailwind dark theme tokens already in the codebase.

## Global Constraints

- No mod or server changes — `GET /farms/:id/history?range=` already supports `1h`/`24h`/`7d` (`MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java:345-348`).
- No new colors — reuse existing Tailwind slate/status/gold tokens already used elsewhere in `GranjaDetail.tsx` and `Card.tsx`.
- No client test framework in this repo — verification is `npm run build` (tsc + vite build catches type errors) plus manual browser QA, consistent with Batches A/B/C.
- Item labels strip the `minecraft:` prefix everywhere, matching the existing `itemId.replace(/^minecraft:/, '')` convention already used in the Producción card (`client/src/pages/GranjaDetail.tsx:375`).

---

### Task 1: Add recharts dependency

**Files:**
- Modify: `dashboard/client/package.json`

**Interfaces:**
- Produces: `recharts` package available for import in `client/src/components/HistoryChart.tsx` (Task 2).

- [ ] **Step 1: Install the package**

Run from `dashboard/client/`:
```bash
npm install recharts
```
This updates `package.json` (`dependencies`) and `package-lock.json` automatically — do not hand-edit the version string.

- [ ] **Step 2: Verify it resolves**

Run: `npm ls recharts`
Expected: prints the installed version with no `UNMET DEPENDENCY` error.

- [ ] **Step 3: Commit**

```bash
git add dashboard/client/package.json dashboard/client/package-lock.json
git commit -m "chore(dashboard): add recharts for history chart"
```

---

### Task 2: HistoryChart component

**Files:**
- Create: `dashboard/client/src/components/HistoryChart.tsx`

**Interfaces:**
- Consumes: `FarmHistorySample` type from `client/src/api/types.ts:94-98` — shape `{ sampledAt: string; entityCounts: Record<string, number>; storageCounts: Record<string, number> }`.
- Produces: `export default function HistoryChart({ samples }: { samples: FarmHistorySample[] }): JSX.Element` — used by `GranjaDetail.tsx` in Task 3.

- [ ] **Step 1: Write the component**

```tsx
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { FarmHistorySample } from '../api/types';

const LINE_COLORS = ['#e8b339', '#4ade80', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa'];

function formatTick(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HistoryChart({ samples }: { samples: FarmHistorySample[] }) {
  if (samples.length === 0) {
    return <p className="text-sm text-slate-500">Sin datos históricos todavía.</p>;
  }

  const itemIds = Array.from(new Set(samples.flatMap((s) => Object.keys(s.storageCounts)))).sort();
  const rows = samples.map((s) => ({
    sampledAt: s.sampledAt,
    ...Object.fromEntries(itemIds.map((id) => [id, s.storageCounts[id] ?? 0])),
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
        <XAxis dataKey="sampledAt" tickFormatter={formatTick} stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} />
        <Tooltip
          labelFormatter={(v) => new Date(v as string).toLocaleString()}
          formatter={(value: number, name: string) => [value, name.replace(/^minecraft:/, '')]}
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6 }}
          labelStyle={{ color: '#e2e8f0' }}
        />
        <Legend formatter={(name: string) => name.replace(/^minecraft:/, '')} />
        {itemIds.map((id, i) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            name={id}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            dot={false}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run from `dashboard/client/`: `npx tsc --noEmit`
Expected: no errors referencing `HistoryChart.tsx`.

- [ ] **Step 3: Commit**

```bash
git add dashboard/client/src/components/HistoryChart.tsx
git commit -m "feat(dashboard): add HistoryChart component"
```

---

### Task 3: Wire range selector + chart into GranjaDetail

**Files:**
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx:1-19` (imports), `:88-99` (state/hooks), `:389-396` (the "Historial (24h)" card)

**Interfaces:**
- Consumes: `HistoryChart` from Task 2 (`../components/HistoryChart`), `Select`/`SelectOption` from `./Select` (already imported pattern: `client/src/pages/GranjaDetail.tsx:18`, used for `DIMENSIONS` at `:21-25`), `useFarmHistory(id, range)` from `../api/hooks` (already imported at `:5`).
- Produces: no new exports — this is the page's own state.

- [ ] **Step 1: Add the range option list and state**

Add near the top of `GranjaDetail.tsx`, alongside the existing `DIMENSIONS` constant (`:21-25`):

```tsx
const HISTORY_RANGES: SelectOption<'1h' | '24h' | '7d'>[] = [
  { value: '1h', label: '1 hora' },
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 días' },
];
```

This needs `SelectOption` imported — add it to the existing Select import line: `import Select, { type SelectOption } from '../components/Select';` (replacing the current `import Select from '../components/Select';` at `:18`).

Also add the new component import: `import HistoryChart from '../components/HistoryChart';`

- [ ] **Step 2: Replace the fixed history hook call with stateful range**

In the component body (`:88-99`), replace:

```tsx
const history = useFarmHistory(id!, '24h');
```

with:

```tsx
const [historyRange, setHistoryRange] = useState<'1h' | '24h' | '7d'>('24h');
const history = useFarmHistory(id!, historyRange);
```

(`useState` is already imported at `:1`.)

- [ ] **Step 3: Replace the "Historial (24h)" card body**

Replace the card currently at `:389-396`:

```tsx
<Card>
  <h2 className="mb-2 font-mono text-slate-200">Historial (24h)</h2>
  {history.data && history.data.samples.length > 0 ? (
    <p className="text-sm text-slate-400">{history.data.samples.length} muestras registradas.</p>
  ) : (
    <p className="text-sm text-slate-500">Sin datos históricos todavía.</p>
  )}
</Card>
```

with:

```tsx
<Card>
  <div className="mb-2 flex items-center justify-between">
    <h2 className="font-mono text-slate-200">Historial</h2>
    <Select value={historyRange} onChange={setHistoryRange} options={HISTORY_RANGES} className="w-32" />
  </div>
  {history.data ? <HistoryChart samples={history.data.samples} /> : <p className="text-sm text-slate-500">Cargando…</p>}
</Card>
```

(`HistoryChart` itself already renders the "Sin datos históricos todavía." fallback when `samples.length === 0`, per Task 2 — no duplicate fallback needed here.)

- [ ] **Step 4: Typecheck + build**

Run from `dashboard/client/`: `npm run build`
Expected: exits 0, no TypeScript errors in `GranjaDetail.tsx` or `HistoryChart.tsx`.

- [ ] **Step 5: Manual verification**

Start the dev stack (or use the running Docker deployment) and open a farm detail page with ≥2 history samples:
- Confirm the "Historial" card shows a line chart, not the old sample-count text.
- Switch the range selector between 1 hora / 24 horas / 7 días — confirm the chart re-fetches and re-renders for each.
- Confirm legend and tooltip item names have no `minecraft:` prefix.
- Open a farm with zero history samples — confirm it shows "Sin datos históricos todavía." instead of a broken/empty chart.

- [ ] **Step 6: Commit**

```bash
git add dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "feat(dashboard): add range-selectable production history chart"
```

---

## Post-plan

After Task 3 is verified, this branch is ready to merge per `superpowers:finishing-a-development-branch`.
