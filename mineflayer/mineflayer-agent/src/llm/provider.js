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
