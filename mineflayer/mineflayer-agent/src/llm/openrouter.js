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
