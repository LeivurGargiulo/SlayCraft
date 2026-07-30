import type { FastifyInstance } from 'fastify';
import { mcfmFetch, McfmError } from '../mcfarmmanager.js';

export function registerMiscRoutes(app: FastifyInstance) {
  const proxy = (path: string) => async (_req: unknown, reply: import('fastify').FastifyReply) => {
    try {
      return await mcfmFetch(path);
    } catch (err) {
      if (err instanceof McfmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  };

  app.get('/api/players/live', proxy('/players'));
  app.get('/api/world', proxy('/world'));
  app.get('/api/performance', proxy('/performance'));
  app.get('/api/status', proxy('/status'));
}
