import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RestApiDeps } from './deps.js';

const scanBodySchema = z.object({ farmId: z.string().min(1).optional() });
const alertAckBodySchema = z.object({ alertId: z.number().int().positive() });

/** POST /scan, /alert/ack (ARCHITECTURE.md) — commands become jobs, mirroring Discord's adapter (TECHNICAL_SPEC §16). */
export function registerCommandRoutes(app: FastifyInstance, deps: RestApiDeps): void {
  const { farmRegistry, alertService, enqueueScan } = deps;

  app.post('/scan', async (request, reply) => {
    const parsed = scanBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    if (parsed.data.farmId !== undefined) {
      const farm = farmRegistry.get(parsed.data.farmId);
      if (!farm) return reply.code(404).send({ error: 'farm not found' });
      return reply.code(202).send({ correlationIds: [enqueueScan(farm)] });
    }

    return reply
      .code(202)
      .send({ correlationIds: farmRegistry.getAll().map((farm) => enqueueScan(farm)) });
  });

  app.post('/alert/ack', async (request, reply) => {
    const parsed = alertAckBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    if (!alertService.acknowledge(parsed.data.alertId)) {
      return reply.code(404).send({ error: 'alert not found or not open' });
    }
    return reply.code(200).send({ acknowledged: true });
  });
}
