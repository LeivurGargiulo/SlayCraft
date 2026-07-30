import { mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Logger } from '../../core/logger/index.js';
import type { DatabaseConfig } from '../../core/config/schemas/database.schema.js';
import { selectStaleBackups } from './select-stale-backups.js';

export interface BackupServiceDeps {
  readonly sqlite: Database.Database;
  readonly config: DatabaseConfig['backup'];
  readonly logger: Logger;
}

/** Periodic `better-sqlite3` `.backup()` (non-locking) to a local directory, pruning down to `retainCount` files. */
export class BackupService {
  private readonly sqlite: Database.Database;
  private readonly config: DatabaseConfig['backup'];
  private readonly logger: Logger;
  private timer: NodeJS.Timeout | undefined;

  constructor(deps: BackupServiceDeps) {
    this.sqlite = deps.sqlite;
    this.config = deps.config;
    this.logger = deps.logger.child({ module: 'services.backup' });
  }

  start(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(() => {
      this.runBackup().catch((error: unknown) => {
        this.logger.error({ err: error }, 'database backup failed');
      });
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  async runBackup(): Promise<string> {
    await mkdir(this.config.directory, { recursive: true });
    const destination = join(this.config.directory, `mfo-${String(Date.now())}.sqlite`);
    await this.sqlite.backup(destination);
    this.logger.info({ destination }, 'database backup written');
    await this.pruneStaleBackups();
    return destination;
  }

  private async pruneStaleBackups(): Promise<void> {
    const fileNames = await readdir(this.config.directory);
    for (const fileName of selectStaleBackups(fileNames, this.config.retainCount)) {
      await unlink(join(this.config.directory, fileName));
      this.logger.info({ fileName }, 'stale backup pruned');
    }
  }
}
