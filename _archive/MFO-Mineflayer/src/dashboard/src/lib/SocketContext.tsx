import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { ServerEvents } from './socket-events.js';

const SocketContext = createContext<Socket | undefined>(undefined);

/** One socket per session, matching the backend's single Socket.IO server attached to the REST API's HTTP server. */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | undefined>(undefined);

  useEffect(() => {
    if (token === undefined) {
      setSocket(undefined);
      return;
    }
    const next = io(API_BASE_URL, { auth: { token } });
    setSocket(next);
    return () => {
      next.close();
    };
  }, [token]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

/**
 * Subscribes `handler` to `event` for as long as the component is mounted and a socket is
 * connected. `handler` is read through a ref so callers can pass an inline closure (e.g. one
 * that captures a route param) without it going stale — the socket.io listener itself is
 * registered once per socket/event pair, not re-subscribed on every render.
 */
export function useSocketEvent<K extends keyof ServerEvents>(
  event: K,
  handler: (payload: ServerEvents[K]) => void,
): void {
  const socket = useContext(SocketContext);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!socket) return;
    const listener = (payload: unknown): void => {
      handlerRef.current(payload as ServerEvents[K]);
    };
    // socket.io-client's typed `.on` overloads can't resolve a generic (non-literal) event
    // name against its reserved-event conditional type — this is the untyped escape hatch,
    // with type safety restored at useSocketEvent's own call sites via K.
    const untyped = socket as unknown as {
      on: (event: string, listener: (payload: unknown) => void) => void;
      off: (event: string, listener: (payload: unknown) => void) => void;
    };
    untyped.on(event, listener);
    return () => {
      untyped.off(event, listener);
    };
  }, [socket, event]);
}
