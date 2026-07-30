import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../../src/core/logger/logger.js';

describe('createLogger', () => {
  it('uses the direct stdout path when pretty printing and file logging are both disabled', () => {
    const logger = createLogger({
      level: 'debug',
      pretty: false,
      file: { enabled: false, path: 'unused.log' },
    });

    expect(logger.level).toBe('debug');
    expect(() => {
      logger.info('smoke test');
    }).not.toThrow();
  });

  it('supports child loggers scoped to a module and correlation ID', () => {
    const logger = createLogger({
      level: 'info',
      pretty: false,
      file: { enabled: false, path: 'unused.log' },
    });
    const child = logger.child({ module: 'core.logger', correlationId: 'test-correlation-id' });

    expect(() => {
      child.info('smoke test');
    }).not.toThrow();
  });

  describe('with a transport (file logging enabled)', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'mfo-logger-test-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('writes structured JSON lines to the configured log file', async () => {
      const logFile = join(dir, 'mfo.log');
      const logger = createLogger({
        level: 'info',
        pretty: false,
        file: { enabled: true, path: logFile },
      });

      logger.info({ farm: 'iron' }, 'file transport smoke test');
      await new Promise<void>((resolve) => {
        logger.flush(() => {
          resolve();
        });
      });

      const [firstLine] = readFileSync(logFile, 'utf8').trim().split('\n');
      const parsed = JSON.parse(firstLine ?? '{}') as { msg: string; farm: string };
      expect(parsed.msg).toBe('file transport smoke test');
      expect(parsed.farm).toBe('iron');
    });
  });
});
