import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { createProyecto, parseProyectoInput } from '../../../../lib/proyectos';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseProyectoInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const proyecto = await createProyecto(input);
  return Response.json(proyecto, { status: 201 });
};
