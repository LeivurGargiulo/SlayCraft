# Mineflayer LLM Agent — Design

## Goal

Replace the chat-command-driven flatten bot (`mineflayer/mineflayer-test/`) with a
fresh LLM-driven agent, focused on two task types: flattening regions and
building structures from schematics or procedural shape specs. The LLM plans
(picks a tool + arguments) once per job; everything after that is the same
deterministic compile-then-execute pipeline the existing flatten bot already
proved out. New project, does not touch or depend on `mineflayer-test/`.

## Non-goals

- No arbitrary code execution / sandboxed "newAction" style tool (mindcraft
  does this — explicit injection surface, not needed for this scope).
- No ReAct-style per-block LLM loop. LLM never reasons about individual block
  placement.
- No ported-in multi-agent support.
- No ".litematic"/".schem" write/export — read/place only.
- No ChatGPT/OpenAI-native provider — only Gemini and OpenRouter, per
  requirement. (OpenRouter proxies OpenAI-compatible models anyway.)

## Architecture

New directory: `mineflayer/mineflayer-agent/`.

```
mineflayer-agent/
  index.js                — bot lifecycle, reconnect, wiring (same shape as flatten bot's index.js)
  src/
    db.js                  — job queue (SQLite/better-sqlite3), crash-resume, same contract as today's db.js
    commands.js             — chat dispatch, whitelist/admin gate; `!agent <freeform task text>`
    llm/
      provider.js            — interface: plan(taskText, worldContext, toolSchemas) -> {tool, args} | {error}
      gemini.js               — Gemini adapter (native function-calling)
      openrouter.js            — OpenRouter adapter (OpenAI-compatible tools param)
    tools/
      index.js                — tool registry: name -> {description, argsSchema, compile(args, worldContext) -> action[]}
      flatten.js                — region flatten (port of flattenCompiler.js's logic)
      buildSchematic.js          — litematic/.schem placement (source path + origin + rotation)
      buildWall.js                — procedural: straight wall (length, height, block, orientation)
      buildBox.js                  — procedural: hollow/filled box (dimensions, block)
    schematics/
      schemLoader.js             — .schem -> Block[] via prismarine-schematic
      litematicLoader.js          — .litematic -> Block[], hand-rolled NBT unpack (no maintained JS lib exists)
    executionEngine.js          — ported as-is from flatten bot: runs action[] via pathfinder, progress, abort, crash-resume
```

## Data flow

1. Whitelisted user sends `!agent <freeform task text>` in chat.
2. `commands.js` inserts a `jobs` row: `{status: 'planning', taskText, requester}`. Immediate chat ack, no blocking on the LLM call.
3. Drain loop (same FIFO pattern as today) picks up `planning` jobs and calls `provider.plan(taskText, worldContext, toolSchemas)`. `worldContext` is small: bot position, inventory summary — no full chunk dump, to bound token cost.
4. LLM returns exactly one tool call: `{tool, args}`. Validated against the tool's `argsSchema`. Invalid args → re-prompt, max 2 retries, then job → `failed` with the reason chatted back to the requester.
5. The chosen tool's `compile(args, worldContext)` runs synchronously and deterministically, producing an `action[]` list — persisted on the job row. Job → `queued`.
6. Existing FIFO drain + `executionEngine.runJob` executes it: pathfinder movement, block break/place, progress pings every ~10s, crash-resume via `getInterruptedJobs()` on reconnect, `!agent stop`/`!agent cancel <id>` — unchanged from the current bot's proven behavior.

The LLM is invoked exactly once per job, before any block moves. Retries only re-run step 4, never re-touch execution.

## LLM interface

```js
// llm/provider.js contract
async function plan(taskText, worldContext, toolSchemas)
  -> { tool: string, args: object } | { error: string }
```

Both `gemini.js` and `openrouter.js` implement this contract against one
shared tool-schema source (JSON Schema, defined once per tool in the
registry) — each adapter translates that schema into its own native
function-calling format. Provider + model selected via env vars
(`LLM_PROVIDER=gemini|openrouter`, `LLM_MODEL=...`) — switching providers is
a config change, not a code change.

## Tool registry

`tools/index.js` is the single source of truth for both what's exposed to
the LLM as callable functions and what the planner dispatches to. Each entry:

```js
{
  name: 'build_wall',
  description: '...',
  argsSchema: { /* JSON Schema */ },
  compile(args, worldContext) -> action[]
}
```

Initial tool set: `flatten_region`, `build_schematic`, `build_wall`,
`build_box`. Adding a tool later (e.g. a future ReAct-fallback tool) means
adding one file here — no other component changes.

`argsSchema` rejects malformed args before `compile()` runs (e.g. `build_wall`
requires `length > 0` and a resolvable placeable block name).

## Schematic loading

- **`.schem` (Sponge)**: parsed via `prismarine-schematic` (existing npm
  package — not reimplemented). `schemLoader.js` wraps it, returns
  `Block[] {x, y, z, name}` relative to the schematic's own origin.
- **`.litematic`**: no maintained JS parser exists. `litematicLoader.js`
  hand-rolls it — gzip'd NBT (parsed via `prismarine-nbt`, already a
  mineflayer transitive dep) wrapping a bitpacked block-state array per
  region. Riskiest component in this design; gets its own fixture-based test
  file covering at least one multi-region `.litematic`.
- **Procedural** (`build_wall`, `build_box`): no loader — `compile()`
  generates `Block[]` directly from the shape spec. Cheapest path, covers
  most everyday asks.

All three converge on the same `Block[]` shape. `buildSchematic.js`'s
`compile()` is: load → translate to placement origin → rotate (0/90/180/270,
y-axis only) → hand off as the action list. One placement code path
regardless of source format.

## Safety

- No arbitrary code execution anywhere. LLM output is constrained to
  `{tool: <enum>, args: <schema-validated>}` — it never emits code or raw
  block lists.
- Whitelist/admin chat-command gating carried over unchanged from the
  current bot.
- `MAX_REGION_COLUMNS`-style bounds (from the current `flatten_region` tool)
  and equivalent size caps on `build_wall`/`build_box` prevent a single job
  from generating an unbounded action list that blocks the event loop or
  OOMs.

## Testing

- **Tools** (`flatten`, `buildSchematic`, `buildWall`, `buildBox`): pure
  unit tests on `compile()` — given args/worldContext, assert exact
  `action[]`. No mocks, no network. Same shape as today's
  `flattenCompiler.test.js`.
- **Schematic loaders**: fixture-based, small real `.schem`/`.litematic`
  files under `test/fixtures/`, asserting parsed `Block[]` against
  hand-verified expected output. `.litematic` gets extra multi-region
  fixtures given it's hand-rolled.
- **LLM provider adapters**: unit-test request/response shaping only
  (taskText+schemas → correct API payload; API response → correct
  `{tool,args}`). HTTP calls mocked — no live LLM API calls in tests. One
  parametrized suite run against both adapters, since they share an
  interface.
- **Planner/job state machine** (`planning → queued → running →
  done/failed`, retry-on-bad-args): unit-tested with a stub provider
  (canned responses), same pattern `executionEngine.test.js` already uses
  for stubbing the bot.
- **Execution engine**: ported as-is from the flatten bot; keep its existing
  test file and behavior (pathfinder timeout, real-inventory fill gating,
  block-tool equip fix, GoalPlaceBlock positioning — all already hardened
  there).
- No live-server integration tests in CI — manual verification against the
  real server, same as the current bot's hardening-checklist approach.
