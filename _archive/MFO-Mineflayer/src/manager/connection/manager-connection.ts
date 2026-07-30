import { createBot as createMineflayerBot, type Bot, type BotOptions } from 'mineflayer';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';
import type { ManagerConfig } from '../../core/config/index.js';
import { computeReconnectDelayMs } from './reconnect-policy.js';
import { formatKickReason } from './kick-reason.js';

export type BotFactory = (options: BotOptions) => Bot;

export interface ManagerConnectionDeps {
  readonly config: ManagerConfig;
  readonly eventBus: EventBus<AppEventMap>;
  readonly logger: Logger;
  readonly createBot?: BotFactory;
}

export class ManagerConnection {
  private readonly config: ManagerConfig;
  private readonly eventBus: EventBus<AppEventMap>;
  private readonly logger: Logger;
  private readonly createBot: BotFactory;

  private bot: Bot | undefined;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private shuttingDown = false;
  private lastKickReason: string | undefined;

  constructor(deps: ManagerConnectionDeps) {
    this.config = deps.config;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger.child({ module: 'manager.connection' });
    this.createBot = deps.createBot ?? createMineflayerBot;
  }

  connect(): void {
    this.shuttingDown = false;
    this.attemptConnect();
  }

  /** The live, spawned Bot, or undefined when disconnected/reconnecting. Replaced on reconnect. */
  getBot(): Bot | undefined {
    return this.bot?.entity ? this.bot : undefined;
  }

  shutdown(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.bot?.end();
  }

  private attemptConnect(): void {
    const { server, bot: botConfig } = this.config;
    this.logger.info({ host: server.host, port: server.port }, 'connecting to server');

    const options: BotOptions = {
      host: server.host,
      port: server.port,
      username: botConfig.username,
      auth: botConfig.auth,
      checkTimeoutInterval: server.keepAliveTimeoutMs,
      ...(server.version !== undefined ? { version: server.version } : {}),
    };

    const bot = this.createBot(options);
    this.bot = bot;

    bot.once('spawn', () => {
      this.reconnectAttempt = 0;
      this.logger.info('manager connected');
      this.eventBus.publish('ManagerConnected', {
        occurredAt: new Date(),
        host: server.host,
        port: server.port,
        username: botConfig.username,
      });
    });

    bot.on('error', (error) => {
      this.logger.warn({ err: error }, 'connection error');
    });

    bot.on('kicked', (reason) => {
      this.lastKickReason = formatKickReason(reason);
      this.logger.warn({ reason: this.lastKickReason }, 'manager kicked from server');
    });

    bot.once('end', (reason) => {
      const effectiveReason = this.lastKickReason ?? reason;
      this.lastKickReason = undefined;
      this.logger.warn({ reason: effectiveReason }, 'manager disconnected');
      this.eventBus.publish('ManagerDisconnected', {
        occurredAt: new Date(),
        reason: effectiveReason,
      });
      if (!this.shuttingDown) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    const { reconnect } = this.config;
    if (!reconnect.enabled) return;
    if (reconnect.maxAttempts !== undefined && this.reconnectAttempt >= reconnect.maxAttempts) {
      this.logger.error(
        { attempts: this.reconnectAttempt },
        'max reconnect attempts reached, giving up',
      );
      return;
    }

    const delayMs = computeReconnectDelayMs(
      this.reconnectAttempt,
      reconnect.initialDelayMs,
      reconnect.maxDelayMs,
    );
    this.reconnectAttempt += 1;
    this.logger.info({ attempt: this.reconnectAttempt, delayMs }, 'scheduling reconnect');
    this.reconnectTimer = setTimeout(() => {
      this.attemptConnect();
    }, delayMs);
  }
}
