import { Link } from 'react-router-dom';
import { Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { api } from '../api/client.js';
import type { FarmSummary } from '../api/types.js';
import { useAsync } from '../lib/useAsync.js';
import { useRefreshSignal } from '../lib/useRefreshSignal.js';
import { useSocketEvent } from '../lib/SocketContext.js';
import { HealthBadge } from '../components/HealthBadge.js';

export function OverviewPage() {
  const [signal, bump] = useRefreshSignal();
  useSocketEvent('FarmHealthChanged', bump);
  useSocketEvent('AlertOpened', bump);
  useSocketEvent('AlertResolved', bump);
  useSocketEvent('StorageUpdated', bump);

  const { data: farms, loading, error } = useAsync(() => api.farms(), [signal]);

  return (
    <Stack>
      <Title order={2}>Farms</Title>
      {loading && farms === undefined && <Loader />}
      {error !== undefined && <Text c="red">Failed to load farms.</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {farms?.map((farm) => (
          <FarmCard key={farm.id} farm={farm} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function FarmCard({ farm }: { farm: FarmSummary }) {
  const { data: metrics } = useAsync(() => api.farmMetrics(farm.id), [farm.id]);

  return (
    <Card
      component={Link}
      to={`/farm/${farm.id}`}
      withBorder
      padding="lg"
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Group justify="space-between" mb="xs">
        <Text fw={600}>{farm.id}</Text>
        {metrics !== undefined && <HealthBadge status={metrics.health} />}
      </Group>
      <Text size="sm" c="dimmed">
        {farm.dimension}
      </Text>
      <Text size="sm">
        Storage:{' '}
        {metrics?.storageFillPercent !== null && metrics?.storageFillPercent !== undefined
          ? `${String(metrics.storageFillPercent)}%`
          : '—'}
      </Text>
      <Text size="sm">
        Production:{' '}
        {metrics?.production !== null && metrics?.production !== undefined
          ? `${String(Math.round(metrics.production.rollingAverageItemsPerHour))}/hr`
          : '—'}
      </Text>
    </Card>
  );
}
