import { Badge } from '@mantine/core';
import type { FarmHealthStatus } from '../api/types.js';

const COLOR: Record<FarmHealthStatus, string> = {
  HEALTHY: 'green',
  WARNING: 'yellow',
  CRITICAL: 'red',
  OFFLINE: 'gray',
  UNKNOWN: 'gray',
};

export function HealthBadge({ status }: { status: FarmHealthStatus }) {
  return (
    <Badge color={COLOR[status]} variant="light">
      {status}
    </Badge>
  );
}
