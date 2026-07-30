import { useParams } from 'react-router-dom';
import { Badge, Card, Group, Loader, Progress, Stack, Table, Text, Title } from '@mantine/core';
import { api } from '../api/client.js';
import { useAsync } from '../lib/useAsync.js';
import { useRefreshSignal } from '../lib/useRefreshSignal.js';
import { useSocketEvent } from '../lib/SocketContext.js';
import { HealthBadge } from '../components/HealthBadge.js';
import { Chart } from '../components/Chart.js';
import type { EChartsOption } from 'echarts';

export function FarmPage() {
  const { id } = useParams<{ id: string }>();
  const farmId = id ?? '';
  const [signal, bump] = useRefreshSignal();
  useSocketEvent('FarmHealthChanged', (event) => {
    if (event.farmId === farmId) bump();
  });
  useSocketEvent('StorageUpdated', (event) => {
    if (event.farmId === farmId) bump();
  });
  useSocketEvent('ProductionUpdated', (event) => {
    if (event.farmId === farmId) bump();
  });
  useSocketEvent('WorkerVerified', (event) => {
    if (event.farmId === farmId) bump();
  });
  useSocketEvent('WorkerMissing', (event) => {
    if (event.farmId === farmId) bump();
  });

  const { data: farm, loading } = useAsync(() => api.farm(farmId), [farmId, signal]);
  const { data: storage } = useAsync(() => api.farmStorage(farmId), [farmId, signal]);
  const { data: production } = useAsync(
    () => api.farmProductionHistory(farmId, 50),
    [farmId, signal],
  );
  const { data: alerts } = useAsync(() => api.farmAlerts(farmId, 10), [farmId, signal]);

  if (loading && farm === undefined) return <Loader />;
  if (farm === undefined) return <Text c="red">Farm not found.</Text>;

  const productionOption: EChartsOption = {
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: 'items/hour' },
    series: [
      {
        type: 'line',
        showSymbol: false,
        data: [...(production ?? [])]
          .reverse()
          .map((row) => [row.occurredAt, row.rollingAverageItemsPerHour]),
      },
    ],
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{farm.id}</Title>
        {farm.health !== null && <HealthBadge status={farm.health.status} />}
      </Group>
      <Text c="dimmed">
        {farm.dimension} · ({farm.teleport.x}, {farm.teleport.y}, {farm.teleport.z})
      </Text>

      <Card withBorder>
        <Title order={4} mb="sm">
          Worker
        </Title>
        {farm.worker === null ? (
          <Text c="dimmed">No scan yet.</Text>
        ) : (
          <Group>
            <Badge color={farm.worker.present ? 'green' : 'red'}>
              {farm.worker.present ? 'present' : 'missing'}
            </Badge>
            {farm.worker.atExpectedPosition !== null && (
              <Badge color={farm.worker.atExpectedPosition ? 'green' : 'orange'} variant="light">
                {farm.worker.atExpectedPosition ? 'in position' : 'out of position'}
              </Badge>
            )}
            {farm.worker.alive !== null && (
              <Badge color={farm.worker.alive ? 'green' : 'red'} variant="light">
                {farm.worker.alive ? 'alive' : 'dead'}
              </Badge>
            )}
          </Group>
        )}
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Storage
        </Title>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th>
              <Table.Th>Position</Table.Th>
              <Table.Th>Fill</Table.Th>
              <Table.Th>Items</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {storage?.map((container) => (
              <Table.Tr key={container.id}>
                <Table.Td>{container.containerType}</Table.Td>
                <Table.Td>
                  ({container.x}, {container.y}, {container.z})
                </Table.Td>
                <Table.Td w={160}>
                  <Progress value={container.fillPercent} size="sm" />
                  <Text size="xs" c="dimmed">
                    {container.fillPercent}%
                  </Text>
                </Table.Td>
                <Table.Td>{container.totalItemCount}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {storage?.length === 0 && (
          <Text c="dimmed" size="sm">
            No storage scanned yet.
          </Text>
        )}
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Production
        </Title>
        <Chart option={productionOption} />
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Recent alerts
        </Title>
        <Stack gap="xs">
          {alerts?.map((alert) => (
            <Group key={alert.id} justify="space-between">
              <Text size="sm">
                <Badge size="sm" color={alert.severity === 'critical' ? 'red' : 'yellow'} mr="xs">
                  {alert.state}
                </Badge>
                {alert.message}
              </Text>
            </Group>
          ))}
          {alerts?.length === 0 && (
            <Text c="dimmed" size="sm">
              No alerts.
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
