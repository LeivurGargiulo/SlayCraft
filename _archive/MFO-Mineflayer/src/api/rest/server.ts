import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { registerFarmRoutes } from './farm-routes.js';
import { registerManagerRoutes } from './manager-routes.js';
import { registerCommandRoutes } from './command-routes.js';
import { registerAuthRoutes } from './auth-routes.js';
import type { RestApiDeps } from './deps.js';

const PUBLIC_PATHS = new Set(['/auth/login']);

/** Read routes map directly onto existing tables; commands enqueue the same jobs the scheduler already runs (TECHNICAL_SPEC §17). */
export function createRestApi(deps: RestApiDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  /** Dashboard is a separately-hosted origin (dev server) or same-origin static build below — same permissive stance as the WebSocket layer's `cors: { origin: '*' }`, no cookies involved so this doesn't need credentials support. */
  app.register(cors, { origin: true });

  /** Everything below requires a Bearer token, scoped to its own encapsulated context so the hook never reaches the publicly-served dashboard bundle registered further down — a browser's first navigation request can't carry an Authorization header. */
  app.register((api) => {
    api.addHook('onRequest', async (request, reply) => {
      if (PUBLIC_PATHS.has(request.url)) return;

      const header = request.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
      if (token === undefined || deps.authService.verifyToken(token) === undefined) {
        await reply.code(401).send({ error: 'unauthorized' });
      }
    });

    registerAuthRoutes(api, deps);
    registerFarmRoutes(api, deps);
    registerManagerRoutes(api, deps);
    registerCommandRoutes(api, deps);
  });

  /**
   * Serves the app shell at `/` and its built assets. Deliberately no SPA catch-all fallback:
   * the dashboard's client-side routes mirror the API's own path shapes (`/farm/:id`, etc. —
   * see `src/dashboard/src/App.tsx`), so a generic "unmatched GET -> index.html" handler would
   * shadow real API responses (a request to `/farm/iron` must still hit the `/farm/:id` route
   * above, 401 included, not silently become the dashboard shell). Practical effect: the
   * dashboard's in-app client-side navigation works normally once index.html has loaded and
   * routed the user in-browser, but a hard refresh on a deep link (e.g. `/farm/iron`) hits the
   * API route instead of the SPA — a known, documented limitation, not a bug to silently paper
   * over with a routing scheme that would require renaming the API's public paths.
   */
  const dashboardDistDir = resolve(deps.dashboardDistDirectory);
  if (existsSync(dashboardDistDir)) {
    app.register(fastifyStatic, {
      root: dashboardDistDir,
      prefix: '/',
      decorateReply: false,
    });
  }

  return app;
}

export type { RestApiDeps } from './deps.js';
