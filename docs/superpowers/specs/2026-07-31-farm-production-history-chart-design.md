# Farm production rate history chart

Replaces the "Historial (24h)" card on `GranjaDetail.tsx` (currently just shows a sample count) with an actual chart of storage-count history per item type. Builds on Batch C (production rate + status indicator, `2026-07-31-batch-c-production-rate-design.md`), which already computes a point-in-time rate but has no time-series visualization.

## Design decisions

- **What's plotted**: raw `storageCounts[itemId]` over time, one line per item present in the range's samples — not a derived rate series. The slope of the count line already communicates production rate visually; a second derived-rate series would be redundant.
- **Range selector**: 1h / 24h / 7d, backed by the existing `GET /farms/:id/history?range=` endpoint. Confirmed the mod's `MCFarmManagerHttpServer.rangeSinceMillis` (`MCFarmManager/mod/src/main/java/net/mcfarmmanager/mod/http/MCFarmManagerHttpServer.java:345-348`) already switches on `1h`/`24h`/`7d` — zero mod or server changes needed, purely a client-side range param swap on the existing `useFarmHistory(id, range)` hook.
- **Library**: `recharts` (new client dependency). Only non-trivial part is axes/tooltips/legend with a dark theme; hand-rolled SVG would reinvent that for no benefit.
- **Component boundary**: new `client/src/components/HistoryChart.tsx`, presentational only — takes `samples: FarmHistorySample[]` and renders a `LineChart`. No data fetching or state inside it; `GranjaDetail.tsx` owns the range `useState` and the `useFarmHistory` call, same pattern already used for `expectedRates`/`config` state on that page.

## 1. Range state

`GranjaDetail.tsx` adds `const [historyRange, setHistoryRange] = useState<'1h' | '24h' | '7d'>('24h')`, replaces the fixed `useFarmHistory(id!, '24h')` call with `useFarmHistory(id!, historyRange)`. A `Select` (existing component, already used for dimension picker) above the chart lets the user switch ranges; changing it just re-keys the query via the hook's existing React Query key on `range`.

## 2. HistoryChart component

```
HistoryChart({ samples }: { samples: FarmHistorySample[] })
```

- Derives the set of `itemId`s across all samples (union, same approach as `computeRates`).
- Reshapes samples into Recharts' row-per-point format: `{ sampledAt, [itemId]: count, ... }`.
- One `<Line>` per itemId, X axis = `sampledAt` (formatted HH:mm for 1h/24h, day+HH:mm for 7d), Y axis = count.
- Dark theme: axis/grid/tooltip colors pulled from the same Tailwind slate/status tokens already used elsewhere on this page (no new colors introduced).
- Legend labels strip the `minecraft:` prefix, matching the existing `itemId.replace(/^minecraft:/, '')` convention in the Producción card.
- Empty/insufficient data (`samples.length === 0`): render the existing "Sin datos históricos todavía." message instead of an empty chart — same fallback text the card already uses.

## Non-goals

- No derived-rate line series (redundant with the raw-count slope; rate number already lives in the Producción card above it).
- No new mod or server endpoints — range switching is a pre-existing capability the dashboard just wasn't using.
- No zoom/brush/pan interaction — three fixed ranges cover the need; add interactive zoom only if a future range like "custom" is requested.

## Files touched

- `client/package.json` — add `recharts`
- `client/src/components/HistoryChart.tsx` — new presentational chart component
- `client/src/pages/GranjaDetail.tsx` — add `historyRange` state + `Select`, swap the fixed `useFarmHistory(id!, '24h')` for the stateful range, replace the "Historial (24h)" card body with `<HistoryChart samples={history.data.samples} />`

## Testing

No client test framework in this repo (consistent with Batches A/B/C — manual verification only). Manual check: farm with ≥2 samples across at least two of the three ranges, confirm lines render with correct item labels and counts match the raw API response; switch ranges and confirm the chart re-fetches and re-renders; farm with zero samples in a range shows the fallback text, not a broken/empty chart.
