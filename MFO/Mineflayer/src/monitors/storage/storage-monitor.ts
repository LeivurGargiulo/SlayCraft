import { Vec3 } from 'vec3';
import type { Bot } from 'mineflayer';
import type { Logger } from '../../core/logger/index.js';
import type { ContainerDefinition, FarmDefinition } from '../../core/registry/farm-definition.js';
import type { ScannedItem } from '../../core/event-bus/events.js';
import type { Monitor, MonitorContext, MonitorEvent, MonitorResult } from '../monitor.js';

interface ContainerScan {
  readonly capacity: number;
  readonly occupiedSlots: number;
  readonly fillPercent: number;
  readonly items: readonly ScannedItem[];
}

function toFillPercent(occupiedSlots: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((occupiedSlots / capacity) * 1000) / 10;
}

/** Opens one container, reads it, and closes it. Only one window can be open at a time. */
async function scanContainer(
  bot: Bot,
  container: ContainerDefinition,
  logger: Logger,
): Promise<ContainerScan | undefined> {
  const { x, y, z } = container.position;
  const block = bot.blockAt(new Vec3(x, y, z));
  if (!block) {
    logger.warn(
      { position: container.position },
      'container position has no loaded block, skipping',
    );
    return undefined;
  }

  let window;
  try {
    window = await bot.openContainer(block);
  } catch (error) {
    logger.warn({ err: error, position: container.position }, 'failed to open container, skipping');
    return undefined;
  }

  try {
    const capacity = window.inventoryStart;
    const items: ScannedItem[] = window
      .containerItems()
      .map((item) => ({ itemId: item.name, count: item.count }));
    const occupiedSlots = items.length;
    return { capacity, occupiedSlots, fillPercent: toFillPercent(occupiedSlots, capacity), items };
  } finally {
    bot.closeWindow(window);
  }
}

/** Reads configured containers (chest, double chest, barrel, shulker box) read-only. */
export class StorageMonitor implements Monitor {
  readonly id = 'storage';

  supports(farm: FarmDefinition): boolean {
    return farm.containers.length > 0;
  }

  async execute(context: MonitorContext): Promise<MonitorResult> {
    const { bot, farm, logger, signal } = context;
    const events: MonitorEvent[] = [];
    const fillPercents: number[] = [];

    for (const container of farm.containers) {
      signal.throwIfAborted();
      const scan = await scanContainer(bot, container, logger);
      if (!scan) continue;

      fillPercents.push(scan.fillPercent);
      events.push({
        type: 'ContainerScanned',
        payload: {
          occurredAt: new Date(),
          farmId: farm.id,
          containerType: container.type,
          position: container.position,
          ...scan,
        },
      });
    }

    if (fillPercents.length > 0) {
      const averageFillPercent =
        Math.round(
          (fillPercents.reduce((sum, fillPercent) => sum + fillPercent, 0) / fillPercents.length) *
            10,
        ) / 10;
      events.push({
        type: 'StorageUpdated',
        payload: {
          occurredAt: new Date(),
          farmId: farm.id,
          averageFillPercent,
          containerCount: fillPercents.length,
        },
      });
    }

    return { events };
  }
}
