import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/database/client.js';
import { BackupService } from '../../../src/services/backup/backup-service.js';
import { createLogger } from '../../../src/core/logger/index.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

describe('BackupService', () => {
  let dir: string;

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a backup file to the configured directory', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mfo-backup-'));
    const { sqlite, close } = createDatabase(':memory:');
    const service = new BackupService({
      sqlite,
      config: { enabled: true, intervalMs: 1000, directory: dir, retainCount: 7 },
      logger: createSilentLogger(),
    });

    const destination = await service.runBackup();
    close();

    expect(readdirSync(dir)).toContain(destination.split('/').pop());
  });

  it('prunes backups beyond retainCount', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mfo-backup-'));
    const { sqlite, close } = createDatabase(':memory:');
    const service = new BackupService({
      sqlite,
      config: { enabled: true, intervalMs: 1000, directory: dir, retainCount: 1 },
      logger: createSilentLogger(),
    });

    await service.runBackup();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.runBackup();
    close();

    expect(readdirSync(dir)).toHaveLength(1);
  });
});
