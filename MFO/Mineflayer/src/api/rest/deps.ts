import type { Db } from '../../database/client.js';
import type { FarmRegistry } from '../../core/registry/farm-registry.js';
import type { FarmDefinition } from '../../core/registry/farm-definition.js';
import type { Scheduler } from '../../core/scheduler/scheduler.js';
import type { AlertService } from '../../services/alerts/alert-service.js';
import type { AuthService } from '../../services/auth/auth-service.js';
import type { Logger } from '../../core/logger/index.js';

export interface RestApiDeps {
  readonly db: Db;
  readonly farmRegistry: FarmRegistry;
  readonly scheduler: Scheduler;
  readonly alertService: AlertService;
  readonly authService: AuthService;
  /** `src/dashboard/dist` (its own `pnpm build`) — served same-origin when present, e.g. in the Docker image; a bare dev checkout typically runs the dashboard's own Vite server instead. */
  readonly dashboardDistDirectory: string;
  readonly enqueueScan: (farm: FarmDefinition) => string;
  readonly logger: Logger;
}
