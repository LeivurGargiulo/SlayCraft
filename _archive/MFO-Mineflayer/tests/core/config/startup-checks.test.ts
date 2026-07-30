import { describe, expect, it } from 'vitest';
import { resolveJwtSecret } from '../../../src/core/config/startup-checks.js';
import { ConfigValidationError } from '../../../src/shared/errors/config-validation-error.js';

describe('resolveJwtSecret', () => {
  it('rejects an unset secret', () => {
    expect(() => resolveJwtSecret(undefined)).toThrow(ConfigValidationError);
  });

  it('rejects an empty secret', () => {
    expect(() => resolveJwtSecret('')).toThrow(ConfigValidationError);
  });

  it('rejects a secret shorter than 32 characters', () => {
    expect(() => resolveJwtSecret('short')).toThrow(ConfigValidationError);
  });

  it('accepts a secret of at least 32 characters', () => {
    const secret = 'a'.repeat(32);
    expect(resolveJwtSecret(secret)).toBe(secret);
  });
});
