import { describe, expect, it } from 'vitest';
import { formatKickReason } from '../../../src/manager/connection/kick-reason.js';

describe('formatKickReason', () => {
  it('returns plain string reasons unchanged', () => {
    expect(formatKickReason('server restart')).toBe('server restart');
  });

  it('flattens an NBT-encoded chat component into plain text', () => {
    const reason = {
      type: 'compound',
      value: {
        text: { type: 'string', value: 'This server requires ' },
        extra: {
          type: 'list',
          value: {
            type: 'compound',
            value: [
              { color: { type: 'string', value: 'green' }, text: { type: 'string', value: 'Fabric' } },
              { '': { type: 'string', value: ' installed!' } },
            ],
          },
        },
      },
    };

    expect(formatKickReason(reason)).toBe('This server requires Fabric installed!');
  });
});
