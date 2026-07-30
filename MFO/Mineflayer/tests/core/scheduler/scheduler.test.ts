import { describe, expect, it, vi } from 'vitest';
import { Scheduler } from '../../../src/core/scheduler/scheduler.js';
import { JobPriority } from '../../../src/core/scheduler/priority.js';
import type { Job } from '../../../src/core/scheduler/job.js';
import { createLogger } from '../../../src/core/logger/logger.js';

function createSilentLogger() {
  return createLogger({
    level: 'silent',
    pretty: false,
    file: { enabled: false, path: 'unused.log' },
  });
}

async function waitUntilIdle(scheduler: Scheduler): Promise<void> {
  await vi.waitFor(() => {
    if (scheduler.isProcessing || scheduler.pendingJobCount > 0) {
      throw new Error('scheduler still has work in flight');
    }
  });
}

describe('Scheduler', () => {
  it('runs a job queued while idle and started running before higher-priority jobs arrive, then drains by priority', async () => {
    const order: string[] = [];
    const makeJob = (type: string, priority: JobPriority): Job => ({
      type,
      priority,
      run: () => {
        order.push(type);
        return Promise.resolve();
      },
    });

    const scheduler = new Scheduler(createSilentLogger());
    scheduler.enqueue(makeJob('low', JobPriority.LOW));
    scheduler.enqueue(makeJob('critical', JobPriority.CRITICAL));
    scheduler.enqueue(makeJob('normal', JobPriority.NORMAL));

    await waitUntilIdle(scheduler);

    expect(order).toEqual(['low', 'critical', 'normal']);
  });

  it('keeps processing subsequent jobs after one job fails', async () => {
    const order: string[] = [];
    const failingJob: Job = {
      type: 'failing',
      priority: JobPriority.NORMAL,
      run: () => Promise.reject(new Error('boom')),
    };
    const succeedingJob: Job = {
      type: 'succeeding',
      priority: JobPriority.NORMAL,
      run: () => {
        order.push('succeeding');
        return Promise.resolve();
      },
    };

    const scheduler = new Scheduler(createSilentLogger());
    scheduler.enqueue(failingJob);
    scheduler.enqueue(succeedingJob);

    await waitUntilIdle(scheduler);

    expect(order).toEqual(['succeeding']);
  });

  it('assigns a unique correlation ID per job and passes it to the job context', async () => {
    const seenCorrelationIds: string[] = [];
    const makeJob = (): Job => ({
      type: 'record-correlation-id',
      priority: JobPriority.NORMAL,
      run: (context) => {
        seenCorrelationIds.push(context.correlationId);
        return Promise.resolve();
      },
    });

    const scheduler = new Scheduler(createSilentLogger());
    const returnedId = scheduler.enqueue(makeJob());
    scheduler.enqueue(makeJob());

    await waitUntilIdle(scheduler);

    expect(seenCorrelationIds).toHaveLength(2);
    expect(seenCorrelationIds[0]).toBe(returnedId);
    expect(seenCorrelationIds[0]).not.toBe(seenCorrelationIds[1]);
  });

  it('aborts the running job signal on shutdown', async () => {
    let aborted = false;
    const job: Job = {
      type: 'abortable',
      priority: JobPriority.NORMAL,
      run: (context) =>
        new Promise<void>((resolve) => {
          context.signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          });
        }),
    };

    const scheduler = new Scheduler(createSilentLogger());
    scheduler.enqueue(job);
    scheduler.shutdown();

    await waitUntilIdle(scheduler);

    expect(aborted).toBe(true);
  });
});
