import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { mcfmFetch, McfmError } from '../mcfarmmanager.js';

interface FarmMetadataRow {
  farm_id: string;
  notes: string | null;
  tags: string | null;
}

function getMetadata(db: Database.Database, farmId: string) {
  const row = db.prepare('SELECT notes, tags FROM farm_metadata WHERE farm_id = ?').get(farmId) as
    | FarmMetadataRow
    | undefined;
  return { notes: row?.notes ?? null, tags: row?.tags ? row.tags.split(',').filter(Boolean) : [] };
}

async function withMcfm<T>(reply: import('fastify').FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof McfmError) return reply.code(err.status === 404 ? 404 : 502).send({ error: err.message });
    throw err;
  }
}

const metadataSchema = z.object({
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export function registerFarmRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/farms', async (_req, reply) =>
    withMcfm(reply, async () => {
      const data = (await mcfmFetch('/farms')) as { farms: Array<{ id: string }> };
      return { farms: data.farms.map((f) => ({ ...f, metadata: getMetadata(db, f.id) })) };
    })
  );

  app.get('/api/farms/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return withMcfm(reply, async () => {
      const farm = (await mcfmFetch(`/farms/${encodeURIComponent(id)}`)) as Record<string, unknown>;
      return { ...farm, metadata: getMetadata(db, id) };
    });
  });

  app.get('/api/farms/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { range } = req.query as { range?: string };
    return withMcfm(reply, () => mcfmFetch(`/farms/${encodeURIComponent(id)}/history?range=${encodeURIComponent(range ?? '24h')}`));
  });

  app.patch('/api/farms/:id/metadata', async (req) => {
    const { id } = req.params as { id: string };
    const body = metadataSchema.parse(req.body);
    db.prepare(
      `INSERT INTO farm_metadata (farm_id, notes, tags) VALUES (?, ?, ?)
       ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, tags = excluded.tags`
    ).run(id, body.notes ?? null, body.tags ? body.tags.join(',') : null);
    return { ok: true, metadata: getMetadata(db, id) };
  });
}
