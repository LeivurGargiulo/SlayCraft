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
