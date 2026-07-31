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
