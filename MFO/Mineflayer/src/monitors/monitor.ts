import type { Bot } from 'mineflayer';
import type { Logger } from '../core/logger/index.js';
import type { FarmDefinition } from '../core/registry/farm-definition.js';
import type { AppEventMap } from '../core/event-bus/events.js';

export interface MonitorContext {
  readonly bot: Bot;
  readonly farm: FarmDefinition;
  readonly logger: Logger;
  readonly signal: AbortSignal;
}

/** A single typed event a Monitor wants published; the caller (not the monitor) owns the event bus. */
export type MonitorEvent = {
  [K in keyof AppEventMap]: { readonly type: K; readonly payload: AppEventMap[K] };
}[keyof AppEventMap];

export interface MonitorResult {
  readonly events: readonly MonitorEvent[];
}

/** Independently pluggable per TECHNICAL_SPEC §8 — new monitors implement this without touching the scheduler. */
export interface Monitor {
  readonly id: string;
  supports(farm: FarmDefinition): boolean;
  execute(context: MonitorContext): Promise<MonitorResult>;
}
