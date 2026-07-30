import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import { isValidSession } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerFarmRoutes } from './routes/farms.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerTaskRoutes } from './routes/tasks.js';

export function buildApp(db: Database.Database, uploadsDir: string) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  const cookieSecret = process.env.COOKIE_SECRET ?? 'dev-secret-change-me';

  app.register(cookie, { secret: cookieSecret });
  app.register(multipart);
  app.register(fastifyStatic, { root: uploadsDir, prefix: '/uploads/' });

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/login') return;
    const raw = req.cookies.session;
    const unsigned = raw ? app.unsignCookie(raw) : null;
    if (!unsigned?.valid || !isValidSession(unsigned.value ?? undefined)) {
      reply.code(401).send({ error: 'No autenticado' });
    }
  });

  registerAuthRoutes(app, db);
  registerFarmRoutes(app, db);
  registerMiscRoutes(app);
  registerTaskRoutes(app, db);

  return app;
}
