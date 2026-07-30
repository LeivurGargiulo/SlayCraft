import type { FastifyInstance } from 'fastify';
import { getAlerts, getManagerStatus } from '../../database/queries.js';
import { parseLimit } from './farm-routes.js';
import type { RestApiDeps } from './deps.js';

/** GET /manager (TECHNICAL_SPEC §17) — single upserted manager_status row, no dashboard-only fields (uptime/queue) that nothing computes yet. */
export function registerManagerRoutes(app: FastifyInstance, deps: RestApiDeps): void {
  app.get('/manager', () => getManagerStatus(deps.db) ?? { connected: false });

  /** Global alerts across every farm (ARCHITECTURE.md's dashboard "Alerts" page: open/acknowledged/resolved/history) — `getAlerts` already supports `farmId: undefined` for this, only `/farm/:id/alerts` used it before. */
  app.get<{ Querystring: { limit?: string } }>('/alerts', (request) =>
    getAlerts(deps.db, undefined, parseLimit(request.query.limit, 100)),
  );
}
