import { join } from 'node:path';
import { loadYamlConfig } from './load-yaml-config.js';
import { managerConfigSchema, type ManagerConfig } from './schemas/manager.schema.js';
import { farmsConfigSchema, type FarmsConfig } from './schemas/farms.schema.js';
import { loggingConfigSchema, type LoggingConfig } from './schemas/logging.schema.js';
import { databaseConfigSchema, type DatabaseConfig } from './schemas/database.schema.js';
import { alertsConfigSchema, type AlertsConfig } from './schemas/alerts.schema.js';
import { discordConfigSchema, type DiscordConfig } from './schemas/discord.schema.js';
import { dashboardConfigSchema, type DashboardConfig } from './schemas/dashboard.schema.js';

export interface AppConfig {
  manager: ManagerConfig;
  farms: FarmsConfig;
  logging: LoggingConfig;
  database: DatabaseConfig;
  alerts: AlertsConfig;
  discord: DiscordConfig;
  dashboard: DashboardConfig;
}

export function loadAppConfig(configDir = 'config'): AppConfig {
  return {
    manager: loadYamlConfig(join(configDir, 'manager.yml'), managerConfigSchema),
    farms: loadYamlConfig(join(configDir, 'farms.yml'), farmsConfigSchema),
    logging: loadYamlConfig(join(configDir, 'logging.yml'), loggingConfigSchema),
    database: loadYamlConfig(join(configDir, 'database.yml'), databaseConfigSchema),
    alerts: loadYamlConfig(join(configDir, 'alerts.yml'), alertsConfigSchema),
    discord: loadYamlConfig(join(configDir, 'discord.yml'), discordConfigSchema),
    dashboard: loadYamlConfig(join(configDir, 'dashboard.yml'), dashboardConfigSchema),
  };
}

export type { ManagerConfig } from './schemas/manager.schema.js';
export type { FarmsConfig, FarmConfig, ContainerType } from './schemas/farms.schema.js';
export type { LoggingConfig } from './schemas/logging.schema.js';
export type { DatabaseConfig } from './schemas/database.schema.js';
export type { AlertsConfig } from './schemas/alerts.schema.js';
export type { DiscordConfig } from './schemas/discord.schema.js';
export type { DashboardConfig } from './schemas/dashboard.schema.js';
