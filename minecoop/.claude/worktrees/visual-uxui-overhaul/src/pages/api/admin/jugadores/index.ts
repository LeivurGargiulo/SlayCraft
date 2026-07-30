import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { createJugador, parseJugadorInput } from '../../../../lib/jugadores';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseJugadorInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const jugador = await createJugador(input);
  if (!jugador) return new Response('El jugador ya existe', { status: 409 });
  return Response.json(jugador, { status: 201 });
};
