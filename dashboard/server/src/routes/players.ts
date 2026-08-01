import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const ACTIVIDADES = ['activo', 'ocasional', 'inactivo'] as const;

const playerInput = z.object({
  minecraft_name: z.string().min(1),
  note: z.string().nullable().optional(),
  actividad: z.enum(ACTIVIDADES).default('ocasional'),
});

export function registerPlayerRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/players', async () => ({
    players: db.prepare('SELECT * FROM players ORDER BY minecraft_name').all(),
  }));

  app.post('/api/players', async (req, reply) => {
    const body = playerInput.parse(req.body);
    const info = db
      .prepare('INSERT INTO players (minecraft_name, note, actividad) VALUES (?, ?, ?)')
      .run(body.minecraft_name, body.note ?? null, body.actividad);
    reply.code(201);
    return db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
  });

  app.patch('/api/players/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as
      | { id: number; minecraft_name: string; note: string | null; actividad: string }
      | undefined;
    if (!existing) return reply.code(404).send({ error: 'Jugador no encontrado' });
    const body = playerInput.partial().parse(req.body);
    db.prepare('UPDATE players SET minecraft_name=@minecraft_name, note=@note, actividad=@actividad WHERE id=@id').run({
      id,
      minecraft_name: body.minecraft_name ?? existing.minecraft_name,
      note: body.note !== undefined ? body.note : existing.note,
      actividad: body.actividad ?? existing.actividad,
    });
    return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  });

  app.delete('/api/players/:id', async (req, reply) => {
    db.prepare('DELETE FROM players WHERE id = ?').run(Number((req.params as { id: string }).id));
    reply.code(204);
    return null;
  });
}
