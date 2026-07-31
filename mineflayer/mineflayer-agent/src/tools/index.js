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
