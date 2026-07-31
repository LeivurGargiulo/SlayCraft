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
