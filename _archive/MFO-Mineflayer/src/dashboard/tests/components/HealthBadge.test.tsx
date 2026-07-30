import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HealthBadge } from '../../src/components/HealthBadge.js';
import type { FarmHealthStatus } from '../../src/api/types.js';
import { renderWithMantine } from '../test-utils.js';

describe('HealthBadge', () => {
  it.each(['HEALTHY', 'WARNING', 'CRITICAL', 'OFFLINE', 'UNKNOWN'] as const satisfies readonly FarmHealthStatus[])(
    'renders the %s status text',
    (status) => {
      renderWithMantine(<HealthBadge status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    },
  );
});
