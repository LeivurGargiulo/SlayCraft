import type { FastifyInstance } from 'fastify';
import {
  averageFillPercent,
  getAlerts,
  getHealthHistory,
  getLatestHealth,
  getLatestProduction,
  getLatestStorageBatch,
  getProductionHistory,
  getWorkerStatus,
} from '../../database/queries.js';
import type { RestApiDeps } from './deps.js';

export function parseLimit(raw: unknown, fallback: number, max = 200): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/** Nested /farm/{id}/... routes per ARCHITECTURE.md's REST API shape (confirmed with the user over TECHNICAL_SPEC §17's flatter alternative). */
export function registerFarmRoutes(app: FastifyInstance, deps: RestApiDeps): void {
  const { db, farmRegistry } = deps;

  app.get('/farms', () =>
    farmRegistry.getAll().map((farm) => ({
      id: farm.id,
      dimension: farm.dimension,
      teleport: farm.teleport,
      carpetWorker: farm.carpetWorker,
      containerCount: farm.containers.length,
    })),
  );

  app.get<{ Params: { id: string } }>('/farm/:id', (request, reply) => {
    const farm = farmRegistry.get(request.params.id);
    if (!farm) return reply.code(404).send({ error: 'farm not found' });

    return {
      id: farm.id,
      dimension: farm.dimension,
      teleport: farm.teleport,
      carpetWorker: farm.carpetWorker,
      containerCount: farm.containers.length,
      health: getLatestHealth(db, farm.id) ?? null,
      worker: getWorkerStatus(db, farm.id) ?? null,
    };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/farm/:id/health',
    (request, reply) => {
      const farm = farmRegistry.get(request.params.id);
      if (!farm) return reply.code(404).send({ error: 'farm not found' });
      return getHealthHistory(db, farm.id, parseLimit(request.query.limit, 1));
    },
  );

  app.get<{ Params: { id: string } }>('/farm/:id/storage', (request, reply) => {
    const farm = farmRegistry.get(request.params.id);
    if (!farm) return reply.code(404).send({ error: 'farm not found' });
    return getLatestStorageBatch(db, farm.id, farm.containers.length);
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/farm/:id/production',
    (request, reply) => {
      const farm = farmRegistry.get(request.params.id);
      if (!farm) return reply.code(404).send({ error: 'farm not found' });
      return getProductionHistory(db, farm.id, parseLimit(request.query.limit, 1));
    },
  );

  app.get<{ Params: { id: string } }>('/farm/:id/metrics', (request, reply) => {
    const farm = farmRegistry.get(request.params.id);
    if (!farm) return reply.code(404).send({ error: 'farm not found' });

    const storageBatch = getLatestStorageBatch(db, farm.id, farm.containers.length);

    return {
      farmId: farm.id,
      health: getLatestHealth(db, farm.id)?.status ?? 'UNKNOWN',
      storageFillPercent: averageFillPercent(storageBatch),
      production: getLatestProduction(db, farm.id) ?? null,
      worker: getWorkerStatus(db, farm.id) ?? null,
    };
  });

  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/farm/:id/alerts',
    (request, reply) => {
      const farm = farmRegistry.get(request.params.id);
      if (!farm) return reply.code(404).send({ error: 'farm not found' });
      return getAlerts(db, farm.id, parseLimit(request.query.limit, 50));
    },
  );

  app.get<{ Params: { id: string } }>('/farm/:id/worker', (request, reply) => {
    const farm = farmRegistry.get(request.params.id);
    if (!farm) return reply.code(404).send({ error: 'farm not found' });
    return getWorkerStatus(db, farm.id) ?? null;
  });
}
