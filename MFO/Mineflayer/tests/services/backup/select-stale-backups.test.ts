import { describe, expect, it } from 'vitest';
import { selectStaleBackups } from '../../../src/services/backup/select-stale-backups.js';

describe('selectStaleBackups', () => {
  it('keeps the newest retainCount files and returns the rest as stale', () => {
    const fileNames = ['mfo-100.sqlite', 'mfo-300.sqlite', 'mfo-200.sqlite'];

    expect(selectStaleBackups(fileNames, 2)).toEqual(['mfo-100.sqlite']);
  });

  it('returns nothing stale when file count is within retainCount', () => {
    const fileNames = ['mfo-100.sqlite', 'mfo-200.sqlite'];

    expect(selectStaleBackups(fileNames, 5)).toEqual([]);
  });

  it('returns everything as stale when retainCount is zero', () => {
    const fileNames = ['mfo-100.sqlite', 'mfo-200.sqlite'];

    expect(selectStaleBackups(fileNames, 0)).toEqual(fileNames.slice().sort());
  });

  it('does not mutate the input array', () => {
    const fileNames = ['mfo-300.sqlite', 'mfo-100.sqlite'];
    const original = [...fileNames];

    selectStaleBackups(fileNames, 1);

    expect(fileNames).toEqual(original);
  });
});
