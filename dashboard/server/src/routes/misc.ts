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

  app.get('/api/performance/history', async (req, reply) => {
    const { range } = req.query as { range?: string };
    try {
      return await mcfmFetch(`/performance/history?range=${encodeURIComponent(range ?? '24h')}`);
    } catch (err) {
      if (err instanceof McfmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  });

  app.get('/api/search', async (req, reply) => {
    const { item } = req.query as { item?: string };
    try {
      return await mcfmFetch(`/search?item=${encodeURIComponent(item ?? '')}`);
    } catch (err) {
      if (err instanceof McfmError) return reply.code(502).send({ error: err.message });
      throw err;
    }
  });

  app.get('/api/alerts', proxy('/alerts'));

  app.post('/api/alerts/:id/dismiss', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      return await mcfmFetch(`/alerts/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
    } catch (err) {
      if (err instanceof McfmError) {
        const code = err.status === 404 ? 404 : 502;
        return reply.code(code).send({ error: err.message });
      }
      throw err;
    }
  });
}
