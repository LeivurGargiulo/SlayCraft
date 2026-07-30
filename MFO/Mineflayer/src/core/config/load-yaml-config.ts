import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import { ConfigValidationError } from '../../shared/errors/config-validation-error.js';

export function loadYamlConfig<Schema extends z.ZodType>(
  filePath: string,
  schema: Schema,
): z.infer<Schema> {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (cause) {
    throw new ConfigValidationError(filePath, [`could not read file: ${(cause as Error).message}`]);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (cause) {
    throw new ConfigValidationError(filePath, [`invalid YAML: ${(cause as Error).message}`]);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new ConfigValidationError(filePath, issues);
  }

  return result.data;
}
