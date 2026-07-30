import { getStore } from '@netlify/blobs';
import { slugify } from './slugify.ts';
export { slugify } from './slugify.ts';

export interface Subtarea {
  title: string;
  done: boolean;
  assignee?: string[];
}

export interface Tarea {
  id: string;
  title: string;
  status: 'pendiente' | 'en-progreso';
  assignee?: string[];
  priority: number;
  notes?: string;
  granjas?: string[];
  proyectos?: string[];
  subtareas?: Subtarea[];
}

export type TareaInput = Omit<Tarea, 'id'>;

const KEY = 'tareas';

function store() {
  return getStore('tareas');
}

export async function getTareas(): Promise<Tarea[]> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Tarea[] | null) ?? [];
}

async function saveTareas(tareas: Tarea[]): Promise<void> {
  await store().setJSON(KEY, tareas);
}

export async function createTarea(input: TareaInput): Promise<Tarea> {
  const tareas = await getTareas();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (tareas.some((t) => t.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const tarea: Tarea = { ...input, id };
  tareas.push(tarea);
  await saveTareas(tareas);
  return tarea;
}

export async function updateTarea(id: string, patch: Partial<TareaInput>): Promise<Tarea | null> {
  const tareas = await getTareas();
  const index = tareas.findIndex((t) => t.id === id);
  if (index === -1) return null;
  tareas[index] = { ...tareas[index], ...patch };
  await saveTareas(tareas);
  return tareas[index];
}

export async function deleteTarea(id: string): Promise<boolean> {
  const tareas = await getTareas();
  const next = tareas.filter((t) => t.id !== id);
  if (next.length === tareas.length) return false;
  await saveTareas(next);
  return true;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function parseSubtareas(v: unknown): Subtarea[] {
  if (!Array.isArray(v)) throw new Error('subtareas debe ser un arreglo');
  return v.map((s) => {
    if (typeof s !== 'object' || s === null) throw new Error('subtarea inválida');
    const { title, done, assignee } = s as Record<string, unknown>;
    if (typeof title !== 'string' || title.trim() === '') throw new Error('subtarea.title inválido');
    if (typeof done !== 'boolean') throw new Error('subtarea.done inválido');
    if (assignee !== undefined && !isStringArray(assignee)) throw new Error('subtarea.assignee inválido');
    return { title, done, assignee: assignee as string[] | undefined };
  });
}

export function parseTareaInput(body: unknown): TareaInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim() === '') return null;
  if (b.status !== 'pendiente' && b.status !== 'en-progreso') return null;
  if (typeof b.priority !== 'number' || !Number.isInteger(b.priority) || b.priority < 0 || b.priority > 5) return null;
  if (b.assignee !== undefined && !isStringArray(b.assignee)) return null;
  if (b.notes !== undefined && typeof b.notes !== 'string') return null;
  if (b.granjas !== undefined && !isStringArray(b.granjas)) return null;
  if (b.proyectos !== undefined && !isStringArray(b.proyectos)) return null;
  try {
    const subtareas = b.subtareas !== undefined ? parseSubtareas(b.subtareas) : undefined;
    return {
      title: b.title,
      status: b.status,
      priority: b.priority,
      assignee: b.assignee as string[] | undefined,
      notes: b.notes as string | undefined,
      granjas: b.granjas as string[] | undefined,
      proyectos: b.proyectos as string[] | undefined,
      subtareas,
    };
  } catch {
    return null;
  }
}

export function parseTareaPatch(body: unknown): Partial<TareaInput> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<TareaInput> = {};
  try {
    if (b.title !== undefined) {
      if (typeof b.title !== 'string' || b.title.trim() === '') return null;
      patch.title = b.title;
    }
    if (b.status !== undefined) {
      if (b.status !== 'pendiente' && b.status !== 'en-progreso') return null;
      patch.status = b.status;
    }
    if (b.priority !== undefined) {
      if (typeof b.priority !== 'number' || !Number.isInteger(b.priority) || b.priority < 0 || b.priority > 5) return null;
      patch.priority = b.priority;
    }
    if (b.assignee !== undefined) {
      if (!isStringArray(b.assignee)) return null;
      patch.assignee = b.assignee;
    }
    if (b.notes !== undefined) {
      if (typeof b.notes !== 'string') return null;
      patch.notes = b.notes;
    }
    if (b.granjas !== undefined) {
      if (!isStringArray(b.granjas)) return null;
      patch.granjas = b.granjas;
    }
    if (b.proyectos !== undefined) {
      if (!isStringArray(b.proyectos)) return null;
      patch.proyectos = b.proyectos;
    }
    if (b.subtareas !== undefined) {
      patch.subtareas = parseSubtareas(b.subtareas);
    }
    return patch;
  } catch {
    return null;
  }
}
