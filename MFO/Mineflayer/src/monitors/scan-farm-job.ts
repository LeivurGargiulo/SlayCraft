import type { Job, JobContext } from '../core/scheduler/job.js';
import { JobPriority } from '../core/scheduler/priority.js';
import type { EventBus } from '../core/event-bus/event-bus.js';
import type { AppEventMap } from '../core/event-bus/events.js';
import type { Logger } from '../core/logger/index.js';
import type { FarmDefinition } from '../core/registry/farm-definition.js';
import type { ManagerConnection } from '../manager/connection/manager-connection.js';
import type { TeleportService } from '../manager/teleport/teleport-service.js';
import { TeleportError } from '../manager/teleport/teleport-error.js';
import type { Monitor } from './monitor.js';

export interface ScanFarmJobDeps {
  readonly farm: FarmDefinition;
  readonly monitors: readonly Monitor[];
  readonly connection: ManagerConnection;
  readonly teleportService: TeleportService;
  readonly eventBus: EventBus<AppEventMap>;
  readonly logger: Logger;
}

/** Scan pipeline (TECHNICAL_SPEC §7), minus DB persistence: Teleport -> run supporting monitors -> publish events. */
export class ScanFarmJob implements Job {
  readonly type = 'ScanFarmJob';
  readonly priority: JobPriority = JobPriority.NORMAL;

  private readonly farm: FarmDefinition;
  private readonly monitors: readonly Monitor[];
  private readonly connection: ManagerConnection;
  private readonly teleportService: TeleportService;
  private readonly eventBus: EventBus<AppEventMap>;
  private readonly logger: Logger;

  constructor(deps: ScanFarmJobDeps) {
    this.farm = deps.farm;
    this.monitors = deps.monitors;
    this.connection = deps.connection;
    this.teleportService = deps.teleportService;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger.child({ module: 'monitors.scan-farm-job', farmId: deps.farm.id });
  }

  async run(context: JobContext): Promise<void> {
    const { signal } = context;
    await this.teleportService.teleport(
      this.farm.teleport,
      this.farm.dimension,
      signal,
      this.farm.id,
    );

    const bot = this.connection.getBot();
    if (!bot) throw new TeleportError('manager disconnected after teleport');

    for (const monitor of this.monitors) {
      if (!monitor.supports(this.farm)) continue;
      signal.throwIfAborted();

      const result = await monitor.execute({ bot, farm: this.farm, logger: this.logger, signal });
      for (const event of result.events) {
        this.eventBus.publish(event.type, event.payload);
      }
      this.logger.info(
        { monitorId: monitor.id, eventCount: result.events.length },
        'monitor completed',
      );
    }
  }
}
