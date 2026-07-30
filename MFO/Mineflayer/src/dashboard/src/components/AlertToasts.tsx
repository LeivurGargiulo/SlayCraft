import { notifications } from '@mantine/notifications';
import { useSocketEvent } from '../lib/SocketContext.js';

/** Surfaces AlertOpened as a toast anywhere in the dashboard, not just on the Alerts page. */
export function AlertToasts() {
  useSocketEvent('AlertOpened', (event) => {
    notifications.show({
      title: event.farmId ?? 'manager',
      message: event.message,
      color: event.severity === 'critical' ? 'red' : 'yellow',
    });
  });
  return null;
}
