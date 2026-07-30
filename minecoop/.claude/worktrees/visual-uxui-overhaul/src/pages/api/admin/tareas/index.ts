import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { createTarea, parseTareaInput } from '../../../../lib/tareas';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseTareaInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const tarea = await createTarea(input);
  return Response.json(tarea, { status: 201 });
};
