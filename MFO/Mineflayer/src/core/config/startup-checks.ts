import { ConfigValidationError } from '../../shared/errors/config-validation-error.js';

const MIN_JWT_SECRET_LENGTH = 32;

export function resolveJwtSecret(rawSecret: string | undefined): string {
  if (rawSecret === undefined || rawSecret.length === 0) {
    throw new ConfigValidationError('JWT_SECRET', [
      'must be set (see .env.example) — the REST API and WebSocket layer require it to authenticate every request',
    ]);
  }
  if (rawSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new ConfigValidationError('JWT_SECRET', [
      `must be at least ${String(MIN_JWT_SECRET_LENGTH)} characters to be a real secret, not just non-empty (got ${String(rawSecret.length)})`,
    ]);
  }
  return rawSecret;
}
