import { describe, expect, it } from 'vitest';
import { PriorityQueue } from '../../../src/core/scheduler/priority-queue.js';
import { JobPriority } from '../../../src/core/scheduler/priority.js';

interface Item {
  readonly priority: JobPriority;
  readonly label: string;
}

describe('PriorityQueue', () => {
  it('dequeues higher-priority items before lower-priority ones', () => {
    const queue = new PriorityQueue<Item>();
    queue.enqueue({ priority: JobPriority.LOW, label: 'low' });
    queue.enqueue({ priority: JobPriority.CRITICAL, label: 'critical' });
    queue.enqueue({ priority: JobPriority.NORMAL, label: 'normal' });
    queue.enqueue({ priority: JobPriority.HIGH, label: 'high' });

    expect(queue.dequeue()?.label).toBe('critical');
    expect(queue.dequeue()?.label).toBe('high');
    expect(queue.dequeue()?.label).toBe('normal');
    expect(queue.dequeue()?.label).toBe('low');
    expect(queue.dequeue()).toBeUndefined();
  });

  it('preserves FIFO order within the same priority level', () => {
    const queue = new PriorityQueue<Item>();
    queue.enqueue({ priority: JobPriority.NORMAL, label: 'first' });
    queue.enqueue({ priority: JobPriority.NORMAL, label: 'second' });

    expect(queue.dequeue()?.label).toBe('first');
    expect(queue.dequeue()?.label).toBe('second');
  });

  it('tracks size and emptiness', () => {
    const queue = new PriorityQueue<Item>();
    expect(queue.isEmpty).toBe(true);

    queue.enqueue({ priority: JobPriority.LOW, label: 'a' });
    expect(queue.size).toBe(1);
    expect(queue.isEmpty).toBe(false);

    queue.dequeue();
    expect(queue.isEmpty).toBe(true);
  });
});
