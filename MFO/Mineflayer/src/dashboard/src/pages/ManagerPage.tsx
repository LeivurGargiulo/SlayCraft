import { useState } from 'react';
import { Badge, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { api } from '../api/client.js';
import { useAsync } from '../lib/useAsync.js';
import { useRefreshSignal } from '../lib/useRefreshSignal.js';
import { useSocketEvent } from '../lib/SocketContext.js';
import type { ServerEvents } from '../lib/socket-events.js';

export function ManagerPage() {
  const [signal, bump] = useRefreshSignal();
  const [lastMove, setLastMove] = useState<ServerEvents['ManagerMoved'] | undefined>(undefined);
  useSocketEvent('ManagerMoved', setLastMove);

  const { data: manager, loading } = useAsync(() => api.manager(), [signal]);

  useSocketEvent('WorkerMissing', bump);

  if (loading && manager === undefined) return <Loader />;
  if (manager === undefined) return null;

  return (
    <Stack>
      <Title order={2}>Manager</Title>

      <Card withBorder>
        <Group justify="space-between">
          <Text fw={600}>Connection</Text>
          <Badge color={manager.connected ? 'green' : 'red'}>
            {manager.connected ? 'connected' : 'offline'}
          </Badge>
        </Group>
        {manager.host !== undefined && (
          <Text size="sm" c="dimmed">
            {manager.username}@{manager.host}:{manager.port}
          </Text>
        )}
        {manager.lastConnectedAt !== undefined && manager.lastConnectedAt !== null && (
          <Text size="sm">
            Last connected: {new Date(manager.lastConnectedAt).toLocaleString()}
          </Text>
        )}
        {!manager.connected &&
          manager.lastDisconnectReason !== undefined &&
          manager.lastDisconnectReason !== null && (
            <Text size="sm" c="red">
              Disconnect reason: {manager.lastDisconnectReason}
            </Text>
          )}
      </Card>

      <Card withBorder>
        <Text fw={600} mb="xs">
          Last movement
        </Text>
        {lastMove ? (
          <Text size="sm">
            {lastMove.farmId ?? 'unknown farm'} · ({lastMove.position.x}, {lastMove.position.y},{' '}
            {lastMove.position.z}) in {lastMove.dimension} at{' '}
            {new Date(lastMove.occurredAt).toLocaleTimeString()}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            No movement observed this session.
          </Text>
        )}
      </Card>

      <Text size="sm" c="dimmed">
        Current task, queue depth, and latency aren't exposed by the Manager yet — see
        docs/PROGRESS.md.
      </Text>
    </Stack>
  );
}
