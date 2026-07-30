import { describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../../src/core/config/index.js';

describe('loadAppConfig', () => {
  it('loads and validates the checked-in example config/ files', () => {
    const config = loadAppConfig('config');

    expect(config.manager.bot.username).toBe('MFO-Manager');
    expect(config.farms.farms.iron?.carpetWorker).toBe('Shulker');
    expect(config.logging.level).toBe('info');
  });
});
