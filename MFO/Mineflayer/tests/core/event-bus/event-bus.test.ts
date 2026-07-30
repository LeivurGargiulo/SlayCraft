import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../src/core/event-bus/event-bus.js';

interface TestEventMap {
  Ping: { readonly value: number };
  Pong: { readonly value: string };
}

describe('EventBus', () => {
  it('delivers a published event to a subscriber', () => {
    const bus = new EventBus<TestEventMap>();
    const handler = vi.fn();

    bus.subscribe('Ping', handler);
    bus.publish('Ping', { value: 42 });

    expect(handler).toHaveBeenCalledExactlyOnceWith({ value: 42 });
  });

  it('delivers to every subscriber of the same event', () => {
    const bus = new EventBus<TestEventMap>();
    const first = vi.fn();
    const second = vi.fn();

    bus.subscribe('Ping', first);
    bus.subscribe('Ping', second);
    bus.publish('Ping', { value: 1 });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps event types isolated from each other', () => {
    const bus = new EventBus<TestEventMap>();
    const pingHandler = vi.fn();
    const pongHandler = vi.fn();

    bus.subscribe('Ping', pingHandler);
    bus.subscribe('Pong', pongHandler);
    bus.publish('Ping', { value: 1 });

    expect(pingHandler).toHaveBeenCalledTimes(1);
    expect(pongHandler).not.toHaveBeenCalled();
  });

  it('stops delivering events once unsubscribed', () => {
    const bus = new EventBus<TestEventMap>();
    const handler = vi.fn();

    const unsubscribe = bus.subscribe('Ping', handler);
    unsubscribe();
    bus.publish('Ping', { value: 1 });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not throw when publishing an event with no subscribers', () => {
    const bus = new EventBus<TestEventMap>();

    expect(() => {
      bus.publish('Ping', { value: 1 });
    }).not.toThrow();
  });
});
