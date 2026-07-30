import { describe, expect, it } from 'vitest';
import { AuthService } from '../../../src/services/auth/auth-service.js';
import { createDatabase } from '../../../src/database/client.js';
import { users } from '../../../src/database/schema.js';
import { createLogger } from '../../../src/core/logger/logger.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

async function buildService(jwtSecret = 'test-secret') {
  const { db } = createDatabase(':memory:');
  db.insert(users)
    .values({
      username: 'tester',
      passwordHash: await AuthService.hashPassword('password'),
      role: 'viewer',
      createdAt: new Date(),
    })
    .run();
  return new AuthService({ db, jwtSecret, jwtExpiry: '1h', logger: createSilentLogger() });
}

describe('AuthService', () => {
  it('returns a token that verifies back to the same user for correct credentials', async () => {
    const service = await buildService();
    const token = await service.login('tester', 'password');

    expect(token).toBeDefined();
    expect(service.verifyToken(token ?? '')).toMatchObject({
      username: 'tester',
      role: 'viewer',
    });
  });

  it('returns undefined for an unknown username', async () => {
    const service = await buildService();
    await expect(service.login('nobody', 'password')).resolves.toBeUndefined();
  });

  it('returns undefined for a wrong password', async () => {
    const service = await buildService();
    await expect(service.login('tester', 'wrong')).resolves.toBeUndefined();
  });

  it('rejects a token signed with a different secret', async () => {
    const issuer = await buildService('secret-a');
    const verifier = await buildService('secret-b');
    const token = await issuer.login('tester', 'password');

    expect(verifier.verifyToken(token ?? '')).toBeUndefined();
  });

  it('rejects garbage tokens', async () => {
    const service = await buildService();
    expect(service.verifyToken('not-a-jwt')).toBeUndefined();
  });
});
