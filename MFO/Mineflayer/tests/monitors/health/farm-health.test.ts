import { describe, expect, it } from 'vitest';
import { computeFarmHealth } from '../../../src/monitors/health/farm-health.js';

describe('computeFarmHealth', () => {
  it('is OFFLINE when the manager is disconnected, regardless of other inputs', () => {
    expect(
      computeFarmHealth({ managerConnected: false, workerPresent: true, chunksLoaded: true }),
    ).toEqual({ status: 'OFFLINE' });
  });

  it('is UNKNOWN when the manager is connected but the farm has never been scanned', () => {
    expect(computeFarmHealth({ managerConnected: true })).toEqual({ status: 'UNKNOWN' });
  });

  it('is CRITICAL when the worker is missing', () => {
    expect(computeFarmHealth({ managerConnected: true, workerPresent: false })).toEqual({
      status: 'CRITICAL',
      reason: 'worker_missing',
    });
  });

  it('is CRITICAL when a chunk is unloaded', () => {
    expect(
      computeFarmHealth({ managerConnected: true, workerPresent: true, chunksLoaded: false }),
    ).toEqual({ status: 'CRITICAL', reason: 'chunk_unloaded' });
  });

  it('is WARNING when storage is full', () => {
    expect(
      computeFarmHealth({
        managerConnected: true,
        workerPresent: true,
        chunksLoaded: true,
        storageFillPercent: 100,
      }),
    ).toEqual({ status: 'WARNING', reason: 'storage_full' });
  });

  it('is WARNING when output is exactly zero', () => {
    expect(
      computeFarmHealth({
        managerConnected: true,
        workerPresent: true,
        chunksLoaded: true,
        storageFillPercent: 40,
        itemsPerHour: 0,
      }),
    ).toEqual({ status: 'WARNING', reason: 'output_zero' });
  });

  it('is HEALTHY when everything checks out', () => {
    expect(
      computeFarmHealth({
        managerConnected: true,
        workerPresent: true,
        chunksLoaded: true,
        storageFillPercent: 40,
        itemsPerHour: 120,
      }),
    ).toEqual({ status: 'HEALTHY' });
  });

  it('does not treat unmeasured production (undefined) as output zero', () => {
    expect(
      computeFarmHealth({
        managerConnected: true,
        workerPresent: true,
        chunksLoaded: true,
        storageFillPercent: 40,
      }),
    ).toEqual({ status: 'HEALTHY' });
  });
});
