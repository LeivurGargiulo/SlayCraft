import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { updateJugador, deleteJugador, parseJugadorPatch } from '../../../../lib/jugadores';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseJugadorPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const jugador = await updateJugador(params.id!, patch);
  if (!jugador) return new Response('Jugador no encontrado', { status: 404 });
  return Response.json(jugador);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteJugador(params.id!);
  if (!deleted) return new Response('Jugador no encontrado', { status: 404 });
  return new Response(null, { status: 204 });
};
