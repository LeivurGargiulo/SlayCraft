import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
const PRIORITIES = ['low', 'med', 'high'] as const;

const taskInput = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  status: z.enum(STATUSES).default('todo'),
  priority: z.enum(PRIORITIES).default('med'),
  due_date: z.string().nullable().optional(),
  farm_id: z.string().nullable().optional(),
  project_id: z.number().int().nullable().optional(),
  assignee_ids: z.array(z.number().int()).default([]),
});

const subtaskInput = z.object({
  title: z.string().min(1),
  done: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  farm_id: string | null;
  project_id: number | null;
  completed_at: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

function hydrateTask(db: Database.Database, task: TaskRow) {
  const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order').all(task.id);
  const assignees = db
    .prepare('SELECT p.* FROM players p JOIN task_assignees ta ON ta.player_id = p.id WHERE ta.task_id = ?')
    .all(task.id);
  return { ...task, subtasks, assignees };
}

function setAssignees(db: Database.Database, taskId: number, playerIds: number[]) {
  db.prepare('DELETE FROM task_assignees WHERE task_id = ?').run(taskId);
  const insert = db.prepare('INSERT INTO task_assignees (task_id, player_id) VALUES (?, ?)');
  for (const playerId of playerIds) insert.run(taskId, playerId);
}

export function registerTaskRoutes(app: FastifyInstance, db: Database.Database) {
  app.get('/api/tasks', async () => {
    db.prepare(
      `UPDATE tasks SET archived = 1
       WHERE status = 'done' AND archived = 0 AND completed_at IS NOT NULL
         AND completed_at <= datetime('now', '-3 days')`
    ).run();
    const tasks = db
      .prepare("SELECT * FROM tasks WHERE archived = 0 ORDER BY (due_date IS NULL), due_date ASC")
      .all() as TaskRow[];
    return { tasks: tasks.map((t) => hydrateTask(db, t)) };
  });

  app.get('/api/tasks/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!task) return reply.code(404).send({ error: 'Tarea no encontrada' });
    return hydrateTask(db, task);
  });

  app.post('/api/tasks', async (req, reply) => {
    const body = taskInput.parse(req.body);
    const info = db
      .prepare(
        `INSERT INTO tasks (title, description, status, priority, due_date, farm_id, project_id)
         VALUES (@title, @description, @status, @priority, @due_date, @farm_id, @project_id)`
      )
      .run({
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        priority: body.priority,
        due_date: body.due_date ?? null,
        farm_id: body.farm_id ?? null,
        project_id: body.project_id ?? null,
      });
    setAssignees(db, Number(info.lastInsertRowid), body.assignee_ids);
    reply.code(201);
    return hydrateTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid) as TaskRow);
  });

  app.patch('/api/tasks/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    if (!existing) return reply.code(404).send({ error: 'Tarea no encontrada' });
    const body = taskInput.partial().parse(req.body);
    const nextStatus = body.status ?? existing.status;
    let completed_at = existing.completed_at;
    let archived = existing.archived;
    if (nextStatus === 'done' && existing.status !== 'done') {
      completed_at = new Date().toISOString();
    } else if (nextStatus !== 'done' && existing.status === 'done') {
      completed_at = null;
      archived = 0;
    }
    const merged = { ...existing, ...body, id, completed_at, archived };
    db.prepare(
      `UPDATE tasks SET title=@title, description=@description, status=@status, priority=@priority,
        due_date=@due_date, farm_id=@farm_id, project_id=@project_id, completed_at=@completed_at,
        archived=@archived, updated_at=datetime('now')
       WHERE id=@id`
    ).run(merged);
    if (body.assignee_ids) setAssignees(db, id, body.assignee_ids);
    return hydrateTask(db, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow);
  });

  app.delete('/api/tasks/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    reply.code(204);
    return null;
  });

  app.post('/api/tasks/:id/subtasks', async (req) => {
    const taskId = Number((req.params as { id: string }).id);
    const body = subtaskInput.parse(req.body);
    const info = db
      .prepare('INSERT INTO subtasks (task_id, title, done, sort_order) VALUES (?, ?, ?, ?)')
      .run(taskId, body.title, body.done ? 1 : 0, body.sort_order);
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(info.lastInsertRowid);
  });

  app.patch('/api/subtasks/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const existing = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as
      | { id: number; task_id: number; title: string; done: number; sort_order: number }
      | undefined;
    if (!existing) return reply.code(404).send({ error: 'Subtarea no encontrada' });
    const body = subtaskInput.partial().parse(req.body);
    db.prepare('UPDATE subtasks SET title=@title, done=@done, sort_order=@sort_order WHERE id=@id').run({
      id,
      title: body.title ?? existing.title,
      done: body.done !== undefined ? (body.done ? 1 : 0) : existing.done,
      sort_order: body.sort_order ?? existing.sort_order,
    });
    return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
  });

  app.delete('/api/subtasks/:id', async (req, reply) => {
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(Number((req.params as { id: string }).id));
    reply.code(204);
    return null;
  });
}
