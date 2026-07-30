import { JobPriority } from './priority.js';

interface Prioritized {
  readonly priority: JobPriority;
}

const PRIORITY_LEVELS = [
  JobPriority.CRITICAL,
  JobPriority.HIGH,
  JobPriority.NORMAL,
  JobPriority.LOW,
] as const;

export class PriorityQueue<T extends Prioritized> {
  private readonly queues: Record<JobPriority, T[]> = {
    [JobPriority.CRITICAL]: [],
    [JobPriority.HIGH]: [],
    [JobPriority.NORMAL]: [],
    [JobPriority.LOW]: [],
  };

  enqueue(item: T): void {
    this.queues[item.priority].push(item);
  }

  dequeue(): T | undefined {
    for (const level of PRIORITY_LEVELS) {
      const item = this.queues[level].shift();
      if (item !== undefined) return item;
    }
    return undefined;
  }

  get size(): number {
    let total = 0;
    for (const level of PRIORITY_LEVELS) {
      total += this.queues[level].length;
    }
    return total;
  }

  get isEmpty(): boolean {
    return this.size === 0;
  }
}
