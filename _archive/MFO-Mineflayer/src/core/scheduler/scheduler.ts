import { randomUUID } from 'node:crypto';
import type { Logger } from '../logger/index.js';
import { PriorityQueue } from './priority-queue.js';
import type { Job, JobContext } from './job.js';

interface QueuedJob {
  readonly job: Job<unknown>;
  readonly priority: Job['priority'];
  readonly correlationId: string;
}

export class Scheduler {
  private readonly queue = new PriorityQueue<QueuedJob>();
  private readonly logger: Logger;
  private processing = false;
  private currentAbortController: AbortController | undefined;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'core.scheduler' });
  }

  enqueue(job: Job<unknown>): string {
    const correlationId = randomUUID();
    this.queue.enqueue({ job, priority: job.priority, correlationId });
    this.logger.info({ correlationId, jobType: job.type, priority: job.priority }, 'job enqueued');
    void this.processQueue();
    return correlationId;
  }

  get pendingJobCount(): number {
    return this.queue.size;
  }

  get isProcessing(): boolean {
    return this.processing;
  }

  shutdown(): void {
    this.currentAbortController?.abort();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    let next = this.queue.dequeue();
    while (next !== undefined) {
      await this.runJob(next);
      next = this.queue.dequeue();
    }

    this.processing = false;
  }

  private async runJob(queued: QueuedJob): Promise<void> {
    const { job, correlationId } = queued;
    const controller = new AbortController();
    this.currentAbortController = controller;
    const context: JobContext = { correlationId, signal: controller.signal };
    const startedAt = Date.now();
    const log = this.logger.child({ correlationId, jobType: job.type });

    log.info('job started');
    try {
      await job.run(context);
      log.info({ durationMs: Date.now() - startedAt }, 'job completed');
    } catch (error) {
      log.error({ err: error, durationMs: Date.now() - startedAt }, 'job failed');
    } finally {
      this.currentAbortController = undefined;
    }
  }
}
