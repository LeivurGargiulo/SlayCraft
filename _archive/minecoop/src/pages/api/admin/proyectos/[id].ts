import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { updateProyecto, deleteProyecto, parseProyectoPatch } from '../../../../lib/proyectos';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseProyectoPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const proyecto = await updateProyecto(params.id!, patch);
  if (!proyecto) return new Response('Proyecto no encontrado', { status: 404 });
  return Response.json(proyecto);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteProyecto(params.id!);
  if (!deleted) return new Response('Proyecto no encontrado', { status: 404 });
  return new Response(null, { status: 204 });
};
