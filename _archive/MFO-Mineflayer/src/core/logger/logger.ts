import pino, { type Logger, type TransportTargetOptions } from 'pino';
import type { LoggingConfig } from '../config/index.js';

export function createLogger(config: LoggingConfig): Logger {
  if (!config.pretty && !config.file.enabled) {
    return pino({ level: config.level, timestamp: pino.stdTimeFunctions.isoTime });
  }

  const targets: TransportTargetOptions[] = [
    config.pretty
      ? { target: 'pino-pretty', options: { colorize: true }, level: config.level }
      : { target: 'pino/file', options: { destination: 1 }, level: config.level },
  ];

  if (config.file.enabled) {
    targets.push({
      target: 'pino/file',
      options: { destination: config.file.path, mkdir: true },
      level: config.level,
    });
  }

  return pino(
    { level: config.level, timestamp: pino.stdTimeFunctions.isoTime },
    pino.transport({ targets }),
  );
}
