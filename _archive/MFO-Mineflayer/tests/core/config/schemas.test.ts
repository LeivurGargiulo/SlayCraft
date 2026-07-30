import { describe, expect, it } from 'vitest';
import { managerConfigSchema } from '../../../src/core/config/schemas/manager.schema.js';
import { farmsConfigSchema } from '../../../src/core/config/schemas/farms.schema.js';
import { loggingConfigSchema } from '../../../src/core/config/schemas/logging.schema.js';
import { databaseConfigSchema } from '../../../src/core/config/schemas/database.schema.js';

describe('managerConfigSchema', () => {
  it('accepts a minimal valid config and fills in defaults', () => {
    const result = managerConfigSchema.parse({
      server: { host: 'localhost' },
      bot: { username: 'MFO-Manager' },
    });

    expect(result.server.port).toBe(25565);
    expect(result.bot.auth).toBe('offline');
    expect(result.reconnect.enabled).toBe(true);
    expect(result.monitors).toEqual(['storage', 'entities', 'workers', 'chunks']);
  });

  it('rejects a config missing the bot username', () => {
    const result = managerConfigSchema.safeParse({ server: { host: 'localhost' }, bot: {} });
    expect(result.success).toBe(false);
  });

  it('accepts a restricted monitors list', () => {
    const result = managerConfigSchema.parse({
      server: { host: 'localhost' },
      bot: { username: 'MFO-Manager' },
      monitors: ['storage'],
    });

    expect(result.monitors).toEqual(['storage']);
  });

  it('rejects an unknown monitor id', () => {
    const result = managerConfigSchema.safeParse({
      server: { host: 'localhost' },
      bot: { username: 'MFO-Manager' },
      monitors: ['not-a-monitor'],
    });

    expect(result.success).toBe(false);
  });
});

describe('farmsConfigSchema', () => {
  it('accepts a farm with storage', () => {
    const result = farmsConfigSchema.parse({
      farms: {
        iron: {
          dimension: 'overworld',
          teleport: { x: 120, y: 80, z: -500 },
          carpetWorker: 'worker_iron',
          storage: [{ type: 'chest', position: [123, 79, -501] }],
        },
      },
    });

    expect(result.farms.iron?.storage).toHaveLength(1);
  });

  it('rejects an unknown container type', () => {
    const result = farmsConfigSchema.safeParse({
      farms: {
        iron: {
          dimension: 'overworld',
          teleport: { x: 0, y: 0, z: 0 },
          carpetWorker: 'worker_iron',
          storage: [{ type: 'dropper', position: [0, 0, 0] }],
        },
      },
    });

    expect(result.success).toBe(false);
  });
});

describe('databaseConfigSchema', () => {
  it('defaults to a 6-hour backup interval retaining 7 files', () => {
    const result = databaseConfigSchema.parse({});

    expect(result.path).toBe('data/mfo.sqlite');
    expect(result.backup).toEqual({
      enabled: true,
      intervalMs: 21_600_000,
      directory: 'data/backups',
      retainCount: 7,
    });
  });

  it('accepts an overridden backup config', () => {
    const result = databaseConfigSchema.parse({ backup: { enabled: false, retainCount: 3 } });

    expect(result.backup.enabled).toBe(false);
    expect(result.backup.retainCount).toBe(3);
  });
});

describe('loggingConfigSchema', () => {
  it('defaults to info level and pretty printing', () => {
    expect(loggingConfigSchema.parse({})).toEqual({
      level: 'info',
      pretty: true,
      file: { enabled: false, path: 'logs/mfo.log' },
    });
  });

  it('rejects an invalid log level', () => {
    const result = loggingConfigSchema.safeParse({ level: 'verbose' });
    expect(result.success).toBe(false);
  });
});
