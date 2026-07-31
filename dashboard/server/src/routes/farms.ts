import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { mcfmFetch, McfmError } from '../mcfarmmanager.js';

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

interface FarmMetadataRow {
  farm_id: string;
  notes: string | null;
  tags: string | null;
  coordinates: string | null;
  expected_rates: string | null;
}

function getMetadata(db: Database.Database, farmId: string) {
  const row = db.prepare('SELECT notes, tags, coordinates, expected_rates FROM farm_metadata WHERE farm_id = ?').get(farmId) as
    | FarmMetadataRow
    | undefined;
  return {
    notes: row?.notes ?? null,
    tags: row?.tags ? row.tags.split(',').filter(Boolean) : [],
    coordinates: row?.coordinates ?? null,
    expected_rates: row?.expected_rates ? JSON.parse(row.expected_rates) : {},
  };
}

function getImages(db: Database.Database, farmId: string) {
  return db.prepare('SELECT * FROM farm_images WHERE farm_id = ? ORDER BY sort_order').all(farmId);
}

const PRODUCING_WINDOW_MS = 15 * 60 * 1000;

async function isProducing(id: string): Promise<boolean> {
  const data = (await mcfmFetch(`/farms/${encodeURIComponent(id)}/history?range=1h`)) as {
    samples: Array<{ sampledAt: string; storageCounts: Record<string, number> }>;
  };
  if (!Array.isArray(data.samples) || data.samples.length < 2) return false;
  const last = data.samples[data.samples.length - 1];
  const windowStart = new Date(last.sampledAt).getTime() - PRODUCING_WINDOW_MS;
  const baseline = data.samples.find((s) => new Date(s.sampledAt).getTime() >= windowStart) ?? last;
  return Object.entries(last.storageCounts).some(
    ([itemId, count]) => count > (baseline.storageCounts[itemId] ?? 0)
  );
}

async function withMcfm<T>(reply: import('fastify').FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof McfmError) {
      const code = [400, 403, 404, 409].includes(err.status) ? err.status : 502;
      return reply.code(code).send({ error: err.message });
    }
    throw err;
  }
}

const metadataSchema = z.object({
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  coordinates: z.string().nullable().optional(),
  expected_rates: z.record(z.string(), z.number()).optional(),
});

const positionSchema = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() });

const farmConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dimension: z.string().min(1),
  anchor: positionSchema,
  entityScanRadius: z.number().int(),
  fakePlayerName: z.string().nullable(),
  storage: z.array(z.object({ id: z.string(), label: z.string(), position: positionSchema })),
  afkSpot: z.object({ position: positionSchema, radius: z.number().int() }).nullable(),
});

export function registerFarmRoutes(app: FastifyInstance, db: Database.Database, uploadsDir: string) {
  app.get('/api/farms', async (_req, reply) =>
    withMcfm(reply, async () => {
      const data = (await mcfmFetch('/farms')) as { farms: Array<{ id: string; occupantCount: number }> };
      const farms = await Promise.all(
        data.farms.map(async (f) => ({
          ...f,
          online: f.occupantCount > 0 || (await isProducing(f.id)),
          metadata: getMetadata(db, f.id),
          images: getImages(db, f.id),
        }))
      );
      return { farms };
    })
  );

  app.get('/api/farms/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return withMcfm(reply, async () => {
      const farm = (await mcfmFetch(`/farms/${encodeURIComponent(id)}`)) as Record<string, unknown> & { occupantCount: number };
      return { ...farm, online: farm.occupantCount > 0 || (await isProducing(id)), metadata: getMetadata(db, id), images: getImages(db, id) };
    });
  });

  app.get('/api/farms/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { range } = req.query as { range?: string };
    return withMcfm(reply, () => mcfmFetch(`/farms/${encodeURIComponent(id)}/history?range=${encodeURIComponent(range ?? '24h')}`));
  });

  app.post('/api/farms', async (req, reply) => {
    const body = farmConfigSchema.parse(req.body);
    return withMcfm(reply, async () => {
      const created = await mcfmFetch('/farms', { method: 'POST', body });
      reply.code(201);
      return created;
    });
  });

  app.put('/api/farms/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = farmConfigSchema.parse(req.body);
    if (body.id !== id) return reply.code(400).send({ error: 'El id del cuerpo debe coincidir con el de la URL' });
    return withMcfm(reply, () => mcfmFetch(`/farms/${encodeURIComponent(id)}`, { method: 'PUT', body }));
  });

  app.delete('/api/farms/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return withMcfm(reply, async () => {
      await mcfmFetch(`/farms/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const images = db.prepare('SELECT * FROM farm_images WHERE farm_id = ?').all(id) as Array<{ path: string }>;
      for (const img of images) fs.rmSync(path.join(uploadsDir, img.path), { force: true });
      db.prepare('DELETE FROM farm_images WHERE farm_id = ?').run(id);
      db.prepare('DELETE FROM farm_metadata WHERE farm_id = ?').run(id);
      reply.code(204);
      return null;
    });
  });

  app.patch('/api/farms/:id/metadata', async (req) => {
    const { id } = req.params as { id: string };
    const body = metadataSchema.parse(req.body);
    db.prepare(
      `INSERT INTO farm_metadata (farm_id, notes, tags, coordinates, expected_rates) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, tags = excluded.tags, coordinates = excluded.coordinates, expected_rates = excluded.expected_rates`
    ).run(
      id,
      body.notes ?? null,
      body.tags ? body.tags.join(',') : null,
      body.coordinates ?? null,
      body.expected_rates ? JSON.stringify(body.expected_rates) : null
    );
    return { ok: true, metadata: getMetadata(db, id) };
  });

  app.post('/api/farms/:id/images', async (req, reply) => {
    const farmId = (req.params as { id: string }).id;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Falta el archivo' });
    const ext = path.extname(file.filename).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      await file.toBuffer();
      return reply.code(400).send({ error: 'Formato de imagen no permitido' });
    }
    const filename = `${crypto.randomUUID()}${ext}`;
    await fs.promises.writeFile(path.join(uploadsDir, filename), await file.toBuffer());
    const caption = (file.fields.caption as { value?: string } | undefined)?.value ?? null;
    const info = db
      .prepare('INSERT INTO farm_images (farm_id, path, caption, sort_order) VALUES (?, ?, ?, 0)')
      .run(farmId, filename, caption);
    reply.code(201);
    return db.prepare('SELECT * FROM farm_images WHERE id = ?').get(info.lastInsertRowid);
  });

  app.delete('/api/farm-images/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const img = db.prepare('SELECT * FROM farm_images WHERE id = ?').get(id) as { path: string } | undefined;
    if (img) fs.rmSync(path.join(uploadsDir, img.path), { force: true });
    db.prepare('DELETE FROM farm_images WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });
}
