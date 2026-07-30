import { getStore } from '@netlify/blobs';
import type { Actividad } from '../data/jugadores.ts';

export interface Jugador {
  username: string;
  actividad: Actividad;
}

export type JugadorInput = Jugador;

const KEY = 'jugadores';
const ACTIVIDADES: Actividad[] = ['activo', 'ocasional', 'inactivo'];

function store() {
  return getStore('jugadores');
}

export async function getJugadores(): Promise<Jugador[]> {
  const data = await store().get(KEY, { type: 'json' });
  return (data as Jugador[] | null) ?? [];
}

async function saveJugadores(jugadores: Jugador[]): Promise<void> {
  await store().setJSON(KEY, jugadores);
}

export async function createJugador(input: JugadorInput): Promise<Jugador | null> {
  const jugadores = await getJugadores();
  if (jugadores.some((j) => j.username === input.username)) return null;
  jugadores.push(input);
  await saveJugadores(jugadores);
  return input;
}

export async function updateJugador(
  username: string,
  patch: Partial<Pick<Jugador, 'actividad'>>
): Promise<Jugador | null> {
  const jugadores = await getJugadores();
  const index = jugadores.findIndex((j) => j.username === username);
  if (index === -1) return null;
  jugadores[index] = { ...jugadores[index], ...patch };
  await saveJugadores(jugadores);
  return jugadores[index];
}

export async function deleteJugador(username: string): Promise<boolean> {
  const jugadores = await getJugadores();
  const next = jugadores.filter((j) => j.username !== username);
  if (next.length === jugadores.length) return false;
  await saveJugadores(next);
  return true;
}

function isActividad(v: unknown): v is Actividad {
  return typeof v === 'string' && (ACTIVIDADES as string[]).includes(v);
}

export function parseJugadorInput(body: unknown): JugadorInput | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.username !== 'string' || b.username.trim() === '') return null;
  if (!isActividad(b.actividad)) return null;
  return { username: b.username, actividad: b.actividad };
}

export function parseJugadorPatch(body: unknown): Partial<Pick<Jugador, 'actividad'>> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const patch: Partial<Pick<Jugador, 'actividad'>> = {};
  if (b.actividad !== undefined) {
    if (!isActividad(b.actividad)) return null;
    patch.actividad = b.actividad;
  }
  return patch;
}
