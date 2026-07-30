import { getStore } from '@netlify/blobs';
import { slugify } from './slugify.ts';

export interface Granja {
  id: string;
  title: string;
  coordinates: string[];
}

export type GranjaInput = Omit<Granja, 'id'>;

const KEY = 'granjas';

function store() {
  return getStore('granjas');
}

export async function getGranjas(): Promise<Granja[]> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Granja[] | null) ?? [];
}

async function saveGranjas(granjas: Granja[]): Promise<void> {
  await store().setJSON(KEY, granjas);
}

export async function createGranja(input: GranjaInput): Promise<Granja> {
  const granjas = await getGranjas();
  const base = slugify(input.title);
  let id = base;
  let suffix = 2;
  while (granjas.some((g) => g.id === id)) {
    id = `${base}-${suffix++}`;
  }
  const granja: Granja = { ...input, id };
  granjas.push(granja);
  await saveGranjas(granjas);
  return granja;
}

export async function updateGranja(id: string, patch: Partial<GranjaInput>): Promise<Granja | null> {
  const granjas = await getGranjas();
  const index = granjas.findIndex((g) => g.id === id);
  if (index === -1) return null;
  granjas[index] = { ...granjas[index], ...patch };
  await saveGranjas(granjas);
  return granjas[index];
}

export async function deleteGranja(id: string): Promise<boolean> {
  const granjas = await getGranjas();
  const next = granjas.filter((g) => g.id !== id);
  if (next.length === granjas.length) return false;
  await saveGranjas(next);
  return true;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function parseGranjaInput(body: unknown): GranjaInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.title !== 'string' || b.title.trim() === '') return null;
  if (!isStringArray(b.coordinates)) return null;
  return { title: b.title, coordinates: b.coordinates };
}

export function parseGranjaPatch(body: unknown): Partial<GranjaInput> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<GranjaInput> = {};
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
