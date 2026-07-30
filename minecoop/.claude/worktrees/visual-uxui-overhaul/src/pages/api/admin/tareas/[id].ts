import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { updateTarea, deleteTarea, parseTareaPatch } from '../../../../lib/tareas';

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const patch = body ? parseTareaPatch(body) : null;
  if (!patch) return new Response('Datos inválidos', { status: 400 });

  const tarea = await updateTarea(params.id!, patch);
  if (!tarea) return new Response('Tarea no encontrada', { status: 404 });
  return Response.json(tarea);
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const deleted = await deleteTarea(params.id!);
  if (!deleted) return new Response('Tarea no encontrada', { status: 404 });
  return new Response(null, { status: 204 });
};
