import type { JobPriority } from './priority.js';

export interface JobContext {
  readonly correlationId: string;
  readonly signal: AbortSignal;
}

export interface Job<Result = void> {
  readonly type: string;
  readonly priority: JobPriority;
  run(context: JobContext): Promise<Result>;
}
