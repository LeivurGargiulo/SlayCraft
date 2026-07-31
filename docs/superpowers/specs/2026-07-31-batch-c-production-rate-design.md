# Batch C: production rate + status indicator

Part of the 11-item feature request tracked in `dashboard/docs/FEATURE_FEASIBILITY.md`. Covers item 5 only (production rate per minute/hour/day + normal/low/none status indicator). Follows Batch A (dashboard polish) and Batch B (data model additions). Like Batch B, this batch adds a schema column but requires zero MCFarmManager mod changes — it computes rates client-side from history data the mod already produces.

## Design decisions locked in during brainstorming

- **Computation: entirely client-side**, over the existing `GET /farms/:id/history` endpoint (`FarmHistorySample[]`, already returns `storageCounts: Record<itemId, count>` sampled every 5 minutes by default via the mod's `FarmSampler`). No new mod sampling, no new server-side aggregation endpoint.
- **Rate granularity: per item-type**, not one aggregate number per farm — matches item 4b's "show item type, not just count." A farm producing multiple item types (e.g. iron + gold) gets a separate rate for each.
- **"Per minute" is a derived unit, not live per-minute counting** — the underlying data point is still the 5-minute (configurable) sample interval; minute/hour/day are three ways of expressing the same measured rate, not three independent measurements.
- **Baseline: full per-item-type expected-rate map**, not a single "primary product" number. Stored in a new dashboard-local `farm_metadata.expected_rates` column (JSON) rather than waiting on Batch D's full farm-config CRUD — this keeps Batch C shippable independently of Batch D, and the same field can later be superseded or migrated into mod-side config once Batch D lands.
- **Status thresholds**: ≥90% of expected = normal (green), 10–90% = low (amber), ≤10% or no samples in the window = not producing (red). No entry in `expected_rates` for an item = no color judgment (gray), rate number still shown. Window: most recent 1 hour of samples.

## 1. Rate computation

For each `itemId` appearing in the farm's history samples (`useFarmHistory(id, '1h')` — note: switches the existing `GranjaDetail.tsx` history call to a 1-hour range for this purpose, since that's also the status-judgment window):

- `rate = max(0, latestCount - earliestCount) / elapsedMinutes` — clamped at zero because a container being emptied by a player produces a legitimate negative delta that isn't "negative production."
- If the most recent delta between two consecutive samples is negative (a drop happened), flag it separately (e.g. "vaciado recientemente") rather than folding it into the rate number, so a chest-empty event doesn't read as "this farm suddenly stopped producing."
- Display all three units (per-minute, per-hour, per-day) as `rate`, `rate * 60`, `rate * 1440` — same underlying number, not separate computations.
- Requires at least 2 samples in the window to compute anything; fewer than 2 samples renders "Datos insuficientes" instead of a rate.

## 2. Expected-rate baseline storage

```sql
ALTER TABLE farm_metadata ADD COLUMN IF NOT EXISTS expected_rates TEXT;
```

JSON-encoded map, e.g. `{"iron_ingot": 120, "gold_nugget": 40}` (units/hour). Read/written through the existing `farm_metadata` PATCH route (`PATCH /api/farms/:id/metadata`, `server/src/routes/farms.ts`) — extends the existing `metadataSchema` Zod object with an optional `expected_rates: Record<string, number>` field, serialized to/from the JSON text column the same way `tags` is already serialized to/from a comma-joined string.

UI: new editable section on `GranjaDetail.tsx`, reusing the existing notes/tags edit-toggle pattern already on that page — an add/remove-row list where each row is an item-type text input + expected-rate number input.

## 3. Status indicator

Computed client-side, per item type, comparing the 1-hour rate (section 1) against `expected_rates[itemId]` (section 2):

| Condition | Status | Color |
|---|---|---|
| No entry in `expected_rates` for this item | No judgment | gray |
| actual ≥ 90% of expected | Normal | green (`status.done`) |
| 10% ≤ actual < 90% of expected | Low | amber (`status.progress`) |
| actual < 10% of expected, or zero samples in the last hour | Not producing | red (`status.blocked`) |

Reuses the existing `status.done`/`status.progress`/`status.blocked` Tailwind tokens already used by `StatusBadge` and (per Batch B) `PriorityBadge` — no new colors.

## Non-goals (explicitly deferred)

- Server-side rate computation or a new aggregation endpoint — rejected in favor of client-side arithmetic over already-available history data (no mod changes needed).
- Single "primary product" baseline — rejected in favor of the full per-item-type map (previous decision superseded during brainstorming).
- True per-minute live sampling — the mod's sample interval (5 min default, `mcfarmmanagerSampleIntervalMinutes` Carpet rule) is unchanged by this batch; "per minute" is a unit conversion of the measured rate, not a claim of minute-level precision.
- Migrating `expected_rates` into MCFarmManager mod config — this stays a dashboard-local overlay for now, same relationship `farm_metadata.notes`/`tags` already have to the live-sourced farm data. Batch D's farm-config CRUD, if it ever needs to own this field, is a separate future decision.

## Files touched

- `server/src/schema.sql` — `ALTER TABLE farm_metadata ADD COLUMN expected_rates TEXT`
- `server/src/routes/farms.ts` — extend `metadataSchema`, JSON encode/decode `expected_rates` in `getMetadata()`/the PATCH handler
- `client/src/api/types.ts` — `FarmSummary.metadata` gains `expected_rates: Record<string, number>`
- `client/src/api/hooks.ts` — `useUpdateFarmMetadata` mutation payload gains `expected_rates`
- `client/src/pages/GranjaDetail.tsx` — new "Producción" card (rate + status per item type), expected-rate map editor added to the existing metadata edit section

## Testing

Server: extend the existing `farms.test.ts` PATCH-metadata test to round-trip an `expected_rates` map. Client: manual verification, consistent with Batches A/B (no client test framework) — feed a farm with at least two history samples showing storage growth, confirm the rate numbers and status color match manual calculation; set an expected rate below/above the actual rate and confirm the color flips accordingly; confirm an item with no baseline set shows a rate with no color judgment.
