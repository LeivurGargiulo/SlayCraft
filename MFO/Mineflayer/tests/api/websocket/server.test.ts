import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { attachWebSocket } from '../../../src/api/websocket/server.js';
import { EventBus } from '../../../src/core/event-bus/event-bus.js';
import type { AppEventMap } from '../../../src/core/event-bus/events.js';
import { createLogger } from '../../../src/core/logger/logger.js';
import { AuthService } from '../../../src/services/auth/auth-service.js';
import { createDatabase } from '../../../src/database/client.js';
import { users } from '../../../src/database/schema.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

describe('attachWebSocket', () => {
  it('republishes internal events (e.g. FarmHealthChanged) to connected clients', async () => {
    const httpServer = createServer();
    const eventBus = new EventBus<AppEventMap>();
    const { db } = createDatabase(':memory:');
    db.insert(users)
      .values({
        username: 'tester',
        passwordHash: await AuthService.hashPassword('password'),
        role: 'admin',
        createdAt: new Date(),
      })
      .run();
    const authService = new AuthService({
      db,
      jwtSecret: 'test-secret',
      jwtExpiry: '1h',
      logger: createSilentLogger(),
    });
    const { close } = attachWebSocket(httpServer, eventBus, authService, createSilentLogger());

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('expected a TCP address');

    const token = await authService.login('tester', 'password');
    const client = ioClient(`http://127.0.0.1:${String(address.port)}`, { auth: { token } });
    await new Promise<void>((resolve) => client.on('connect', resolve));

    const received = new Promise((resolve) => client.on('FarmHealthChanged', resolve));
    eventBus.publish('FarmHealthChanged', {
      occurredAt: new Date(),
      farmId: 'iron',
      status: 'HEALTHY',
    });

    await expect(received).resolves.toMatchObject({ farmId: 'iron', status: 'HEALTHY' });

    client.close();
    await close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        resolve();
      });
    });
  });
});
