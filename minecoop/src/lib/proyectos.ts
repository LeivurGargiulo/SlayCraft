import { getStore } from '@netlify/blobs';
import { slugify } from './slugify.ts';

export interface Proyecto {
  id: string;
  title: string;
  coordinates: string[];
}

export type ProyectoInput = Omit<Proyecto, 'id'>;

const KEY = 'proyectos';

function store() {
  return getStore('proyectos');
}

export async function getProyectos(): Promise<Proyecto[]> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Proyecto[] | null) ?? [];
}

async function saveProyectos(proyectos: Proyecto[]): Promise<void> {
  await store().setJSON(KEY, proyectos);
}

export async function createProyecto(input: ProyectoInput): Promise<Proyecto> {
  const proyectos = await getProyectos();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (proyectos.some((p) => p.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const proyecto: Proyecto = { ...input, id };
  proyectos.push(proyecto);
  await saveProyectos(proyectos);
  return proyecto;
}

export async function updateProyecto(id: string, patch: Partial<ProyectoInput>): Promise<Proyecto | null> {
  const proyectos = await getProyectos();
  const index = proyectos.findIndex((p) => p.id === id);
  if (index === -1) return null;
  proyectos[index] = { ...proyectos[index], ...patch };
  await saveProyectos(proyectos);
  return proyectos[index];
}

export async function deleteProyecto(id: string): Promise<boolean> {
  const proyectos = await getProyectos();
  const next = proyectos.filter((p) => p.id !== id);
  if (next.length === proyectos.length) return false;
  await saveProyectos(next);
  return true;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function parseProyectoInput(body: unknown): ProyectoInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim() === '') return null;
  if (!isStringArray(b.coordinates)) return null;
  return { title: b.title, coordinates: b.coordinates };
}

export function parseProyectoPatch(body: unknown): Partial<ProyectoInput> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<ProyectoInput> = {};
  if (b.title !== undefined) {
    if (typeof b.title !== 'string' || b.title.trim() === '') return null;
    patch.title = b.title;
  }
  if (b.coordinates !== undefined) {
    if (!isStringArray(b.coordinates)) return null;
    patch.coordinates = b.coordinates;
  }
  return patch;
}
