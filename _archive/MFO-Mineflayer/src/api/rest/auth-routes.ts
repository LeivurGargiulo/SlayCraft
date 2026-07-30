import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RestApiDeps } from './deps.js';

const loginBodySchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

/** POST /auth/login — the only unauthenticated route; issues the single long-lived JWT every other route requires. */
export function registerAuthRoutes(app: FastifyInstance, deps: RestApiDeps): void {
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const token = await deps.authService.login(parsed.data.username, parsed.data.password);
    if (token === undefined) return reply.code(401).send({ error: 'invalid credentials' });
    return reply.code(200).send({ token });
  });
}
