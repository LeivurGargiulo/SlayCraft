# Dashboard fixes batch — minors cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address every minor/deferred finding from the final whole-branch review of `docs/superpowers/plans/2026-08-01-dashboard-fixes-batch.md` (merged to main at `9fd23d9`). None of these block correctness — they're cosmetic tightening plus one real UX gap (manual flag is write-only).

**Source review findings (all Minor, none Critical/Important):**
1. `manual` flag is write-only in the UI — a farm marked manual silently drops off "Granjas que requieren revisión" with no visible indicator anywhere except re-opening the edit form.
2. `dashboard/client/src/api/client.ts:10` — `options.body !== undefined` would send the JSON content-type header on an explicit `body: null` (no live call site does this today, but `!= null` is the same length and closes the gap).
3. `dashboard/server/test/farms.test.ts` — `.get('iron') as any` could be a tighter `{ manual: number }` cast.
4. Plan checkboxes in `2026-08-01-dashboard-fixes-batch.md` are unticked despite the work being merged.

**Tech Stack:** Fastify, better-sqlite3, React, Tailwind — same as the parent batch. No new dependencies.

## Global Constraints

- Spanish UI copy throughout — no English strings added to user-facing text.
- No client test framework exists — client-only changes verified by `npm run build` plus real browser verification (dev server + Playwright, since `chromium-cli` was unavailable last session — reuse that pattern: `npm install playwright` in a scratch dir, `chromium.launch({ args: ['--no-sandbox'] })`).
- Run `npm test` in `dashboard/server` after the server-touching task; run `npm run build` in `dashboard/client` after each client-touching task.

---

### Task 1: Surface `manual` as a read-only badge

**Files:**
- Modify: `dashboard/client/src/pages/Granjas.tsx:64-67` (card header)
- Modify: `dashboard/client/src/pages/GranjaDetail.tsx` (wherever `StatusBadge`/header renders for the farm — near the online/offline badge)

**Why:** Overview already treats `manual` farms as healthy even when offline (`Overview.tsx` flaggedFarms filter, from the parent batch). Without a visible marker, a genuinely dead manual farm looks fine everywhere — the only way to discover it's "manual" is to click Editar.

- [ ] **Step 1: Add a small "Manual" tag next to the online/offline `StatusBadge` on the Granjas list card**

In `dashboard/client/src/pages/Granjas.tsx`, inside the card header block (around line 64-67), when `f.metadata.manual` is true, render a small badge/tag beside `StatusBadge`. Match the existing tag style used for `f.metadata.tags` a few lines below (`rounded bg-base px-2 py-0.5 text-xs text-cyan`) or introduce a visually distinct but consistent style — reuse `StatusBadge`'s pattern if it already supports a neutral/manual variant; otherwise a plain `<span>` is fine. Label text: "Manual".

- [ ] **Step 2: Add the same indicator to `GranjaDetail.tsx`'s header**

Find where the detail page renders the farm name + online/offline badge (likely near the top of the page, similar structure to the list card). Add the same "Manual" tag there when `f.metadata.manual` is true, so it's visible without opening the edit form.

- [ ] **Step 3: Build**

Run: `cd dashboard/client && npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual verification**

Start the dev stack (server + client, or point client at a running server — see the parent plan's Task 4/7 verification notes for the vite.config.ts proxy-port workaround if port 3001 is occupied by the live stack). Toggle a farm's manual flag on in GranjaDetail, save, confirm the badge appears on both GranjaDetail and the Granjas list card. Toggle off, confirm it disappears from both.

- [ ] **Step 5: Commit**

```bash
git add dashboard/client/src/pages/Granjas.tsx dashboard/client/src/pages/GranjaDetail.tsx
git commit -m "feat(dashboard): show read-only Manual badge on farm cards"
```

---

### Task 2: Tighten `apiFetch`'s null-body edge case

**Files:**
- Modify: `dashboard/client/src/api/client.ts:10`

- [ ] **Step 1: Change the condition**

Change:
```ts
const needsJsonHeader = !isFormData && options.body !== undefined;
```
to:
```ts
const needsJsonHeader = !isFormData && options.body != null;
```
(Intentional loose `!=` — catches both `undefined` and `null` in one check, matching how `fetch` itself treats a `null` body as bodyless.)

- [ ] **Step 2: Build**

Run: `cd dashboard/client && npm run build`
Expected: no TypeScript errors. No call site in `hooks.ts` currently passes `body: null`, so this is a no-behavior-change-today tightening — confirm with `grep -n "apiFetch(" dashboard/client/src/api/hooks.ts` that no call site regresses.

- [ ] **Step 3: Commit**

```bash
git add dashboard/client/src/api/client.ts
git commit -m "fix(dashboard): treat null body as bodyless in apiFetch header logic"
```

---

### Task 3: Tighten the `as any` cast in farms.test.ts

**Files:**
- Modify: `dashboard/server/test/farms.test.ts` (the `.get('iron') as any` line added in the parent batch's Task 2)

- [ ] **Step 1: Replace the cast**

Find:
```ts
const row = db.prepare('SELECT manual FROM farm_metadata WHERE farm_id = ?').get('iron') as any;
```
Replace with:
```ts
const row = db.prepare('SELECT manual FROM farm_metadata WHERE farm_id = ?').get('iron') as { manual: number };
```

- [ ] **Step 2: Run tests**

Run: `cd dashboard/server && npm test`
Expected: PASS, full suite green (39/39 or higher if Task 1/2 above added none — this task touches only a type annotation, no runtime change).

- [ ] **Step 3: Commit**

```bash
git add dashboard/server/test/farms.test.ts
git commit -m "chore(dashboard): tighten test type cast for farm_metadata.manual row"
```

---

### Task 4: Tick the parent plan's checkboxes

**Files:**
- Modify: `docs/superpowers/plans/2026-08-01-dashboard-fixes-batch.md`

- [ ] **Step 1: Mark all checkboxes complete**

The parent plan (`2026-08-01-dashboard-fixes-batch.md`) shipped and merged to main at `9fd23d9` but its `- [ ]` checkboxes were never ticked. Change every `- [ ]` to `- [x]` in that file (all 7 tasks' steps).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-08-01-dashboard-fixes-batch.md
git commit -m "docs: tick completed checkboxes in dashboard-fixes-batch plan"
```

---

## Self-Review Notes

- Task 1 is the only finding with real operational consequence (silent Overview suppression); Tasks 2-4 are pure polish.
- Tasks 2, 3, 4 are independent of each other and of Task 1 — can run in any order or in parallel via superpowers:dispatching-parallel-agents if desired, though the batch is small enough that sequential subagent-driven-development is simplest.
- No schema/API changes — `manual` already exists end-to-end from the parent batch; this plan only adds a UI badge and tightens two loose ends.
