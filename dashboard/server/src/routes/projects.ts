import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const projectInput = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.string().min(1).default('active'),
  coordinates: z.string().nullable().optional(),
});

interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  status: string;
  coordinates: string | null;
  created_at: string;
}

function getImages(db: Database.Database, projectId: number) {
  return db.prepare('SELECT * FROM project_images WHERE project_id = ? ORDER BY sort_order').all(projectId);
}

export function registerProjectRoutes(app: FastifyInstance, db: Database.Database, uploadsDir: string) {
  app.get('/api/projects', async () => {
    const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];
    return { projects: projects.map((p) => ({ ...p, images: getImages(db, p.id) })) };
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    if (!project) return reply.code(404).send({ error: 'Proyecto no encontrado' });
    return { ...project, images: getImages(db, id) };
  });

  app.post('/api/projects', async (req, reply) => {
    const body = projectInput.parse(req.body);
    const info = db
      .prepare('INSERT INTO projects (name, description, status, coordinates) VALUES (?, ?, ?, ?)')
      .run(body.name, body.description ?? null, body.status, body.coordinates ?? null);
    reply.code(201);
    return { ...(db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid) as ProjectRow), images: [] };
  });

  app.patch('/api/projects/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    if (!existing) return reply.code(404).send({ error: 'Proyecto no encontrado' });
    const body = projectInput.partial().parse(req.body);
    db.prepare('UPDATE projects SET name=@name, description=@description, status=@status, coordinates=@coordinates WHERE id=@id').run({
      id,
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      status: body.status ?? existing.status,
      coordinates: body.coordinates !== undefined ? body.coordinates : existing.coordinates,
    });
    return { ...(db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow), images: getImages(db, id) };
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    for (const img of getImages(db, id) as Array<{ path: string }>) {
      fs.rmSync(path.join(uploadsDir, img.path), { force: true });
    }
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });

  app.post('/api/projects/:id/images', async (req, reply) => {
    const projectId = Number((req.params as { id: string }).id);
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
      .prepare('INSERT INTO project_images (project_id, path, caption, sort_order) VALUES (?, ?, ?, 0)')
      .run(projectId, filename, caption);
    reply.code(201);
    return db.prepare('SELECT * FROM project_images WHERE id = ?').get(info.lastInsertRowid);
  });

  app.delete('/api/project-images/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const img = db.prepare('SELECT * FROM project_images WHERE id = ?').get(id) as { path: string } | undefined;
    if (img) fs.rmSync(path.join(uploadsDir, img.path), { force: true });
    db.prepare('DELETE FROM project_images WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });
}
