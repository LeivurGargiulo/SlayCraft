import { Link } from 'react-router-dom';
import { Badge, Button, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { api } from '../api/client.js';
import { useAsync } from '../lib/useAsync.js';
import { useRefreshSignal } from '../lib/useRefreshSignal.js';
import { useSocketEvent } from '../lib/SocketContext.js';

export function AlertsPage() {
  const [signal, bump] = useRefreshSignal();
  useSocketEvent('AlertOpened', bump);
  useSocketEvent('AlertResolved', bump);

  const { data: alerts, loading } = useAsync(() => api.alerts(100), [signal]);

  const acknowledge = (alertId: number) => {
    api
      .acknowledgeAlert(alertId)
      .then(bump)
      .catch(() => undefined);
  };

  return (
    <Stack>
      <Title order={2}>Alerts</Title>
      {loading && alerts === undefined && <Loader />}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>State</Table.Th>
            <Table.Th>Farm</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Message</Table.Th>
            <Table.Th>Opened</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {alerts?.map((alert) => (
            <Table.Tr key={alert.id}>
              <Table.Td>
                <Badge color={alert.severity === 'critical' ? 'red' : 'yellow'} variant="light">
                  {alert.state}
                </Badge>
              </Table.Td>
              <Table.Td>
                {alert.farmId !== null ? (
                  <Text component={Link} to={`/farm/${alert.farmId}`} size="sm">
                    {alert.farmId}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">
                    manager
                  </Text>
                )}
              </Table.Td>
              <Table.Td>{alert.type}</Table.Td>
              <Table.Td>{alert.message}</Table.Td>
              <Table.Td>{new Date(alert.openedAt).toLocaleString()}</Table.Td>
              <Table.Td>
                {alert.state === 'OPEN' && (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      acknowledge(alert.id);
                    }}
                  >
                    Acknowledge
                  </Button>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {alerts?.length === 0 && (
        <Group justify="center">
          <Text c="dimmed">No alerts.</Text>
        </Group>
      )}
    </Stack>
  );
}
