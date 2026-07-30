import { Link } from 'react-router-dom';
import { Badge, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { api } from '../api/client.js';
import type { FarmSummary } from '../api/types.js';
import { useAsync } from '../lib/useAsync.js';
import { useRefreshSignal } from '../lib/useRefreshSignal.js';
import { useSocketEvent } from '../lib/SocketContext.js';

export function WorkersPage() {
  const [signal, bump] = useRefreshSignal();
  useSocketEvent('WorkerVerified', bump);
  useSocketEvent('WorkerMissing', bump);

  const { data: farms, loading } = useAsync(() => api.farms(), [signal]);

  return (
    <Stack>
      <Title order={2}>Workers</Title>
      {loading && farms === undefined && <Loader />}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Farm</Table.Th>
            <Table.Th>Worker</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Position</Table.Th>
            <Table.Th>Alive</Table.Th>
            <Table.Th>Last seen</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {farms?.map((farm) => (
            <WorkerRowLine key={farm.id} farm={farm} />
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function WorkerRowLine({ farm }: { farm: FarmSummary }) {
  const { data: worker } = useAsync(() => api.farmWorker(farm.id), [farm.id]);

  return (
    <Table.Tr>
      <Table.Td>
        <Text component={Link} to={`/farm/${farm.id}`} size="sm">
          {farm.id}
        </Text>
      </Table.Td>
      <Table.Td>{farm.carpetWorker}</Table.Td>
      <Table.Td>
        {worker === undefined || worker === null ? (
          '—'
        ) : (
          <Badge color={worker.present ? 'green' : 'red'} variant="light">
            {worker.present ? 'present' : 'missing'}
          </Badge>
        )}
      </Table.Td>
      <Table.Td>
        {formatTriState(worker?.atExpectedPosition, 'in position', 'out of position')}
      </Table.Td>
      <Table.Td>{formatTriState(worker?.alive, 'yes', 'no')}</Table.Td>
      <Table.Td>{formatLastSeen(worker?.lastSeenAt)}</Table.Td>
    </Table.Tr>
  );
}

function formatTriState(
  value: boolean | null | undefined,
  whenTrue: string,
  whenFalse: string,
): string {
  if (value === undefined || value === null) return '—';
  return value ? whenTrue : whenFalse;
}

function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (lastSeenAt === undefined || lastSeenAt === null) return '—';
  return new Date(lastSeenAt).toLocaleString();
}
