import type { ManagerConnection } from '../connection/manager-connection.js';
import type { Logger } from '../../core/logger/index.js';
import type { Vector3 } from '../../shared/types/vector3.js';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import { TeleportError } from './teleport-error.js';

const DEFAULT_TIMEOUT_MS = 5000;

export interface TeleportServiceDeps {
  readonly connection: ManagerConnection;
  readonly eventBus: EventBus<AppEventMap>;
  readonly logger: Logger;
  readonly timeoutMs?: number;
}

/** Issues the Manager's only allowed movement: an instant, cross-dimension teleport via command. */
export class TeleportService {
  private readonly connection: ManagerConnection;
  private readonly eventBus: EventBus<AppEventMap>;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(deps: TeleportServiceDeps) {
    this.connection = deps.connection;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger.child({ module: 'manager.teleport' });
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Resolves once the server confirms the teleport (a forced position update); rejects on timeout, abort, or disconnect. `farmId` is passed through to `ManagerMoved` for callers that have one (dashboard's live camera view). */
  async teleport(
    position: Vector3,
    dimension: string,
    signal?: AbortSignal,
    farmId?: string,
  ): Promise<void> {
    const bot = this.connection.getBot();
    if (!bot) throw new TeleportError('cannot teleport: manager is not connected');
    if (signal?.aborted) throw new TeleportError('teleport aborted');

    const { x, y, z } = position;
    const command = `/execute in minecraft:${dimension} run tp @s ${String(x)} ${String(y)} ${String(z)}`;
    this.logger.info({ dimension, position }, 'teleporting');

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        bot.removeListener('forcedMove', onForcedMove);
        signal?.removeEventListener('abort', onAbort);
      };
      const onForcedMove = (): void => {
        cleanup();
        resolve();
      };
      const onAbort = (): void => {
        cleanup();
        reject(new TeleportError('teleport aborted'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new TeleportError(`teleport to ${JSON.stringify(position)} timed out`));
      }, this.timeoutMs);

      bot.once('forcedMove', onForcedMove);
      signal?.addEventListener('abort', onAbort, { once: true });
      bot.chat(command);
    });

    this.logger.info({ dimension, position }, 'teleport confirmed');
    this.eventBus.publish('ManagerMoved', {
      occurredAt: new Date(),
      position,
      dimension,
      ...(farmId !== undefined ? { farmId } : {}),
    });
  }
}
