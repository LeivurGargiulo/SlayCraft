import { EventEmitter } from 'node:events';

export class EventBus<EventMap extends object> {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish<K extends keyof EventMap & string>(type: K, payload: EventMap[K]): void {
    this.emitter.emit(type, payload);
  }

  subscribe<K extends keyof EventMap & string>(
    type: K,
    handler: (payload: EventMap[K]) => void,
  ): () => void {
    this.emitter.on(type, handler);
    return () => {
      this.emitter.off(type, handler);
    };
  }
}
