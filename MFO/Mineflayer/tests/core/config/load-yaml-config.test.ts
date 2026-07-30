import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadYamlConfig } from '../../../src/core/config/load-yaml-config.js';
import { ConfigValidationError } from '../../../src/shared/errors/config-validation-error.js';

const schema = z.object({ name: z.string().min(1), port: z.number().int() });

describe('loadYamlConfig', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mfo-config-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('parses and validates a well-formed YAML file', () => {
    const file = join(dir, 'valid.yml');
    writeFileSync(file, 'name: manager\nport: 25565\n');

    expect(loadYamlConfig(file, schema)).toEqual({ name: 'manager', port: 25565 });
  });

  it('throws a descriptive ConfigValidationError for schema violations', () => {
    const file = join(dir, 'invalid.yml');
    writeFileSync(file, 'name: manager\nport: "not-a-number"\n');

    expect(() => loadYamlConfig(file, schema)).toThrow(ConfigValidationError);
    try {
      loadYamlConfig(file, schema);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as ConfigValidationError).issues.some((issue) => issue.includes('port'))).toBe(
        true,
      );
    }
  });

  it('throws a descriptive ConfigValidationError for malformed YAML', () => {
    const file = join(dir, 'broken.yml');
    writeFileSync(file, 'name: [unterminated\n');

    expect(() => loadYamlConfig(file, schema)).toThrow(ConfigValidationError);
  });

  it('throws a descriptive ConfigValidationError when the file is missing', () => {
    const file = join(dir, 'missing.yml');

    expect(() => loadYamlConfig(file, schema)).toThrow(ConfigValidationError);
  });
});
