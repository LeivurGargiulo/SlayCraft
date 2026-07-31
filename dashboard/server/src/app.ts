import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import { ZodError } from 'zod';
import { isValidSession } from './auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerFarmRoutes } from './routes/farms.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerPlayerRoutes } from './routes/players.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerGalleryRoutes } from './routes/gallery.js';

export function buildApp(db: Database.Database, uploadsDir: string) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', trustProxy: true });
  const cookieSecret = process.env.COOKIE_SECRET ?? 'dev-secret-change-me';
  if (process.env.NODE_ENV === 'production' && !process.env.COOKIE_SECRET) {
    throw new Error('COOKIE_SECRET must be set in production');
  }

  app.register(cookie, { secret: cookieSecret });
  app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
  app.register(fastifyStatic, { root: uploadsDir, prefix: '/uploads/' });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'Datos inválidos' });
    const code = (err as { code?: string }).code ?? '';
    if (code.startsWith('SQLITE_CONSTRAINT'))
      return reply.code(409).send({ error: 'Ese registro ya existe o hace referencia a algo que no existe' });
    if (code === 'FST_REQ_FILE_TOO_LARGE')
      return reply.code(413).send({ error: 'La imagen es demasiado grande' });
    app.log.error(err);
    reply.code(500).send({ error: 'Error del servidor' });
  });

  app.addHook('preHandler', async (req, reply) => {
    const isProtected = req.url.startsWith('/api/') || req.url.startsWith('/uploads/');
    if (!isProtected || req.url === '/api/login') return;
    const raw = req.cookies.session;
    const unsigned = raw ? app.unsignCookie(raw) : null;
    if (!unsigned?.valid || !isValidSession(unsigned.value ?? undefined)) {
      reply.code(401).send({ error: 'No autenticado' });
    }
  });

  registerAuthRoutes(app, db);
  registerFarmRoutes(app, db, uploadsDir);
  registerMiscRoutes(app);
  registerTaskRoutes(app, db);
  registerPlayerRoutes(app, db);
  registerProjectRoutes(app, db, uploadsDir);
  registerGalleryRoutes(app, db, uploadsDir);

  return app;
}
