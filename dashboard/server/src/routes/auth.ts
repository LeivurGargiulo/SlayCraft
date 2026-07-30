import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { verifyPassword, createSession, destroySession } from '../auth.js';

const loginSchema = z.object({ password: z.string().min(1) });

export function registerAuthRoutes(app: FastifyInstance, db: Database.Database) {
  app.post('/api/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = 1').get() as
      | { password_hash: string }
      | undefined;
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      return reply.code(401).send({ error: 'Contraseña incorrecta' });
    }
    const token = createSession();
    reply.setCookie('session', token, { httpOnly: true, sameSite: 'lax', path: '/', signed: true });
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
