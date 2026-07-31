import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { verifyPassword, createSession, destroySession, isLockedOut, recordLoginFailure, clearLoginFailures } from '../auth.js';

const loginSchema = z.object({ password: z.string().min(1) });

export function registerAuthRoutes(app: FastifyInstance, db: Database.Database) {
  app.post('/api/login', async (req, reply) => {
    if (isLockedOut(req.ip)) {
      return reply.code(429).send({ error: 'Demasiados intentos. Probá de nuevo en un minuto.' });
    }
    const body = loginSchema.parse(req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as
      | { password_hash: string }
      | undefined;
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      recordLoginFailure(req.ip);
      return reply.code(401).send({ error: 'Contraseña incorrecta' });
    }
    clearLoginFailures(req.ip);
    const token = createSession();
    reply.setCookie('session', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      signed: true,
      secure: process.env.NODE_ENV === 'production',
    });
    return { ok: true };
  });

  app.post('/api/logout', async (req, reply) => {
    const raw = req.cookies.session;
    if (raw) {
      const unsigned = app.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) destroySession(unsigned.value);
    }
    reply.clearCookie('session', { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async () => ({ ok: true }));
}
