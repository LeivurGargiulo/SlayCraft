import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { updateGranja, deleteGranja, parseGranjaPatch } from '../../../../lib/granjas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseGranjaPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const granja = await updateGranja(params.id!, patch);
  if (!granja) return new Response('Granja no encontrada', { status: 404 });
  return Response.json(granja);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteGranja(params.id!);
  if (!deleted) return new Response('Granja no encontrada', { status: 404 });
  return new Response(null, { status: 204 });
};
