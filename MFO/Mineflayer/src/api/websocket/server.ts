import type { Server as HttpServer } from 'node:http';
import { Server as SocketIoServer } from 'socket.io';
import type { EventBus } from '../../core/event-bus/event-bus.js';
import type { AppEventMap } from '../../core/event-bus/events.js';
import type { Logger } from '../../core/logger/index.js';
import type { AuthService } from '../../services/auth/auth-service.js';

/** Events re-published verbatim to connected clients (ARCHITECTURE.md "WebSocket events") — no new computation, just a live feed of the internal event bus. */
const REPUBLISHED_EVENTS = [
  'FarmHealthChanged',
  'AlertOpened',
  'AlertResolved',
  'StorageUpdated',
  'ProductionUpdated',
  'WorkerVerified',
  'WorkerMissing',
  'ManagerMoved',
] as const satisfies readonly (keyof AppEventMap)[];

export interface WebSocketHandle {
  readonly io: SocketIoServer;
  readonly close: () => Promise<void>;
}

/** Attaches Socket.IO to the REST API's HTTP server (TECHNICAL_SPEC §20: Socket.IO), same server, different protocol. */
export function attachWebSocket(
  httpServer: HttpServer,
  eventBus: EventBus<AppEventMap>,
  authService: AuthService,
  logger: Logger,
): WebSocketHandle {
  const log = logger.child({ module: 'api.websocket' });
  const io = new SocketIoServer(httpServer, { cors: { origin: '*' } });

  /** Same JWT the REST API's onRequest hook checks — passed as `auth: { token }` on the client's `io(url, { auth })` call. */
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as unknown;
    if (typeof token !== 'string' || authService.verifyToken(token) === undefined) {
      next(new Error('unauthorized'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    log.debug({ socketId: socket.id }, 'client connected');
  });

  const unsubscribers = REPUBLISHED_EVENTS.map((type) =>
    eventBus.subscribe(type, (payload) => {
      io.emit(type, payload);
    }),
  );

  return {
    io,
    close: async () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      await io.close();
    },
  };
}
