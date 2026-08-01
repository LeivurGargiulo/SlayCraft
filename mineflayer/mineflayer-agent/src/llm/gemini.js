const { GoogleGenAI } = require('@google/genai');

// Gemini's function-declaration Schema proto stores `enum` as repeated
// string regardless of the property's declared `type`, so numeric enums
// must be sent as strings and coerced back after the call returns.
function stringifyEnums(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = { ...schema };
  if (Array.isArray(out.enum)) out.enum = out.enum.map(String);
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, stringifyEnums(v)])
    );
  }
  return out;
}

function coerceEnumArgs(args, argsSchema) {
  if (!argsSchema || !argsSchema.properties) return args;
  const out = { ...args };
  for (const [key, propSchema] of Object.entries(argsSchema.properties)) {
    const isNumeric = propSchema.type === 'integer' || propSchema.type === 'number';
    if (propSchema.enum && isNumeric && typeof out[key] === 'string') {
      out[key] = Number(out[key]);
    }
  }
  return out;
}

function toGeminiFunctionDeclarations(toolSchemas) {
  return toolSchemas.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: stringifyEnums(t.argsSchema)
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
  const matchingSchema = toolSchemas.find((t) => t.name === call.name);
  return { tool: call.name, args: coerceEnumArgs(call.args, matchingSchema && matchingSchema.argsSchema) };
}

module.exports = { plan };
