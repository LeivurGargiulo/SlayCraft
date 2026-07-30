import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

export function registerGalleryRoutes(app: FastifyInstance, db: Database.Database, uploadsDir: string) {
  app.get('/api/gallery', async () => ({
    images: db.prepare('SELECT * FROM gallery_images ORDER BY created_at DESC').all(),
  }));

  app.post('/api/gallery', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Falta el archivo' });
    const ext = path.extname(file.filename);
    const filename = `${crypto.randomUUID()}${ext}`;
    await fs.promises.writeFile(path.join(uploadsDir, filename), await file.toBuffer());
    const caption = (file.fields.caption as { value?: string } | undefined)?.value ?? null;
    const info = db.prepare('INSERT INTO gallery_images (path, caption) VALUES (?, ?)').run(filename, caption);
    reply.code(201);
    return db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(info.lastInsertRowid);
  });

  app.patch('/api/gallery/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ caption: z.string().nullable() }).parse(req.body);
    const existing = db.prepare('SELECT id FROM gallery_images WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Imagen no encontrada' });
    db.prepare('UPDATE gallery_images SET caption = ? WHERE id = ?').run(body.caption, id);
    return db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
  });

  app.delete('/api/gallery/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const img = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id) as { path: string } | undefined;
    if (img) fs.rmSync(path.join(uploadsDir, img.path), { force: true });
    db.prepare('DELETE FROM gallery_images WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });
}
