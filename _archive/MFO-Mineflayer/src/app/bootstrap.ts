import { join } from 'node:path';
import { loadAppConfig } from '../core/config/index.js';
import { resolveJwtSecret } from '../core/config/startup-checks.js';
import { createLogger } from '../core/logger/index.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import type { AppEventMap } from '../core/event-bus/events.js';
import { Scheduler } from '../core/scheduler/scheduler.js';
import { createDatabase } from '../database/client.js';
import {
  registerManagerStatusPersistence,
  registerContainerSnapshotPersistence,
  registerEntityObservationPersistence,
  registerWorkerStatusPersistence,
} from '../services/persistence/index.js';
import { ProductionService } from '../monitors/production/production-service.js';
import { HealthService } from '../monitors/health/health-service.js';
import { AlertService } from '../services/alerts/alert-service.js';
import { AuthService } from '../services/auth/auth-service.js';
import { BackupService } from '../services/backup/backup-service.js';
import { ManagerConnection } from '../manager/connection/manager-connection.js';
import { ConfigValidationError } from '../shared/errors/config-validation-error.js';
import { FarmRegistry } from '../core/registry/farm-registry.js';
import { TeleportService } from '../manager/teleport/teleport-service.js';
import { StorageMonitor } from '../monitors/storage/storage-monitor.js';
import { EntityMonitor } from '../monitors/entities/entity-monitor.js';
import { WorkerMonitor } from '../monitors/workers/worker-monitor.js';
import { ChunkMonitor } from '../monitors/chunks/chunk-monitor.js';
import { ScanFarmJob } from '../monitors/scan-farm-job.js';
import type { Monitor } from '../monitors/monitor.js';
import type { FarmDefinition } from '../core/registry/farm-definition.js';
import { createRestApi } from '../api/rest/server.js';
import { attachWebSocket } from '../api/websocket/server.js';
import { startDiscordBot } from '../integrations/discord/discord-bot.js';

function loadEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function withConfigErrorExit<T>(load: () => T): T {
  try {
    return load();
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

function main(): void {
  loadEnvFile();
  const jwtSecret = withConfigErrorExit(() => resolveJwtSecret(process.env.JWT_SECRET));
  const config = withConfigErrorExit(() => loadAppConfig());
  const logger = createLogger(config.logging);
  const eventBus = new EventBus<AppEventMap>();
  const scheduler = new Scheduler(logger);
  const { db, sqlite, close: closeDatabase } = createDatabase(config.database.path);
  const backupService = new BackupService({ sqlite, config: config.database.backup, logger });
  backupService.start();
  const farmRegistry = new FarmRegistry(config.farms);
  logger.info({ farms: farmRegistry.getAll().length }, 'farm registry loaded');

  registerManagerStatusPersistence(eventBus, db, logger);
  registerContainerSnapshotPersistence(eventBus, db, logger);
  registerEntityObservationPersistence(eventBus, db, logger);
  registerWorkerStatusPersistence(eventBus, db, logger);

  new ProductionService(eventBus, db, logger).register();
  new HealthService(
    eventBus,
    db,
    logger,
    farmRegistry.getAll().map((farm) => farm.id),
  ).register();
  const alertService = new AlertService(eventBus, db, logger, config.alerts);
  alertService.register();

  eventBus.subscribe('ManagerConnected', (event) => {
    logger.info({ host: event.host, port: event.port }, 'manager online');
  });
  eventBus.subscribe('ManagerDisconnected', (event) => {
    logger.warn({ reason: event.reason }, 'manager offline');
  });

  const authService = new AuthService({
    db,
    jwtSecret,
    jwtExpiry: config.dashboard.jwtExpiry,
    logger,
  });

  const connection = new ManagerConnection({ config: config.manager, eventBus, logger });
  const teleportService = new TeleportService({ connection, eventBus, logger });

  const allMonitors: readonly Monitor[] = [
    new StorageMonitor(),
    new EntityMonitor(),
    new WorkerMonitor(),
    new ChunkMonitor(),
  ];
  const enabledMonitorIds = new Set<string>(config.manager.monitors);
  const monitors = allMonitors.filter((monitor) => enabledMonitorIds.has(monitor.id));
  logger.info({ monitors: monitors.map((m) => m.id) }, 'monitors enabled');

  const enqueueScan = (farm: FarmDefinition): string =>
    scheduler.enqueue(
      new ScanFarmJob({ farm, monitors, connection, teleportService, eventBus, logger }),
    );

  connection.connect();

  let scanTimer: NodeJS.Timeout | undefined;
  if (config.manager.scan.enabled) {
    scanTimer = setInterval(() => {
      for (const farm of farmRegistry.getAll()) enqueueScan(farm);
    }, config.manager.scan.intervalMs);
  }

  const restApi = createRestApi({
    db,
    farmRegistry,
    scheduler,
    alertService,
    authService,
    dashboardDistDirectory: join(process.cwd(), 'src/dashboard/dist'),
    enqueueScan,
    logger,
  });
  const webSocket = attachWebSocket(restApi.server, eventBus, authService, logger);

  const discordBot = startDiscordBot({
    config: config.discord,
    token: process.env.DISCORD_BOT_TOKEN,
    farmRegistry,
    db,
    alertService,
    enqueueScan,
    eventBus,
    logger,
  });

  restApi
    .listen({ host: config.manager.api.host, port: config.manager.api.port })
    .then(() => {
      logger.info(
        { host: config.manager.api.host, port: config.manager.api.port },
        'REST API listening',
      );
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'failed to start REST API');
    });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    if (scanTimer !== undefined) clearInterval(scanTimer);
    backupService.stop();
    scheduler.shutdown();
    connection.shutdown();
    await discordBot.stop();
    await webSocket.close();
    await restApi.close();
    closeDatabase();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main();
