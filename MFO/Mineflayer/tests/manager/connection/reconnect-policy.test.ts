import { describe, expect, it } from 'vitest';
import { computeReconnectDelayMs } from '../../../src/manager/connection/reconnect-policy.js';

describe('computeReconnectDelayMs', () => {
  it('doubles the delay each attempt starting from the initial delay', () => {
    expect(computeReconnectDelayMs(0, 1000, 60000)).toBe(1000);
    expect(computeReconnectDelayMs(1, 1000, 60000)).toBe(2000);
    expect(computeReconnectDelayMs(2, 1000, 60000)).toBe(4000);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(computeReconnectDelayMs(10, 1000, 60000)).toBe(60000);
  });
});
