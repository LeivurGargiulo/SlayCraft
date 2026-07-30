import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRestApi } from '../../../src/api/rest/server.js';
import type { RestApiDeps } from '../../../src/api/rest/deps.js';
import { createDatabase } from '../../../src/database/client.js';
import { users } from '../../../src/database/schema.js';
import { FarmRegistry } from '../../../src/core/registry/farm-registry.js';
import { Scheduler } from '../../../src/core/scheduler/scheduler.js';
import { AlertService } from '../../../src/services/alerts/alert-service.js';
import { AuthService } from '../../../src/services/auth/auth-service.js';
import { EventBus } from '../../../src/core/event-bus/event-bus.js';
import type { AppEventMap } from '../../../src/core/event-bus/events.js';
import { createLogger } from '../../../src/core/logger/logger.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

async function buildDeps(): Promise<RestApiDeps> {
  const logger = createSilentLogger();
  const { db } = createDatabase(':memory:');
  db.insert(users)
    .values({
      username: 'tester',
      passwordHash: await AuthService.hashPassword('password'),
      role: 'admin',
      createdAt: new Date(),
    })
    .run();

  return {
    db,
    farmRegistry: new FarmRegistry({ farms: {} }),
    scheduler: new Scheduler(logger),
    alertService: new AlertService(new EventBus<AppEventMap>(), db, logger, {
      storageWarningPercent: 90,
      storageFullPercent: 100,
    }),
    authService: new AuthService({ db, jwtSecret: 'test-secret', jwtExpiry: '1h', logger }),
    dashboardDistDirectory: '/tmp/mfo-test-dashboard-dist-does-not-exist',
    enqueueScan: () => 'unused-correlation-id',
    logger,
  };
}

describe('REST API auth', () => {
  it('issues a token for correct credentials', async () => {
    const app = createRestApi(await buildDeps());
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'tester', password: 'password' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('token');
  });

  it('rejects an incorrect password', async () => {
    const app = createRestApi(await buildDeps());
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'tester', password: 'wrong' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects requests to every other route without a token', async () => {
    const app = createRestApi(await buildDeps());
    const response = await app.inject({ method: 'GET', url: '/farms' });

    expect(response.statusCode).toBe(401);
  });

  it('rejects requests with a malformed Authorization header', async () => {
    const app = createRestApi(await buildDeps());
    const response = await app.inject({
      method: 'GET',
      url: '/farms',
      headers: { authorization: 'not-a-bearer-token' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('allows requests with a valid token', async () => {
    const deps = await buildDeps();
    const app = createRestApi(deps);
    const token = await deps.authService.login('tester', 'password');

    const response = await app.inject({
      method: 'GET',
      url: '/farms',
      headers: { authorization: `Bearer ${String(token)}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});

describe('dashboard static serving', () => {
  it('falls back to a plain 404 when no dashboard build is present', async () => {
    const app = createRestApi(await buildDeps());
    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(404);
  });

  it('serves the built dashboard shell unauthenticated, without shadowing real API routes', async () => {
    const distDir = mkdtempSync(join(tmpdir(), 'mfo-test-dashboard-dist-'));
    writeFileSync(join(distDir, 'index.html'), '<html>dashboard shell</html>');
    const deps = await buildDeps();
    const app = createRestApi({ ...deps, dashboardDistDirectory: distDir });

    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('dashboard shell');

    /** `/farm/:id` is a real, auth-guarded API route — it must never be shadowed by a generic SPA fallback, even though the dashboard's own client-side router uses the same path shape. */
    const api = await app.inject({ method: 'GET', url: '/farm/iron' });
    expect(api.statusCode).toBe(401);
  });
});
