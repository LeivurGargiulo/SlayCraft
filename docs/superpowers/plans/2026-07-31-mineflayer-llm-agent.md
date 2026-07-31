# Mineflayer LLM Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new LLM-driven mineflayer agent (`mineflayer/mineflayer-agent/`) that plans flatten/schematic/procedural-build jobs from freeform chat requests via one LLM tool-call per job, then executes them through the same deterministic compile-then-execute pipeline the existing flatten bot already proved out, per `docs/superpowers/specs/2026-07-31-mineflayer-llm-agent-design.md`.

**Architecture:** `db.js` (JobManager over `better-sqlite3`, job states `planning → queued → running → completed/failed/cancelled`) ← `tools/index.js` (registry: name → argsSchema + `compile(args, worldContext) → action[]`) ← `llm/provider.js` (Gemini/OpenRouter adapters, both implement `plan(taskText, worldContext, toolSchemas)`) ← `commands.js` (chat dispatch, whitelist/admin) ← `index.js` (bot lifecycle, two-stage drain loop: plan queued `planning` jobs, then execute queued `queued` jobs via `executionEngine.js`, ported as-is from the existing flatten bot).

**Tech Stack:** Node.js (repo has v24), `mineflayer` + `mineflayer-pathfinder` (existing), `better-sqlite3`, `vec3`, `prismarine-schematic` (`.schem` parsing), `prismarine-nbt` (already a mineflayer transitive dep — `.litematic` hand-parsing), `ajv` (JSON-Schema validation of LLM tool args), `@google/genai` (Gemini adapter), `openai` SDK pointed at OpenRouter's base URL (OpenRouter is OpenAI-compatible — no separate SDK needed). Tests use Node's built-in `node:test`/`assert`, no new test-framework dependency, matching the existing flatten bot's convention.

## Global Constraints

- New project lives at `mineflayer/mineflayer-agent/`, does not modify or depend on `mineflayer/mineflayer-test/` (the existing flatten bot stays untouched as reference/fallback).
- No arbitrary code execution: the LLM only ever selects `{tool: <enum>, args: <schema-validated>}` — never emits code or raw block lists.
- No ReAct loop, no multi-agent, no schematic export — read/place schematics only.
- Every LLM-facing tool's `argsSchema` enforces a size/region cap so a single job can't generate an unbounded action list (mirrors `MAX_REGION_COLUMNS` in the existing bot).
- LLM is invoked at most 3 times per job (1 initial + 2 retries on schema-invalid args); after that the job goes to `failed` with the LLM's/validator's error message chatted back to the requester.
- Whitelist/admin chat-command gating carried over unchanged from the existing bot's pattern (`WHITELIST`/`ADMINS` sets, owner-or-admin cancel check).
- Provider + model selectable via env vars (`LLM_PROVIDER=gemini|openrouter`, `LLM_MODEL=...`, `GEMINI_API_KEY`/`OPENROUTER_API_KEY`) — switching is a config change, not a code change.
- No live-server integration tests in this plan; manual verification happens afterward against the real server, same as the existing bot's hardening-checklist approach.

---

## Task 1: Project scaffold + job data layer

**Files:**
- Create: `mineflayer/mineflayer-agent/package.json`
- Create: `mineflayer/mineflayer-agent/.gitignore`
- Create: `mineflayer/mineflayer-agent/src/db.js`
- Test: `mineflayer/mineflayer-agent/test/db.test.js`

**Interfaces:**
- Produces: `class JobManager` with methods used by every later task:
  - `constructor(dbPath)`
  - `insertPlanningJob(taskText, requestedBy) -> jobId` (status `'planning'`)
  - `getNextPlanningJob() -> jobRow | undefined`
  - `attachPlan(jobId, toolName, argsJson, actions)` — transactionally sets `tool_name`, `args_json`, inserts `job_actions` rows (same shape as existing bot's `enqueue`), sets status `'queued'`
  - `markJobStatus(jobId, status)`
  - `markPlanningFailed(jobId, error)` — sets status `'failed'`, stores `error` on the jobs row
  - `getStatus(jobId)`, `getQueue()`, `getNextQueuedJob()`, `markRunning(jobId)`, `markActionDone(jobId, seq)`, `markActionFailed(jobId, seq, error)`, `getPendingActions(jobId)`, `getInterruptedJobs()`, `cancel(jobId, requestedBy, isAdmin)`, `close()` — same contracts as `mineflayer/mineflayer-test/src/db.js`, ported.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "mineflayer-agent",
  "version": "1.0.0",
  "description": "LLM-driven mineflayer agent for flatten and schematic-building jobs",
  "main": "index.js",
  "scripts": {
    "test": "node --test"
  },
  "license": "ISC",
  "dependencies": {
    "@google/genai": "^2.15.0",
    "ajv": "^8.20.0",
    "better-sqlite3": "^13.0.2",
    "mineflayer": "^4.37.1",
    "mineflayer-pathfinder": "^2.4.5",
    "openai": "^7.3.0",
    "prismarine-nbt": "^2.8.0",
    "prismarine-schematic": "^1.3.0",
    "vec3": "^0.2.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
*.db
*.db-shm
*.db-wal
.env
```

- [ ] **Step 3: Install dependencies**

Run: `cd mineflayer/mineflayer-agent && npm install`
Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 4: Write the failing test for job insertion + planning pickup**

```js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const JobManager = require('../src/db');

function tmpDbPath() {
  return path.join(__dirname, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function cleanup(dbPath) {
  for (const suffix of ['', '-shm', '-wal']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

test('insertPlanningJob creates a job in planning status, returned by getNextPlanningJob', () => {
  const dbPath = tmpDbPath();
  const jm = new JobManager(dbPath);
  try {
    const jobId = jm.insertPlanningJob('build a stone wall', 'alice');
    const job = jm.getNextPlanningJob();
    assert.strictEqual(job.id, jobId);
    assert.strictEqual(job.status, 'planning');
    assert.strictEqual(job.task_text, 'build a stone wall');
    assert.strictEqual(job.requested_by, 'alice');
  } finally {
    jm.close();
    cleanup(dbPath);
  }
});

test('attachPlan moves a planning job to queued with actions attached', () => {
  const dbPath = tmpDbPath();
  const jm = new JobManager(dbPath);
  try {
    const jobId = jm.insertPlanningJob('flatten here', 'alice');
    jm.attachPlan(jobId, 'flatten_region', JSON.stringify({ x1: 0, z1: 0, x2: 1, z2: 1, targetY: 64 }), [
      { action: 'break', x: 0, y: 65, z: 0, block_type: null },
      { action: 'place', x: 0, y: 64, z: 0, block_type: 'dirt' }
    ]);
    const status = jm.getStatus(jobId);
    assert.strictEqual(status.status, 'queued');
    assert.strictEqual(status.tool_name, 'flatten_region');
    assert.strictEqual(status.total_actions, 2);
    const pending = jm.getPendingActions(jobId);
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].action, 'break');
    assert.strictEqual(pending[1].block_type, 'dirt');
  } finally {
    jm.close();
    cleanup(dbPath);
  }
});

test('markPlanningFailed sets status failed and stores the error', () => {
  const dbPath = tmpDbPath();
  const jm = new JobManager(dbPath);
  try {
    const jobId = jm.insertPlanningJob('do something impossible', 'alice');
    jm.markPlanningFailed(jobId, 'LLM could not produce valid args after 2 retries');
    const status = jm.getStatus(jobId);
    assert.strictEqual(status.status, 'failed');
    assert.strictEqual(status.error, 'LLM could not produce valid args after 2 retries');
  } finally {
    jm.close();
    cleanup(dbPath);
  }
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/db.test.js`
Expected: FAIL — `Cannot find module '../src/db'`

- [ ] **Step 6: Implement src/db.js**

Port `mineflayer/mineflayer-test/src/db.js` wholesale, with these changes to the `jobs` schema and API to support the planning stage:

```js
const Database = require('better-sqlite3');

class JobManager {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_text TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        status TEXT NOT NULL,
        tool_name TEXT,
        args_json TEXT,
        error TEXT,
        total_actions INTEGER,
        completed_actions INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_actions (
        job_id INTEGER NOT NULL REFERENCES jobs(id),
        seq INTEGER NOT NULL,
        action TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        z INTEGER NOT NULL,
        block_type TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        PRIMARY KEY (job_id, seq)
      );
    `);

    this.stmtInsertPlanningJob = this.db.prepare(`
      INSERT INTO jobs (task_text, requested_by, status, created_at, updated_at)
      VALUES (?, ?, 'planning', ?, ?)
    `);

    this.stmtInsertAction = this.db.prepare(`
      INSERT INTO job_actions (job_id, seq, action, x, y, z, block_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    this.stmtGetJobById = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`);

    this.stmtGetNextPlanningJob = this.db.prepare(`
      SELECT * FROM jobs WHERE status = 'planning' ORDER BY created_at ASC LIMIT 1
    `);

    this.stmtAttachPlan = this.db.prepare(`
      UPDATE jobs SET status = 'queued', tool_name = ?, args_json = ?, total_actions = ?, updated_at = ?
      WHERE id = ?
    `);

    this.stmtMarkPlanningFailed = this.db.prepare(`
      UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?
    `);

    this.stmtGetQueue = this.db.prepare(`
      SELECT * FROM jobs WHERE status IN ('planning', 'queued', 'running', 'stopping') ORDER BY created_at ASC
    `);

    this.stmtGetNextQueuedJob = this.db.prepare(`
      SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1
    `);

    this.stmtMarkRunning = this.db.prepare(`UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ?`);
    this.stmtMarkJobStatus = this.db.prepare(`UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?`);
    this.stmtMarkActionDone = this.db.prepare(`UPDATE job_actions SET status = 'done' WHERE job_id = ? AND seq = ?`);
    this.stmtMarkActionFailed = this.db.prepare(`UPDATE job_actions SET status = 'failed', error = ? WHERE job_id = ? AND seq = ?`);
    this.stmtIncrementCompleted = this.db.prepare(`UPDATE jobs SET completed_actions = completed_actions + 1, updated_at = ? WHERE id = ?`);
    this.stmtUpdateJobTimestamp = this.db.prepare(`UPDATE jobs SET updated_at = ? WHERE id = ?`);
    this.stmtGetPendingActions = this.db.prepare(`SELECT * FROM job_actions WHERE job_id = ? AND status = 'pending' ORDER BY seq ASC`);
    this.stmtGetInterruptedJobs = this.db.prepare(`SELECT * FROM jobs WHERE status IN ('running', 'stopping')`);
    this.stmtCancelJob = this.db.prepare(`UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ?`);
  }

  insertPlanningJob(taskText, requestedBy) {
    const now = Date.now();
    const result = this.stmtInsertPlanningJob.run(taskText, requestedBy, now, now);
    return result.lastInsertRowid;
  }

  getNextPlanningJob() {
    return this.stmtGetNextPlanningJob.get();
  }

  attachPlan(jobId, toolName, argsJson, actions) {
    const now = Date.now();
    const transaction = this.db.transaction(() => {
      this.stmtAttachPlan.run(toolName, argsJson, actions.length, now, jobId);
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        this.stmtInsertAction.run(jobId, i, a.action, a.x, a.y, a.z, a.block_type || null);
      }
    });
    transaction();
  }

  markPlanningFailed(jobId, error) {
    const now = Date.now();
    this.stmtMarkPlanningFailed.run(error, now, jobId);
  }

  cancel(jobId, requestedBy, isAdmin) {
    const job = this.stmtGetJobById.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.requested_by !== requestedBy && !isAdmin) {
      throw new Error('Permission denied: only job owner or admin can cancel');
    }
    this.stmtCancelJob.run(Date.now(), jobId);
  }

  getStatus(jobId) { return this.stmtGetJobById.get(jobId); }
  getQueue() { return this.stmtGetQueue.all(); }
  getNextQueuedJob() { return this.stmtGetNextQueuedJob.get(); }
  markRunning(jobId) { this.stmtMarkRunning.run(Date.now(), jobId); }
  markJobStatus(jobId, status) { this.stmtMarkJobStatus.run(status, Date.now(), jobId); }

  markActionDone(jobId, seq) {
    const now = Date.now();
    this.db.transaction(() => {
      this.stmtMarkActionDone.run(jobId, seq);
      this.stmtIncrementCompleted.run(now, jobId);
    })();
  }

  markActionFailed(jobId, seq, error) {
    const now = Date.now();
    this.db.transaction(() => {
      this.stmtMarkActionFailed.run(error, jobId, seq);
      this.stmtUpdateJobTimestamp.run(now, jobId);
    })();
  }

  getPendingActions(jobId) { return this.stmtGetPendingActions.all(jobId); }
  getInterruptedJobs() { return this.stmtGetInterruptedJobs.all(); }
  close() { this.db.close(); }
}

module.exports = JobManager;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/db.test.js`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add mineflayer/mineflayer-agent/package.json mineflayer/mineflayer-agent/.gitignore mineflayer/mineflayer-agent/src/db.js mineflayer/mineflayer-agent/test/db.test.js mineflayer/mineflayer-agent/package-lock.json
git commit -m "feat(mineflayer-agent): scaffold project and job data layer with planning stage"
```

---

## Task 2: Tool registry + args validation

**Files:**
- Create: `mineflayer/mineflayer-agent/src/tools/index.js`
- Test: `mineflayer/mineflayer-agent/test/tools/index.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `registerTool({name, description, argsSchema, compile})` — adds a tool
  - `getTool(name) -> {name, description, argsSchema, compile} | undefined`
  - `getAllSchemas() -> [{name, description, argsSchema}]` — fed to the LLM provider as its function-calling tool list
  - `validateArgs(name, args) -> {valid: true} | {valid: false, errors: string}` — Ajv-backed
  - This module is required by Tasks 3–6 (which call `registerTool`) and Task 8 (planner, which calls `getTool`/`validateArgs`/`getAllSchemas`).

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { registerTool, getTool, getAllSchemas, validateArgs } = require('../../src/tools/index');

test('registerTool + getTool round-trip', () => {
  registerTool({
    name: 'test_tool',
    description: 'a test tool',
    argsSchema: {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1 } },
      required: ['count'],
      additionalProperties: false
    },
    compile: (args) => [{ action: 'break', x: args.count, y: 0, z: 0 }]
  });

  const tool = getTool('test_tool');
  assert.strictEqual(tool.name, 'test_tool');
  assert.strictEqual(typeof tool.compile, 'function');
});

test('getAllSchemas exposes name/description/argsSchema for every registered tool', () => {
  const schemas = getAllSchemas();
  const testToolSchema = schemas.find((s) => s.name === 'test_tool');
  assert.ok(testToolSchema);
  assert.strictEqual(testToolSchema.description, 'a test tool');
  assert.strictEqual(testToolSchema.argsSchema.required[0], 'count');
});

test('validateArgs accepts valid args', () => {
  const result = validateArgs('test_tool', { count: 5 });
  assert.strictEqual(result.valid, true);
});

test('validateArgs rejects args failing the schema', () => {
  const result = validateArgs('test_tool', { count: 0 });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('validateArgs rejects unknown tool name', () => {
  const result = validateArgs('nonexistent_tool', {});
  assert.strictEqual(result.valid, false);
  assert.match(result.errors, /nonexistent_tool/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/tools/index.test.js`
Expected: FAIL — `Cannot find module '../../src/tools/index'`

- [ ] **Step 3: Implement src/tools/index.js**

```js
const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true });
const tools = new Map();
const validators = new Map();

function registerTool({ name, description, argsSchema, compile }) {
  tools.set(name, { name, description, argsSchema, compile });
  validators.set(name, ajv.compile(argsSchema));
}

function getTool(name) {
  return tools.get(name);
}

function getAllSchemas() {
  return Array.from(tools.values()).map(({ name, description, argsSchema }) => ({
    name,
    description,
    argsSchema
  }));
}

function validateArgs(name, args) {
  const validate = validators.get(name);
  if (!validate) {
    return { valid: false, errors: `unknown tool: ${name}` };
  }
  const valid = validate(args);
  if (valid) return { valid: true };
  return {
    valid: false,
    errors: ajv.errorsText(validate.errors, { separator: '; ' })
  };
}

module.exports = { registerTool, getTool, getAllSchemas, validateArgs };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/tools/index.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add mineflayer/mineflayer-agent/src/tools/index.js mineflayer/mineflayer-agent/test/tools/index.test.js
git commit -m "feat(mineflayer-agent): add tool registry with Ajv args validation"
```

---

## Task 3: flatten_region tool

**Files:**
- Create: `mineflayer/mineflayer-agent/src/tools/flatten.js`
- Test: `mineflayer/mineflayer-agent/test/tools/flatten.test.js`

**Interfaces:**
- Consumes: `registerTool` from Task 2 (`src/tools/index.js`).
- Produces: registers tool `flatten_region`; `compile(args, worldContext) -> action[]` where `action = {action: 'break'|'place', x, y, z, block_type: string|null}`. `worldContext.blockAt(vec3) -> block|null` is the only field this tool reads from `worldContext` (same shape as `bot.blockAt`).

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { Vec3 } = require('vec3');
require('../../src/tools/flatten');
const { getTool, validateArgs } = require('../../src/tools/index');

function fakeWorldContext(blockMap) {
  return {
    blockAt: (pos) => blockMap[`${pos.x},${pos.y},${pos.z}`] ?? null
  };
}

test('flatten_region tool is registered with a bounded region schema', () => {
  const tool = getTool('flatten_region');
  assert.ok(tool);
  assert.strictEqual(validateArgs('flatten_region', { x1: 0, z1: 0, x2: 200, z2: 200, targetY: 64 }).valid, false);
  assert.strictEqual(validateArgs('flatten_region', { x1: 0, z1: 0, x2: 5, z2: 5, targetY: 64 }).valid, true);
});

test('flatten_region compile emits break then place actions like the existing flattenCompiler', () => {
  const blockMap = {};
  blockMap['0,65,0'] = { type: 1 }; // solid block above target -> break
  blockMap['0,64,0'] = { type: 0 }; // air at target -> place
  const worldContext = fakeWorldContext(blockMap);

  const tool = getTool('flatten_region');
  const actions = tool.compile({ x1: 0, z1: 0, x2: 0, z2: 0, targetY: 64 }, worldContext);

  const breaks = actions.filter((a) => a.action === 'break');
  const places = actions.filter((a) => a.action === 'place');
  assert.strictEqual(breaks.length, 1);
  assert.deepStrictEqual([breaks[0].x, breaks[0].y, breaks[0].z], [0, 65, 0]);
  assert.strictEqual(places.length, 1);
  assert.deepStrictEqual([places[0].x, places[0].y, places[0].z], [0, 64, 0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/tools/flatten.test.js`
Expected: FAIL — `Cannot find module '../../src/tools/flatten'`

- [ ] **Step 3: Implement src/tools/flatten.js**

Port the scan logic from `mineflayer/mineflayer-test/src/flattenCompiler.js` (top-down break scan, bottom-up place scan, same `BREAK_SCAN_HEIGHT`/`FILL_SCAN_DEPTH` constants), wired as a registered tool with a bounded `argsSchema` (matches the existing bot's `MAX_REGION_COLUMNS = 10000` cap):

```js
const { Vec3 } = require('vec3');
const { registerTool } = require('./index');

const BREAK_SCAN_HEIGHT = 10;
const FILL_SCAN_DEPTH = 10;
const MAX_REGION_SIDE = 100; // (x2-x1) or (z2-z1) span cap; 100x100 = 10000 columns, matches existing bot's MAX_REGION_COLUMNS

function compile({ x1, z1, x2, z2, targetY }, worldContext) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);

  const breaks = [];
  const places = [];

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = targetY + BREAK_SCAN_HEIGHT; y >= targetY + 1; y--) {
        const block = worldContext.blockAt(new Vec3(x, y, z));
        if (block && block.type !== 0) {
          breaks.push({ action: 'break', x, y, z, block_type: null });
        }
      }
    }
  }

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = targetY - FILL_SCAN_DEPTH + 1; y <= targetY; y++) {
        const block = worldContext.blockAt(new Vec3(x, y, z));
        if (block && block.type === 0) {
          places.push({ action: 'place', x, y, z, block_type: null });
        }
      }
    }
  }

  return breaks.concat(places);
}

registerTool({
  name: 'flatten_region',
  description: 'Flatten a rectangular x/z region to a single target Y level by breaking blocks above it and filling air below it.',
  argsSchema: {
    type: 'object',
    properties: {
      x1: { type: 'integer' },
      z1: { type: 'integer' },
      x2: { type: 'integer' },
      z2: { type: 'integer' },
      targetY: { type: 'integer', minimum: -64, maximum: 320 }
    },
    required: ['x1', 'z1', 'x2', 'z2', 'targetY'],
    additionalProperties: false
  },
  compile
});

module.exports = { compile, MAX_REGION_SIDE };
```

Note: the region-span cap (`MAX_REGION_SIDE`) is a soft-max on `|x2-x1|`/`|z2-z1|`, not directly expressible in JSON Schema without a custom keyword — enforce it as an extra check inside `compile()` (throw if exceeded) rather than in `argsSchema`, since `argsSchema` alone can't compare two properties. Update the test above accordingly: replace the `validateArgs` schema-bound check with a `compile()`-throws check for an oversized region:

```js
test('flatten_region compile rejects an oversized region', () => {
  const { compile } = require('../../src/tools/flatten');
  const worldContext = fakeWorldContext({});
  assert.throws(() => compile({ x1: 0, z1: 0, x2: 200, z2: 200, targetY: 64 }, worldContext), /region too large/);
});
```
Add the corresponding guard at the top of `compile()`:
```js
function compile({ x1, z1, x2, z2, targetY }, worldContext) {
  if (Math.abs(x2 - x1) > MAX_REGION_SIDE || Math.abs(z2 - z1) > MAX_REGION_SIDE) {
    throw new Error(`region too large: max ${MAX_REGION_SIDE} blocks per side`);
  }
  // ... rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/tools/flatten.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mineflayer/mineflayer-agent/src/tools/flatten.js mineflayer/mineflayer-agent/test/tools/flatten.test.js
git commit -m "feat(mineflayer-agent): add flatten_region tool"
```

---

## Task 4: build_wall and build_box procedural tools

**Files:**
- Create: `mineflayer/mineflayer-agent/src/tools/buildWall.js`
- Create: `mineflayer/mineflayer-agent/src/tools/buildBox.js`
- Test: `mineflayer/mineflayer-agent/test/tools/buildWall.test.js`
- Test: `mineflayer/mineflayer-agent/test/tools/buildBox.test.js`

**Interfaces:**
- Consumes: `registerTool` from Task 2.
- Produces: registers tools `build_wall`, `build_box`. Both `compile(args)` (no `worldContext` needed — pure shape generation) return `action[]` of `{action: 'place', x, y, z, block_type}`.

- [ ] **Step 1: Write the failing tests**

```js
// test/tools/buildWall.test.js
const test = require('node:test');
const assert = require('node:assert');
require('../../src/tools/buildWall');
const { getTool, validateArgs } = require('../../src/tools/index');

test('build_wall tool registered with bounded length/height', () => {
  assert.strictEqual(validateArgs('build_wall', { x: 0, y: 64, z: 0, length: 10, height: 3, block: 'stone', orientation: 'x' }).valid, true);
  assert.strictEqual(validateArgs('build_wall', { x: 0, y: 64, z: 0, length: 10000, height: 3, block: 'stone', orientation: 'x' }).valid, false);
});

test('build_wall compile generates a length x height sheet along the x axis', () => {
  const tool = getTool('build_wall');
  const actions = tool.compile({ x: 0, y: 64, z: 0, length: 2, height: 2, block: 'stone', orientation: 'x' });
  assert.strictEqual(actions.length, 4);
  assert.ok(actions.every((a) => a.action === 'place' && a.block_type === 'stone'));
  const coords = actions.map((a) => `${a.x},${a.y},${a.z}`).sort();
  assert.deepStrictEqual(coords, ['0,64,0', '0,65,0', '1,64,0', '1,65,0']);
});

test('build_wall compile orientation z runs along the z axis', () => {
  const tool = getTool('build_wall');
  const actions = tool.compile({ x: 0, y: 64, z: 0, length: 2, height: 1, block: 'stone', orientation: 'z' });
  const coords = actions.map((a) => `${a.x},${a.y},${a.z}`).sort();
  assert.deepStrictEqual(coords, ['0,64,0', '0,64,1']);
});
```

```js
// test/tools/buildBox.test.js
const test = require('node:test');
const assert = require('node:assert');
require('../../src/tools/buildBox');
const { getTool, validateArgs } = require('../../src/tools/index');

test('build_box tool registered with bounded dimensions', () => {
  assert.strictEqual(validateArgs('build_box', { x: 0, y: 64, z: 0, width: 3, height: 3, depth: 3, block: 'stone', hollow: true }).valid, true);
  assert.strictEqual(validateArgs('build_box', { x: 0, y: 64, z: 0, width: 200, height: 3, depth: 3, block: 'stone', hollow: true }).valid, false);
});

test('build_box compile hollow=true only places the shell', () => {
  const tool = getTool('build_box');
  const actions = tool.compile({ x: 0, y: 0, z: 0, width: 3, height: 3, depth: 3, block: 'stone', hollow: true });
  // 3x3x3 solid = 27, hollow removes the single interior cell = 26
  assert.strictEqual(actions.length, 26);
  assert.ok(!actions.some((a) => a.x === 1 && a.y === 1 && a.z === 1));
});

test('build_box compile hollow=false fills every cell', () => {
  const tool = getTool('build_box');
  const actions = tool.compile({ x: 0, y: 0, z: 0, width: 2, height: 2, depth: 2, block: 'dirt', hollow: false });
  assert.strictEqual(actions.length, 8);
  assert.ok(actions.every((a) => a.block_type === 'dirt'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mineflayer/mineflayer-agent && node --test test/tools/buildWall.test.js test/tools/buildBox.test.js`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement src/tools/buildWall.js**

```js
const { registerTool } = require('./index');

const MAX_LENGTH = 200;
const MAX_HEIGHT = 50;

function compile({ x, y, z, length, height, block, orientation }) {
  const actions = [];
  for (let i = 0; i < length; i++) {
    for (let h = 0; h < height; h++) {
      const pos = orientation === 'x'
        ? { x: x + i, y: y + h, z }
        : { x, y: y + h, z: z + i };
      actions.push({ action: 'place', x: pos.x, y: pos.y, z: pos.z, block_type: block });
    }
  }
  return actions;
}

registerTool({
  name: 'build_wall',
  description: 'Build a straight vertical wall of a given block type, starting at (x,y,z), running `length` blocks along the x or z axis and `height` blocks tall.',
  argsSchema: {
    type: 'object',
    properties: {
      x: { type: 'integer' },
      y: { type: 'integer' },
      z: { type: 'integer' },
      length: { type: 'integer', minimum: 1, maximum: MAX_LENGTH },
      height: { type: 'integer', minimum: 1, maximum: MAX_HEIGHT },
      block: { type: 'string', minLength: 1 },
      orientation: { type: 'string', enum: ['x', 'z'] }
    },
    required: ['x', 'y', 'z', 'length', 'height', 'block', 'orientation'],
    additionalProperties: false
  },
  compile
});

module.exports = { compile };
```

- [ ] **Step 4: Implement src/tools/buildBox.js**

```js
const { registerTool } = require('./index');

const MAX_DIM = 50;

function compile({ x, y, z, width, height, depth, block, hollow }) {
  const actions = [];
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      for (let dz = 0; dz < depth; dz++) {
        const onShell = dx === 0 || dx === width - 1 || dy === 0 || dy === height - 1 || dz === 0 || dz === depth - 1;
        if (hollow && !onShell) continue;
        actions.push({ action: 'place', x: x + dx, y: y + dy, z: z + dz, block_type: block });
      }
    }
  }
  return actions;
}

registerTool({
  name: 'build_box',
  description: 'Build a rectangular box (hollow shell or fully solid) of a given block type, starting at corner (x,y,z) with the given width (x), height (y), and depth (z).',
  argsSchema: {
    type: 'object',
    properties: {
      x: { type: 'integer' },
      y: { type: 'integer' },
      z: { type: 'integer' },
      width: { type: 'integer', minimum: 1, maximum: MAX_DIM },
      height: { type: 'integer', minimum: 1, maximum: MAX_DIM },
      depth: { type: 'integer', minimum: 1, maximum: MAX_DIM },
      block: { type: 'string', minLength: 1 },
      hollow: { type: 'boolean' }
    },
    required: ['x', 'y', 'z', 'width', 'height', 'depth', 'block', 'hollow'],
    additionalProperties: false
  },
  compile
});

module.exports = { compile };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd mineflayer/mineflayer-agent && node --test test/tools/buildWall.test.js test/tools/buildBox.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mineflayer/mineflayer-agent/src/tools/buildWall.js mineflayer/mineflayer-agent/src/tools/buildBox.js mineflayer/mineflayer-agent/test/tools/buildWall.test.js mineflayer/mineflayer-agent/test/tools/buildBox.test.js
git commit -m "feat(mineflayer-agent): add build_wall and build_box procedural tools"
```

---

## Task 5: .schem loader

**Files:**
- Create: `mineflayer/mineflayer-agent/src/schematics/schemLoader.js`
- Create: `mineflayer/mineflayer-agent/test/fixtures/tiny.schem` (generated by the test setup, see Step 1)
- Test: `mineflayer/mineflayer-agent/test/schematics/schemLoader.test.js`

**Interfaces:**
- Consumes: `prismarine-schematic` npm package (installed in Task 1).
- Produces: `async function loadSchem(filePath) -> Block[]` where `Block = {x, y, z, name}`, relative to the schematic's own origin (0,0,0 = one corner). Used by Task 7 (`buildSchematic.js`).

- [ ] **Step 1: Write the failing test, generating its own fixture**

`prismarine-schematic` can both write and read `.schem` files, so the test builds a known-good fixture at run time instead of hand-crafting binary NBT — avoids checking in an opaque binary whose contents can't be diffed in review.

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { Schematic } = require('prismarine-schematic');
const { Vec3 } = require('vec3');
const mcData = require('minecraft-data')('1.21.4');
const { loadSchem } = require('../../src/schematics/schemLoader');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'tiny.schem');

test('loadSchem reads back a 2x1x1 schematic written by prismarine-schematic', async (t) => {
  t.before(async () => {
    // Build a tiny 2x1x1 schematic: stone at (0,0,0), dirt at (1,0,0).
    const size = new Vec3(2, 1, 1);
    const schematic = new Schematic(size, new Vec3(0, 0, 0), [], mcData.blocksByName.stone.defaultState, [], []);
    schematic.setBlock(new Vec3(0, 0, 0), mcData.blocksByName.stone.defaultState);
    schematic.setBlock(new Vec3(1, 0, 0), mcData.blocksByName.dirt.defaultState);
    const buf = await schematic.write();
    fs.writeFileSync(FIXTURE_PATH, buf);
  });
  t.after(() => {
    if (fs.existsSync(FIXTURE_PATH)) fs.unlinkSync(FIXTURE_PATH);
  });

  const blocks = await loadSchem(FIXTURE_PATH);
  assert.strictEqual(blocks.length, 2);
  const byPos = Object.fromEntries(blocks.map((b) => [`${b.x},${b.y},${b.z}`, b.name]));
  assert.strictEqual(byPos['0,0,0'], 'stone');
  assert.strictEqual(byPos['1,0,0'], 'dirt');
});
```

Note: `minecraft-data` is a `prismarine-schematic` transitive dependency; if `require('minecraft-data')` fails to resolve directly, add it to `package.json` `dependencies` explicitly (`npm view minecraft-data version` to pick the current version) rather than relying on the transitive resolution.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/schematics/schemLoader.test.js`
Expected: FAIL — `Cannot find module '../../src/schematics/schemLoader'`

- [ ] **Step 3: Implement src/schematics/schemLoader.js**

```js
const { Schematic } = require('prismarine-schematic');

// Returns Block[] = {x, y, z, name} in schematic-local coordinates (relative
// to the schematic's own (0,0,0) corner, not any world position — callers
// translate to a placement origin).
async function loadSchem(filePath) {
  const schematic = await Schematic.read(filePath, '1.21.4');
  const blocks = [];
  const size = schematic.size;
  for (let x = 0; x < size.x; x++) {
    for (let y = 0; y < size.y; y++) {
      for (let z = 0; z < size.z; z++) {
        const block = schematic.getBlock(new (require('vec3').Vec3)(x, y, z));
        if (!block || block.name === 'air') continue;
        blocks.push({ x, y, z, name: block.name });
      }
    }
  }
  return blocks;
}

module.exports = { loadSchem };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/schematics/schemLoader.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mineflayer/mineflayer-agent/src/schematics/schemLoader.js mineflayer/mineflayer-agent/test/schematics/schemLoader.test.js mineflayer/mineflayer-agent/package.json mineflayer/mineflayer-agent/package-lock.json
git commit -m "feat(mineflayer-agent): add .schem loader via prismarine-schematic"
```

---

## Task 6: .litematic loader

**Files:**
- Create: `mineflayer/mineflayer-agent/src/schematics/litematicLoader.js`
- Test: `mineflayer/mineflayer-agent/test/schematics/litematicLoader.test.js`

**Interfaces:**
- Consumes: `prismarine-nbt` (installed in Task 1).
- Produces: `async function loadLitematic(filePath) -> Block[]` (same `{x,y,z,name}` shape as `loadSchem`), flattening every region in the file into one coordinate space (each region's own `position` offset applied). Used by Task 7.

This is the riskiest task in the plan — no maintained JS parser for `.litematic` exists, so this hand-rolls the format: gzip'd NBT wrapping, per-region `BlockStatePalette` (list of block-state compounds) and `BlockStates` (a `long[]` bitpacked array, `bits-per-entry = max(2, ceil(log2(paletteSize)))`, entries packed MSB-first within each 64-bit long, an entry never spans two longs in the litematica format — unlike the closely-related but NOT bit-identical anvil chunk format).

**Files:**
- Create: `mineflayer/mineflayer-agent/test/fixtures/generateLitematicFixture.js` (a one-off script producing the two binary fixtures below, kept in the repo so the fixtures are reproducible/reviewable rather than opaque binaries)
- Create: `mineflayer/mineflayer-agent/test/fixtures/tiny-single-region.litematic`
- Create: `mineflayer/mineflayer-agent/test/fixtures/tiny-multi-region.litematic`

- [ ] **Step 1: Write the fixture generator**

```js
// test/fixtures/generateLitematicFixture.js
// Run manually to (re)generate the .litematic fixtures used by
// litematicLoader.test.js. Not part of the automated test run.
const fs = require('node:fs');
const path = require('node:path');
const nbt = require('prismarine-nbt');
const zlib = require('node:zlib');

// Packs `values` (each < 2^bitsPerEntry) into a BigInt64Array per the
// litematica bitpacking rule: entries packed LSB-first into 64-bit words,
// an entry never spans two words (any leftover bits in a word are padding).
function packLongArray(values, bitsPerEntry) {
  const entriesPerLong = Math.floor(64 / bitsPerEntry);
  const numLongs = Math.ceil(values.length / entriesPerLong);
  const longs = new BigInt64Array(numLongs);
  for (let i = 0; i < values.length; i++) {
    const longIndex = Math.floor(i / entriesPerLong);
    const bitOffset = (i % entriesPerLong) * bitsPerEntry;
    longs[longIndex] |= BigInt(values[i]) << BigInt(bitOffset);
  }
  return Array.from(longs);
}

function buildRegion(sizeX, sizeY, sizeZ, posX, posY, posZ, paletteNames, blockIndices) {
  const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(paletteNames.length)));
  const packed = packLongArray(blockIndices, bitsPerEntry);
  return nbt.comp({
    Position: nbt.comp({ x: nbt.int(posX), y: nbt.int(posY), z: nbt.int(posZ) }),
    Size: nbt.comp({ x: nbt.int(sizeX), y: nbt.int(sizeY), z: nbt.int(sizeZ) }),
    BlockStatePalette: nbt.list(nbt.comp(paletteNames.map((name) => ({ Name: nbt.string(name) })))),
    BlockStates: nbt.longArray(packed.map((v) => [Number(v >> 32n), Number(v & 0xffffffffn)]))
  });
}

async function writeFixture(filePath, regions) {
  const root = nbt.comp({
    MinecraftDataVersion: nbt.int(3700),
    Version: nbt.int(6),
    Regions: nbt.comp(Object.fromEntries(regions.map((r, i) => [`region${i}`, r])))
  });
  const buf = nbt.writeUncompressed(root, 'big');
  fs.writeFileSync(filePath, zlib.gzipSync(buf));
}

async function main() {
  const fixturesDir = __dirname;

  // Single region, 2x1x1: air, stone
  const single = buildRegion(2, 1, 1, 0, 0, 0, ['minecraft:air', 'minecraft:stone'], [0, 1]);
  await writeFixture(path.join(fixturesDir, 'tiny-single-region.litematic'), [single]);

  // Two regions: region0 at (0,0,0) is 1x1x1 stone, region1 at offset (5,0,0) is 1x1x1 dirt
  const r0 = buildRegion(1, 1, 1, 0, 0, 0, ['minecraft:stone'], [0]);
  const r1 = buildRegion(1, 1, 1, 5, 0, 0, ['minecraft:dirt'], [0]);
  await writeFixture(path.join(fixturesDir, 'tiny-multi-region.litematic'), [r0, r1]);
}

main();
```

- [ ] **Step 2: Generate the fixtures**

Run: `cd mineflayer/mineflayer-agent && node test/fixtures/generateLitematicFixture.js`
Expected: creates `test/fixtures/tiny-single-region.litematic` and `test/fixtures/tiny-multi-region.litematic`

- [ ] **Step 3: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { loadLitematic } = require('../../src/schematics/litematicLoader');

test('loadLitematic parses a single-region file, skipping air', async () => {
  const blocks = await loadLitematic(path.join(__dirname, '..', 'fixtures', 'tiny-single-region.litematic'));
  assert.strictEqual(blocks.length, 1);
  assert.strictEqual(blocks[0].name, 'stone');
  assert.deepStrictEqual([blocks[0].x, blocks[0].y, blocks[0].z], [1, 0, 0]);
});

test('loadLitematic flattens multiple regions into one coordinate space using each region Position offset', async () => {
  const blocks = await loadLitematic(path.join(__dirname, '..', 'fixtures', 'tiny-multi-region.litematic'));
  assert.strictEqual(blocks.length, 2);
  const byPos = Object.fromEntries(blocks.map((b) => [`${b.x},${b.y},${b.z}`, b.name]));
  assert.strictEqual(byPos['0,0,0'], 'stone');
  assert.strictEqual(byPos['5,0,0'], 'dirt');
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/schematics/litematicLoader.test.js`
Expected: FAIL — `Cannot find module '../../src/schematics/litematicLoader'`

- [ ] **Step 5: Implement src/schematics/litematicLoader.js**

```js
const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const nbt = require('prismarine-nbt');

// litematica packs entries LSB-first into 64-bit words; an entry never
// spans two words (unlike anvil chunk section format). Unpacks `numEntries`
// values of `bitsPerEntry` bits each from `longArray` (array of [hi32, lo32]
// pairs, as produced by prismarine-nbt's longArray tag).
function unpackLongArray(longArray, bitsPerEntry, numEntries) {
  const entriesPerLong = Math.floor(64 / bitsPerEntry);
  const mask = (1n << BigInt(bitsPerEntry)) - 1n;
  const values = new Array(numEntries);
  for (let i = 0; i < numEntries; i++) {
    const longIndex = Math.floor(i / entriesPerLong);
    const bitOffset = (i % entriesPerLong) * bitsPerEntry;
    const [hi, lo] = longArray[longIndex];
    const word = (BigInt(hi) << 32n) | (BigInt(lo) & 0xffffffffn);
    values[i] = Number((word >> BigInt(bitOffset)) & mask);
  }
  return values;
}

function parseRegion(region) {
  const pos = region.value.Position.value;
  const size = region.value.Size.value;
  const sizeX = Math.abs(size.x.value);
  const sizeY = Math.abs(size.y.value);
  const sizeZ = Math.abs(size.z.value);

  const palette = region.value.BlockStatePalette.value.value.map((entry) => {
    const name = entry.Name.value;
    return name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;
  });

  const numEntries = sizeX * sizeY * sizeZ;
  const bitsPerEntry = Math.max(2, Math.ceil(Math.log2(palette.length)));
  const longArray = region.value.BlockStates.value.value; // array of [hi32, lo32]
  const indices = unpackLongArray(longArray, bitsPerEntry, numEntries);

  const blocks = [];
  // litematica iterates y, then z, then x (x fastest) when linearizing indices.
  let i = 0;
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const paletteIndex = indices[i++];
        const name = palette[paletteIndex];
        if (name && name !== 'air') {
          blocks.push({ x: pos.x.value + x, y: pos.y.value + y, z: pos.z.value + z, name });
        }
      }
    }
  }
  return blocks;
}

async function loadLitematic(filePath) {
  const raw = await fs.readFile(filePath);
  const unzipped = zlib.gunzipSync(raw);
  const { parsed } = await nbt.parse(unzipped);

  const regions = Object.values(parsed.value.Regions.value);
  return regions.flatMap(parseRegion);
}

module.exports = { loadLitematic };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/schematics/litematicLoader.test.js`
Expected: PASS (2 tests)

If the fixture generator's `packLongArray` and the loader's `unpackLongArray` disagree on bit order, the test fails with a wrong `name`/coordinate rather than a crash — check both functions pack/unpack LSB-first consistently before assuming the loader itself is wrong.

- [ ] **Step 7: Commit**

```bash
git add mineflayer/mineflayer-agent/src/schematics/litematicLoader.js mineflayer/mineflayer-agent/test/schematics/litematicLoader.test.js mineflayer/mineflayer-agent/test/fixtures/generateLitematicFixture.js mineflayer/mineflayer-agent/test/fixtures/tiny-single-region.litematic mineflayer/mineflayer-agent/test/fixtures/tiny-multi-region.litematic
git commit -m "feat(mineflayer-agent): add hand-rolled .litematic loader"
```

---

## Task 7: build_schematic tool (loader dispatch + placement + rotation)

**Files:**
- Create: `mineflayer/mineflayer-agent/src/tools/buildSchematic.js`
- Test: `mineflayer/mineflayer-agent/test/tools/buildSchematic.test.js`

**Interfaces:**
- Consumes: `registerTool` (Task 2), `loadSchem` (Task 5), `loadLitematic` (Task 6).
- Produces: registers tool `build_schematic`; `compile` is async (`async compile(args) -> Promise<action[]>` — the registry/planner from Task 8 must `await` tool `compile()` calls, since this is the one tool that reads a file).

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
require('../../src/tools/buildSchematic');
const { getTool, validateArgs } = require('../../src/tools/index');

test('build_schematic tool registered, requires source path and origin', () => {
  assert.strictEqual(validateArgs('build_schematic', { sourcePath: 'x.schem', originX: 0, originY: 64, originZ: 0, rotation: 0 }).valid, true);
  assert.strictEqual(validateArgs('build_schematic', { sourcePath: 'x.schem', originX: 0, originY: 64, originZ: 0, rotation: 45 }).valid, false);
});

test('build_schematic compile translates a loaded schematic to the placement origin, rotation 0', async () => {
  const tool = getTool('build_schematic');
  // Fixture built in Task 5's test, reused here directly via the real loader.
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'tiny.schem');
  // Recreate the fixture inline since Task 5's test cleans it up after itself.
  const { Schematic } = require('prismarine-schematic');
  const { Vec3 } = require('vec3');
  const mcData = require('minecraft-data')('1.21.4');
  const size = new Vec3(2, 1, 1);
  const schematic = new Schematic(size, new Vec3(0, 0, 0), [], mcData.blocksByName.stone.defaultState, [], []);
  schematic.setBlock(new Vec3(0, 0, 0), mcData.blocksByName.stone.defaultState);
  schematic.setBlock(new Vec3(1, 0, 0), mcData.blocksByName.dirt.defaultState);
  require('node:fs').writeFileSync(fixturePath, await schematic.write());

  try {
    const actions = await tool.compile({ sourcePath: fixturePath, originX: 100, originY: 64, originZ: 200, rotation: 0 });
    assert.strictEqual(actions.length, 2);
    const byPos = Object.fromEntries(actions.map((a) => [`${a.x},${a.y},${a.z}`, a.block_type]));
    assert.strictEqual(byPos['100,64,200'], 'stone');
    assert.strictEqual(byPos['101,64,200'], 'dirt');
  } finally {
    require('node:fs').unlinkSync(fixturePath);
  }
});

test('build_schematic compile rotation 90 rotates blocks around the origin (x,z) -> (-z,x)', async () => {
  const tool = getTool('build_schematic');
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'tiny-rot.schem');
  const { Schematic } = require('prismarine-schematic');
  const { Vec3 } = require('vec3');
  const mcData = require('minecraft-data')('1.21.4');
  const size = new Vec3(2, 1, 1);
  const schematic = new Schematic(size, new Vec3(0, 0, 0), [], mcData.blocksByName.stone.defaultState, [], []);
  schematic.setBlock(new Vec3(0, 0, 0), mcData.blocksByName.stone.defaultState);
  schematic.setBlock(new Vec3(1, 0, 0), mcData.blocksByName.dirt.defaultState);
  require('node:fs').writeFileSync(fixturePath, await schematic.write());

  try {
    const actions = await tool.compile({ sourcePath: fixturePath, originX: 0, originY: 0, originZ: 0, rotation: 90 });
    const byPos = Object.fromEntries(actions.map((a) => [`${a.x},${a.y},${a.z}`, a.block_type]));
    // (1,0,0) relative -> 90deg y-rotation (x,z)->(-z,x) -> (0,0,1)
    assert.strictEqual(byPos['0,0,0'], 'stone');
    assert.strictEqual(byPos['0,0,1'], 'dirt');
  } finally {
    require('node:fs').unlinkSync(fixturePath);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/tools/buildSchematic.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement src/tools/buildSchematic.js**

```js
const { registerTool } = require('./index');
const { loadSchem } = require('../schematics/schemLoader');
const { loadLitematic } = require('../schematics/litematicLoader');

// y-axis rotation only, matches how these formats are placed in practice.
function rotate(x, z, rotation) {
  switch (rotation) {
    case 0: return { x, z };
    case 90: return { x: -z, z: x };
    case 180: return { x: -x, z: -z };
    case 270: return { x: z, z: -x };
    default: throw new Error(`unsupported rotation: ${rotation}`);
  }
}

async function compile({ sourcePath, originX, originY, originZ, rotation }) {
  const blocks = sourcePath.endsWith('.litematic')
    ? await loadLitematic(sourcePath)
    : await loadSchem(sourcePath);

  return blocks.map((b) => {
    const r = rotate(b.x, b.z, rotation);
    return {
      action: 'place',
      x: originX + r.x,
      y: originY + b.y,
      z: originZ + r.z,
      block_type: b.name
    };
  });
}

registerTool({
  name: 'build_schematic',
  description: 'Place a pre-made structure loaded from a .schem or .litematic file at the given origin, optionally rotated around the y axis.',
  argsSchema: {
    type: 'object',
    properties: {
      sourcePath: { type: 'string', minLength: 1 },
      originX: { type: 'integer' },
      originY: { type: 'integer' },
      originZ: { type: 'integer' },
      rotation: { type: 'integer', enum: [0, 90, 180, 270] }
    },
    required: ['sourcePath', 'originX', 'originY', 'originZ', 'rotation'],
    additionalProperties: false
  },
  compile
});

module.exports = { compile };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/tools/buildSchematic.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add mineflayer/mineflayer-agent/src/tools/buildSchematic.js mineflayer/mineflayer-agent/test/tools/buildSchematic.test.js
git commit -m "feat(mineflayer-agent): add build_schematic tool with rotation"
```

---

## Task 8: Execution engine (ported)

**Files:**
- Create: `mineflayer/mineflayer-agent/src/executionEngine.js`
- Test: `mineflayer/mineflayer-agent/test/executionEngine.test.js`

**Interfaces:**
- Consumes: `JobManager` (Task 1) — specifically `getPendingActions`, `getStatus`, `markActionDone`, `markActionFailed`, `markJobStatus`.
- Produces: `class ExecutionEngine { constructor(bot, jobManager, {pathfindTimeoutMs}); async runJob(jobId); abort(); }` — same public contract as the existing flatten bot's engine. Consumed by Task 10 (`index.js`)'s drain loop.

- [ ] **Step 1: Copy the existing engine and its test file verbatim**

Run:
```bash
cp /home/leivur/minecraft/.claude/worktrees/mineflayer-flatten-bot/mineflayer/mineflayer-test/src/executionEngine.js mineflayer/mineflayer-agent/src/executionEngine.js
cp /home/leivur/minecraft/.claude/worktrees/mineflayer-flatten-bot/mineflayer/mineflayer-test/test/executionEngine.test.js mineflayer/mineflayer-agent/test/executionEngine.test.js
```

This is a straight port — the engine only depends on the `JobManager` and `job_actions` row shape, both of which Task 1 kept identical to the existing bot's schema. No behavior changes: same pathfinder timeout guard, same real-inventory fill-stock resolution, same block-tool equip fix, same `GoalPlaceBlock` positioning fix, same crash-resume `abort()` contract — all four bugs already hardened out of this code on the existing bot's branch.

- [ ] **Step 2: Run the ported test suite to confirm it passes unmodified**

Run: `cd mineflayer/mineflayer-agent && node --test test/executionEngine.test.js`
Expected: PASS, same test count as `mineflayer/mineflayer-test/test/executionEngine.test.js` currently has.

If anything fails, it means the ported test file references something from `mineflayer-test`'s `db.js` schema that Task 1's schema doesn't have — check the failing test's use of job/action row fields against Task 1's `job_actions` table (it's unchanged from the existing bot's, so this should not happen, but verify before moving on).

- [ ] **Step 3: Commit**

```bash
git add mineflayer/mineflayer-agent/src/executionEngine.js mineflayer/mineflayer-agent/test/executionEngine.test.js
git commit -m "feat(mineflayer-agent): port execution engine unchanged from existing flatten bot"
```

---

## Task 9: LLM provider interface (Gemini + OpenRouter adapters)

**Files:**
- Create: `mineflayer/mineflayer-agent/src/llm/provider.js`
- Create: `mineflayer/mineflayer-agent/src/llm/gemini.js`
- Create: `mineflayer/mineflayer-agent/src/llm/openrouter.js`
- Test: `mineflayer/mineflayer-agent/test/llm/provider.test.js`

**Interfaces:**
- Consumes: `@google/genai`, `openai` SDKs (installed in Task 1); `getAllSchemas()` shape from Task 2 as the `toolSchemas` input.
- Produces:
  - `src/llm/provider.js`: `function getProvider(name) -> {plan}` where `name` is `'gemini'|'openrouter'`, dispatching to the matching adapter.
  - Both adapters export `async function plan(taskText, worldContext, toolSchemas, {client}) -> {tool, args} | {error}`. The optional `{client}` param is how tests inject a fake SDK client instead of hitting the network — production code (Task 11) calls `plan()` without it, letting each adapter construct its real SDK client from env vars internally.
  - Consumed by Task 11 (planner).

- [ ] **Step 1: Write the failing test**

Both adapters are tested with the same parametrized suite against a fake SDK client, since they share one contract. The fake client mimics just enough of each SDK's response shape to prove the adapter extracts `{tool, args}` correctly and reports `{error}` on a malformed response — no real network call in either case.

```js
const test = require('node:test');
const assert = require('node:assert');
const { plan: geminiPlan } = require('../../src/llm/gemini');
const { plan: openrouterPlan } = require('../../src/llm/openrouter');

const toolSchemas = [
  { name: 'build_wall', description: 'build a wall', argsSchema: { type: 'object', properties: { length: { type: 'integer' } }, required: ['length'] } }
];

test('gemini adapter extracts {tool, args} from a functionCall response', async () => {
  const fakeClient = {
    models: {
      generateContent: async () => ({
        functionCalls: [{ name: 'build_wall', args: { length: 10 } }]
      })
    }
  };
  const result = await geminiPlan('build a wall', {}, toolSchemas, { client: fakeClient });
  assert.deepStrictEqual(result, { tool: 'build_wall', args: { length: 10 } });
});

test('gemini adapter returns {error} when no functionCall is present', async () => {
  const fakeClient = { models: { generateContent: async () => ({ functionCalls: [] }) } };
  const result = await geminiPlan('build a wall', {}, toolSchemas, { client: fakeClient });
  assert.ok(result.error);
});

test('openrouter adapter extracts {tool, args} from an OpenAI-style tool_calls response', async () => {
  const fakeClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              tool_calls: [{ function: { name: 'build_wall', arguments: JSON.stringify({ length: 10 }) } }]
            }
          }]
        })
      }
    }
  };
  const result = await openrouterPlan('build a wall', {}, toolSchemas, { client: fakeClient });
  assert.deepStrictEqual(result, { tool: 'build_wall', args: { length: 10 } });
});

test('openrouter adapter returns {error} when no tool_calls are present', async () => {
  const fakeClient = { chat: { completions: { create: async () => ({ choices: [{ message: {} }] }) } } };
  const result = await openrouterPlan('build a wall', {}, toolSchemas, { client: fakeClient });
  assert.ok(result.error);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/llm/provider.test.js`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement src/llm/gemini.js**

```js
const { GoogleGenAI } = require('@google/genai');

function toGeminiFunctionDeclarations(toolSchemas) {
  return toolSchemas.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.argsSchema
  }));
}

function buildPrompt(taskText, worldContext) {
  return `You are a Minecraft building agent. Given the user's request and the current world context, call exactly one tool with fully specified arguments.\n\nWorld context: ${JSON.stringify(worldContext)}\n\nUser request: ${taskText}`;
}

async function plan(taskText, worldContext, toolSchemas, { client } = {}) {
  const genAI = client || new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = process.env.LLM_MODEL || 'gemini-2.5-flash';

  const response = await genAI.models.generateContent({
    model,
    contents: buildPrompt(taskText, worldContext),
    config: {
      tools: [{ functionDeclarations: toGeminiFunctionDeclarations(toolSchemas) }]
    }
  });

  const call = response.functionCalls && response.functionCalls[0];
  if (!call) {
    return { error: 'gemini did not return a tool call' };
  }
  return { tool: call.name, args: call.args };
}

module.exports = { plan };
```

- [ ] **Step 4: Implement src/llm/openrouter.js**

```js
const OpenAI = require('openai');

function toOpenAiTools(toolSchemas) {
  return toolSchemas.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.argsSchema }
  }));
}

function buildPrompt(taskText, worldContext) {
  return `You are a Minecraft building agent. Given the user's request and the current world context, call exactly one tool with fully specified arguments.\n\nWorld context: ${JSON.stringify(worldContext)}\n\nUser request: ${taskText}`;
}

async function plan(taskText, worldContext, toolSchemas, { client } = {}) {
  const openai = client || new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
  });
  const model = process.env.LLM_MODEL || 'google/gemini-2.5-flash';

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: buildPrompt(taskText, worldContext) }],
    tools: toOpenAiTools(toolSchemas)
  });

  const call = response.choices[0]?.message?.tool_calls?.[0];
  if (!call) {
    return { error: 'openrouter did not return a tool call' };
  }
  return { tool: call.function.name, args: JSON.parse(call.function.arguments) };
}

module.exports = { plan };
```

- [ ] **Step 5: Implement src/llm/provider.js**

```js
const gemini = require('./gemini');
const openrouter = require('./openrouter');

const providers = { gemini, openrouter };

function getProvider(name) {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`unknown LLM provider: ${name}. Valid: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}

module.exports = { getProvider };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/llm/provider.test.js`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add mineflayer/mineflayer-agent/src/llm/provider.js mineflayer/mineflayer-agent/src/llm/gemini.js mineflayer/mineflayer-agent/src/llm/openrouter.js mineflayer/mineflayer-agent/test/llm/provider.test.js
git commit -m "feat(mineflayer-agent): add Gemini and OpenRouter LLM provider adapters"
```

---

## Task 10: Planner (job-state machine: planning -> queued/failed)

**Files:**
- Create: `mineflayer/mineflayer-agent/src/planner.js`
- Test: `mineflayer/mineflayer-agent/test/planner.test.js`

**Interfaces:**
- Consumes: `JobManager` (Task 1: `getNextPlanningJob`, `attachPlan`, `markPlanningFailed`), `getTool`/`validateArgs`/`getAllSchemas` (Task 2), a `provider.plan(taskText, worldContext, toolSchemas)` function (Task 9's contract).
- Produces: `async function planJob(jobManager, provider, worldContext) -> boolean` (returns `true` if a planning job was processed, `false` if the planning queue was empty — lets the drain loop in Task 11 know whether to keep looping). Consumed by Task 11 (`index.js`).

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { planJob } = require('../src/planner');
const { registerTool } = require('../src/tools/index');

registerTool({
  name: 'planner_test_tool',
  description: 'test tool',
  argsSchema: {
    type: 'object',
    properties: { n: { type: 'integer', minimum: 1 } },
    required: ['n'],
    additionalProperties: false
  },
  compile: (args) => [{ action: 'place', x: args.n, y: 0, z: 0, block_type: 'stone' }]
});

function fakeJobManager(jobRow) {
  const calls = { attachPlan: null, markPlanningFailed: null };
  return {
    calls,
    getNextPlanningJob: () => jobRow,
    attachPlan: (jobId, toolName, argsJson, actions) => { calls.attachPlan = { jobId, toolName, argsJson, actions }; },
    markPlanningFailed: (jobId, error) => { calls.markPlanningFailed = { jobId, error }; }
  };
}

test('planJob attaches a plan when the provider returns valid args on the first try', async () => {
  const jm = fakeJobManager({ id: 1, task_text: 'place a block', requested_by: 'alice' });
  const provider = { plan: async () => ({ tool: 'planner_test_tool', args: { n: 5 } }) };

  const processed = await planJob(jm, provider, {});
  assert.strictEqual(processed, true);
  assert.strictEqual(jm.calls.attachPlan.jobId, 1);
  assert.strictEqual(jm.calls.attachPlan.toolName, 'planner_test_tool');
  assert.strictEqual(jm.calls.attachPlan.actions.length, 1);
  assert.strictEqual(jm.calls.markPlanningFailed, null);
});

test('planJob retries on invalid args, then succeeds', async () => {
  const jm = fakeJobManager({ id: 2, task_text: 'place a block', requested_by: 'alice' });
  let calls = 0;
  const provider = {
    plan: async () => {
      calls++;
      return calls === 1 ? { tool: 'planner_test_tool', args: { n: -1 } } : { tool: 'planner_test_tool', args: { n: 5 } };
    }
  };

  const processed = await planJob(jm, provider, {});
  assert.strictEqual(processed, true);
  assert.strictEqual(calls, 2);
  assert.ok(jm.calls.attachPlan);
});

test('planJob fails the job after exhausting retries on invalid args', async () => {
  const jm = fakeJobManager({ id: 3, task_text: 'place a block', requested_by: 'alice' });
  const provider = { plan: async () => ({ tool: 'planner_test_tool', args: { n: -1 } }) };

  const processed = await planJob(jm, provider, {});
  assert.strictEqual(processed, true);
  assert.strictEqual(jm.calls.attachPlan, null);
  assert.strictEqual(jm.calls.markPlanningFailed.jobId, 3);
  assert.ok(jm.calls.markPlanningFailed.error.length > 0);
});

test('planJob fails the job immediately when the provider returns an unknown tool name', async () => {
  const jm = fakeJobManager({ id: 4, task_text: 'do something odd', requested_by: 'alice' });
  const provider = { plan: async () => ({ tool: 'no_such_tool', args: {} }) };

  await planJob(jm, provider, {});
  assert.ok(jm.calls.markPlanningFailed);
  assert.match(jm.calls.markPlanningFailed.error, /no_such_tool/);
});

test('planJob returns false when there is no planning job', async () => {
  const jm = fakeJobManager(undefined);
  const provider = { plan: async () => { throw new Error('should not be called'); } };
  const processed = await planJob(jm, provider, {});
  assert.strictEqual(processed, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/planner.test.js`
Expected: FAIL — `Cannot find module '../src/planner'`

- [ ] **Step 3: Implement src/planner.js**

```js
const { getTool, validateArgs, getAllSchemas } = require('./tools/index');

const MAX_PLAN_ATTEMPTS = 3; // 1 initial + 2 retries, per the global constraint

async function planJob(jobManager, provider, worldContext) {
  const job = jobManager.getNextPlanningJob();
  if (!job) return false;

  const toolSchemas = getAllSchemas();
  let lastError = 'unknown planning error';

  for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt++) {
    const result = await provider.plan(job.task_text, worldContext, toolSchemas);

    if (result.error) {
      lastError = result.error;
      continue;
    }

    const tool = getTool(result.tool);
    if (!tool) {
      // Unknown tool name is not a retryable schema mistake - fail fast.
      jobManager.markPlanningFailed(job.id, `LLM chose an unknown tool: "${result.tool}"`);
      return true;
    }

    const validation = validateArgs(result.tool, result.args);
    if (!validation.valid) {
      lastError = `invalid args for ${result.tool}: ${validation.errors}`;
      continue;
    }

    const actions = await tool.compile(result.args, worldContext);
    jobManager.attachPlan(job.id, result.tool, JSON.stringify(result.args), actions);
    return true;
  }

  jobManager.markPlanningFailed(job.id, `failed to produce a valid plan after ${MAX_PLAN_ATTEMPTS} attempts: ${lastError}`);
  return true;
}

module.exports = { planJob, MAX_PLAN_ATTEMPTS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/planner.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add mineflayer/mineflayer-agent/src/planner.js mineflayer/mineflayer-agent/test/planner.test.js
git commit -m "feat(mineflayer-agent): add planner with retry-on-invalid-args state machine"
```

---

## Task 11: Chat command layer

**Files:**
- Create: `mineflayer/mineflayer-agent/src/commands.js`
- Test: `mineflayer/mineflayer-agent/test/commands.test.js`

**Interfaces:**
- Consumes: `JobManager` (Task 1: `insertPlanningJob`, `getQueue`, `getStatus`, `cancel`, `markJobStatus`).
- Produces: `function registerCommands(bot, {jobManager, whitelist, admins, startProcessing, jobState})` — same signature/shape as the existing flatten bot's `commands.js`, but `!agent <freeform text>` replaces `!bot flatten <args>`. Consumed by Task 12 (`index.js`).

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
const { registerCommands } = require('../src/commands');

function fakeBot() {
  const chatLog = [];
  const handlers = {};
  return {
    username: 'AgentBot',
    chat: (msg) => chatLog.push(msg),
    chatLog,
    on: (event, handler) => { handlers[event] = handler; },
    emitChat: (username, message) => handlers.chat(username, message)
  };
}

function fakeJobManager() {
  const jobs = new Map();
  let nextId = 1;
  return {
    jobs,
    insertPlanningJob: (taskText, requestedBy) => {
      const id = nextId++;
      jobs.set(id, { id, task_text: taskText, requested_by: requestedBy, status: 'planning', completed_actions: 0, total_actions: null });
      return id;
    },
    getQueue: () => Array.from(jobs.values()),
    getStatus: (id) => jobs.get(id),
    cancel: (id, requestedBy, isAdmin) => {
      const job = jobs.get(id);
      if (!job) throw new Error(`Job ${id} not found`);
      if (job.requested_by !== requestedBy && !isAdmin) throw new Error('Permission denied: only job owner or admin can cancel');
      job.status = 'cancelled';
    },
    markJobStatus: (id, status) => { jobs.get(id).status = status; }
  };
}

test('rejects commands from non-whitelisted users', () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  registerCommands(bot, { jobManager, whitelist: new Set(['alice']), admins: new Set(), startProcessing: async () => {}, jobState: { currentJobId: null } });

  bot.emitChat('mallory', '!agent build a wall');
  assert.strictEqual(jobManager.jobs.size, 0);
  assert.match(bot.chatLog[0], /not whitelisted/);
});

test('!agent <text> creates a planning job and kicks startProcessing', async () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  let started = false;
  registerCommands(bot, { jobManager, whitelist: new Set(['alice']), admins: new Set(), startProcessing: async () => { started = true; }, jobState: { currentJobId: null } });

  bot.emitChat('alice', '!agent build a stone wall 10 long');
  assert.strictEqual(jobManager.jobs.size, 1);
  const job = jobManager.jobs.get(1);
  assert.strictEqual(job.task_text, 'build a stone wall 10 long');
  assert.strictEqual(job.requested_by, 'alice');
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(started, true);
});

test('!agent status <id> reports job status', () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  registerCommands(bot, { jobManager, whitelist: new Set(['alice']), admins: new Set(), startProcessing: async () => {}, jobState: { currentJobId: null } });

  bot.emitChat('alice', '!agent build a wall');
  bot.emitChat('alice', '!agent status 1');
  assert.match(bot.chatLog[bot.chatLog.length - 1], /#1/);
});

test('!agent cancel <id> enforces owner-or-admin via jobManager.cancel', () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  registerCommands(bot, { jobManager, whitelist: new Set(['alice', 'mallory']), admins: new Set(), startProcessing: async () => {}, jobState: { currentJobId: null } });

  bot.emitChat('alice', '!agent build a wall');
  bot.emitChat('mallory', '!agent cancel 1');
  assert.match(bot.chatLog[bot.chatLog.length - 1], /Cannot cancel/);
  assert.strictEqual(jobManager.jobs.get(1).status, 'planning');
});

test('!agent stop requires admin', () => {
  const bot = fakeBot();
  const jobManager = fakeJobManager();
  const jobState = { currentJobId: 1 };
  registerCommands(bot, { jobManager, whitelist: new Set(['alice']), admins: new Set(), startProcessing: async () => {}, jobState });

  bot.emitChat('alice', '!agent stop');
  assert.match(bot.chatLog[bot.chatLog.length - 1], /only admins/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mineflayer/mineflayer-agent && node --test test/commands.test.js`
Expected: FAIL — `Cannot find module '../src/commands'`

- [ ] **Step 3: Implement src/commands.js**

```js
const COMMAND_PREFIX = '!agent';

function registerCommands(bot, { jobManager, whitelist, admins, startProcessing, jobState }) {
  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    if (!message.startsWith(COMMAND_PREFIX)) return;

    if (!whitelist.has(username)) {
      bot.chat(`Sorry ${username}, you're not whitelisted for agent commands.`);
      console.log(`[agent] rejected command from non-whitelisted user: ${username}`);
      return;
    }

    const rest = message.slice(COMMAND_PREFIX.length).trim();
    const [maybeSubcommand, ...subArgs] = rest.split(/\s+/);

    console.log(`[agent] command from ${username}: ${rest}`);

    try {
      switch (maybeSubcommand) {
        case 'queue':
          handleQueue(bot, jobManager);
          break;
        case 'status':
          handleStatus(bot, subArgs, jobManager, jobState);
          break;
        case 'cancel':
          handleCancel(bot, subArgs, username, jobManager, admins);
          break;
        case 'stop':
          handleStop(bot, username, admins, jobManager, jobState);
          break;
        default:
          // Anything else is treated as a freeform task for the LLM planner,
          // not a recognized subcommand - e.g. "!agent build a stone wall 10 long".
          handleTask(bot, rest, username, jobManager, startProcessing);
      }
    } catch (err) {
      console.error('[agent] command error:', err);
      bot.chat(`Error running command: ${err.message}`);
    }
  });
}

function handleTask(bot, taskText, username, jobManager, startProcessing) {
  if (!taskText) {
    bot.chat('Usage: !agent <describe what you want built> | queue | status [id] | cancel <id> | stop');
    return;
  }
  const jobId = jobManager.insertPlanningJob(taskText, username);
  bot.chat(`Job #${jobId} queued for planning: "${taskText}"`);
  startProcessing().catch((err) => {
    console.error('[agent] job processing error:', err);
    bot.chat(`Job processing error: ${err.message}`);
  });
}

function handleQueue(bot, jobManager) {
  const queue = jobManager.getQueue();
  if (queue.length === 0) {
    bot.chat('Queue is empty.');
    return;
  }
  bot.chat(`Queue (${queue.length}):`);
  for (const job of queue) {
    bot.chat(`#${job.id} [${job.status}] by ${job.requested_by} - ${job.completed_actions}/${job.total_actions ?? '?'}`);
  }
}

function handleStatus(bot, args, jobManager, jobState) {
  let jobId;
  if (args.length >= 1 && args[0]) {
    jobId = Number(args[0]);
    if (Number.isNaN(jobId)) {
      bot.chat('Usage: !agent status [jobId]');
      return;
    }
  } else {
    jobId = jobState.currentJobId;
    if (jobId == null) {
      bot.chat('No job currently running. Usage: !agent status <jobId>');
      return;
    }
  }

  const status = jobManager.getStatus(jobId);
  if (!status) {
    bot.chat(`Job #${jobId} not found.`);
    return;
  }
  bot.chat(`Job #${status.id} [${status.status}] ${status.completed_actions}/${status.total_actions ?? '?'} actions complete`);
}

function handleCancel(bot, args, username, jobManager, admins) {
  if (args.length !== 1 || !args[0]) {
    bot.chat('Usage: !agent cancel <jobId>');
    return;
  }
  const jobId = Number(args[0]);
  if (Number.isNaN(jobId)) {
    bot.chat('Job id must be a number.');
    return;
  }

  try {
    jobManager.cancel(jobId, username, admins.has(username));
    bot.chat(`Job #${jobId} cancelled.`);
  } catch (err) {
    bot.chat(`Cannot cancel job #${jobId}: ${err.message}`);
  }
}

function handleStop(bot, username, admins, jobManager, jobState) {
  if (!admins.has(username)) {
    bot.chat(`Sorry ${username}, only admins can stop the current job.`);
    return;
  }
  if (jobState.currentJobId == null) {
    bot.chat('No job currently running.');
    return;
  }
  jobManager.markJobStatus(jobState.currentJobId, 'stopping');
  bot.chat(`Job #${jobState.currentJobId} will stop after its current action.`);
}

module.exports = { registerCommands };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mineflayer/mineflayer-agent && node --test test/commands.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add mineflayer/mineflayer-agent/src/commands.js mineflayer/mineflayer-agent/test/commands.test.js
git commit -m "feat(mineflayer-agent): add !agent chat command layer for freeform task requests"
```

---

## Task 12: Entrypoint wiring (bot lifecycle, two-stage drain loop)

**Files:**
- Create: `mineflayer/mineflayer-agent/index.js`
- Create: `mineflayer/mineflayer-agent/.env.example`

**Interfaces:**
- Consumes: `JobManager` (Task 1), all tool modules (Tasks 3, 4, 7 — required for their `registerTool` side effects), `ExecutionEngine` (Task 8), `getProvider` (Task 9), `planJob` (Task 10), `registerCommands` (Task 11).
- Produces: the runnable bot process. No further tasks depend on this one — it's the final wiring task.

This task has no unit test (it's wiring/IO, matching the existing flatten bot's `index.js`, which is also untested directly — its logic is covered by testing `db.js`, `executionEngine.js`, `commands.js`, and now `planner.js` in isolation). Verify it manually per Step 4.

- [ ] **Step 1: Create .env.example**

```
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEY=
OPENROUTER_API_KEY=
```

- [ ] **Step 2: Implement index.js**

```js
const path = require('path');
require('dotenv').config();
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const JobManager = require('./src/db');
const ExecutionEngine = require('./src/executionEngine');
const { registerCommands } = require('./src/commands');
const { getProvider } = require('./src/llm/provider');
const { planJob } = require('./src/planner');

// Registers every tool as a side effect of requiring it (registerTool call at module load).
require('./src/tools/flatten');
require('./src/tools/buildWall');
require('./src/tools/buildBox');
require('./src/tools/buildSchematic');

// ---- CONFIG ----
const HOST = 'localhost';
const PORT = 25564;
const MC_VERSION = '1.21.11';
const AUTH = 'microsoft';
const BOT_USERNAME = 'BjornViking206'; // <-- fill in

const WHITELIST = new Set([
  'SlayerL99' // <-- fill in your real in-game name
]);

const ADMINS = new Set([
  'SlayerL99'
]);

const DB_PATH = path.join(__dirname, 'jobs.db');
const LLM_PROVIDER_NAME = process.env.LLM_PROVIDER || 'gemini';

function createBot() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: BOT_USERNAME,
    auth: AUTH,
    version: MC_VERSION,
    checkTimeoutInterval: 150000
  });

  bot.loadPlugin(pathfinder);

  const jobManager = new JobManager(DB_PATH);
  const executionEngine = new ExecutionEngine(bot, jobManager);
  const provider = getProvider(LLM_PROVIDER_NAME);

  const jobState = { currentJobId: null };
  let processing = false;

  function worldContextFor() {
    return {
      botPosition: bot.entity ? { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z } : null,
      inventory: bot.inventory ? bot.inventory.items().map((i) => ({ name: i.name, count: i.count })) : [],
      blockAt: (pos) => bot.blockAt(pos)
    };
  }

  // Two-stage drain: first resolve every pending plan (LLM calls, cheap and
  // fast to fail), then run every queued job's actual block work. Keeps the
  // planning stage from blocking behind a long-running execution job.
  async function startProcessing() {
    if (processing) return;
    processing = true;
    try {
      while (await planJob(jobManager, provider, worldContextFor())) {
        // keep draining the planning queue
      }

      let job = jobManager.getNextQueuedJob();
      while (job) {
        jobManager.markRunning(job.id);
        jobState.currentJobId = job.id;
        try {
          await executionEngine.runJob(job.id);
        } catch (err) {
          console.error(`[agent] job ${job.id} crashed:`, err);
          jobManager.markJobStatus(job.id, 'failed');
        }
        jobState.currentJobId = null;
        job = jobManager.getNextQueuedJob();
      }
    } finally {
      processing = false;
    }
  }

  bot.once('spawn', () => {
    console.log('[agent] spawned in world');
    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);
    bot.chat('LLM agent online.');

    const interrupted = jobManager.getInterruptedJobs();
    for (const job of interrupted) {
      console.log(`[agent] requeuing interrupted job #${job.id}`);
      jobManager.markJobStatus(job.id, 'queued');
    }

    startProcessing().catch((err) => console.error('[agent] job processing error:', err));
  });

  registerCommands(bot, { jobManager, whitelist: WHITELIST, admins: ADMINS, startProcessing, jobState });

  bot.on('kicked', (reason) => console.log('[agent] kicked:', reason));
  bot.on('error', (err) => console.log('[agent] error:', err.message));
  bot.on('end', (reason) => {
    console.log('[agent] disconnected, reason:', reason);
    executionEngine.abort();
    jobManager.close();
    console.log('[agent] reconnecting in 5s...');
    setTimeout(createBot, 5000);
  });

  return bot;
}

createBot();
```

- [ ] **Step 3: Add dotenv dependency**

`dotenv` is used to load `.env` in Step 2 but wasn't in Task 1's `package.json`.

Run: `cd mineflayer/mineflayer-agent && npm install dotenv`
Expected: added to `dependencies`, `package-lock.json` updated.

- [ ] **Step 4: Manual smoke test**

Run: `cd mineflayer/mineflayer-agent && cp .env.example .env` then fill in `GEMINI_API_KEY` (or switch `LLM_PROVIDER=openrouter` + `OPENROUTER_API_KEY`), fill in `BOT_USERNAME`/`WHITELIST`/`ADMINS` in `index.js`, then: `node index.js`
Expected: bot connects, spawns, chats "LLM agent online." — this confirms wiring only; full end-to-end task planning/execution against a real server is manual hardening, not part of this plan.

- [ ] **Step 5: Run the full test suite one more time**

Run: `cd mineflayer/mineflayer-agent && node --test`
Expected: PASS — every test file from Tasks 1–11 passes together (catches any cross-task collisions, e.g. the shared tool registry being polluted by test-only tool names registered in Task 2's and Task 10's tests — if that happens, namespace those test tool names, e.g. `test_tool_planner_only`, to avoid clashing with a real tool name in the shared `Map`).

- [ ] **Step 6: Commit**

```bash
git add mineflayer/mineflayer-agent/index.js mineflayer/mineflayer-agent/.env.example mineflayer/mineflayer-agent/package.json mineflayer/mineflayer-agent/package-lock.json
git commit -m "feat(mineflayer-agent): wire up entrypoint with two-stage plan/execute drain loop"
```

---

## Post-plan: manual hardening

Not part of this plan (per the spec's "no live-server integration tests" constraint), but expected next step once all 12 tasks are merged: run the agent against the real server and validate each tool (`flatten_region`, `build_wall`, `build_box`, `build_schematic` with a real `.schem` and a real `.litematic` exported from Litematica) end-to-end with both LLM providers, following the same manual-checklist approach used to harden the existing flatten bot.
