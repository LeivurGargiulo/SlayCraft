import type { APIRoute } from 'astro';
import { isAdmin } from '../../../../lib/admin-auth';
import { createGranja, parseGranjaInput } from '../../../../lib/granjas';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdmin(cookies)) return new Response('No autorizado', { status: 401 });

  const body = await request.json().catch(() => null);
  const input = body ? parseGranjaInput(body) : null;
  if (!input) return new Response('Datos inválidos', { status: 400 });

  const granja = await createGranja(input);
  return Response.json(granja, { status: 201 });
};
