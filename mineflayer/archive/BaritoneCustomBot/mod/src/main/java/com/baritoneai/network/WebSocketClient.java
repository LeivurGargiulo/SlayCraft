package com.baritoneai.network;

import com.google.gson.JsonObject;
import org.java_websocket.handshake.ServerHandshake;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.util.concurrent.*;
import java.util.function.Consumer;

public class WebSocketClient {

    private static final Logger LOGGER = LoggerFactory.getLogger("BaritoneAI-WS");
    private static final String DEFAULT_URI = "ws://localhost:3000";
    private static final int RECONNECT_DELAY_MS = 5000;
    private static final int HEARTBEAT_INTERVAL_MS = 15000;
    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final int MAX_QUEUE_SIZE = 100;

    private org.java_websocket.client.WebSocketClient client;
    private Consumer<JsonObject> onMessageCallback;
    private final ConcurrentLinkedQueue<String> outgoingQueue = new ConcurrentLinkedQueue<>();
    private ScheduledExecutorService scheduler;
    private volatile boolean shouldReconnect = true;
    private volatile boolean connected = false;

    public void connect(Consumer<JsonObject> onMessage) {
        this.onMessageCallback = onMessage;
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "BaritoneAI-WS-Scheduler");
            t.setDaemon(true);
            return t;
        });

        scheduler.execute(this::doConnect);
        startHeartbeat();
    }

    private void doConnect() {
        try {
            URI uri = new URI(DEFAULT_URI);
            client = new org.java_websocket.client.WebSocketClient(uri) {
                @Override
                public void onOpen(ServerHandshake handshake) {
                    connected = true;
                    LOGGER.info("Connected to backend at {}", DEFAULT_URI);
                    flushQueue();
                }

                @Override
                public void onMessage(String message) {
                    try {
                        JsonObject parsed = MessageHandler.parse(message);
                        if (onMessageCallback != null) {
                            onMessageCallback.accept(parsed);
                        }
                    } catch (Exception e) {
                        LOGGER.error("Failed to parse incoming message: {}", e.getMessage());
                    }
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    connected = false;
                    LOGGER.info("Disconnected from backend (code={}, reason={}, remote={})", code, reason, remote);
                    scheduleReconnect();
                }

                @Override
                public void onError(Exception ex) {
                    LOGGER.error("WebSocket error: {}", ex.getMessage());
                }
            };

            LOGGER.info("Connecting to backend at {}...", DEFAULT_URI);
            client.connectBlocking(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            LOGGER.warn("Connection attempt failed: {}", e.getMessage());
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (shouldReconnect && scheduler != null && !scheduler.isShutdown()) {
            LOGGER.info("Reconnecting in {} ms...", RECONNECT_DELAY_MS);
            scheduler.schedule(this::doConnect, RECONNECT_DELAY_MS, TimeUnit.MILLISECONDS);
        }
    }

    public void send(String message) {
        if (connected && client != null && client.isOpen()) {
            try {
                client.send(message);
            } catch (Exception e) {
                LOGGER.error("Failed to send message: {}", e.getMessage());
                enqueueWithLimit(message);
            }
        } else {
            enqueueWithLimit(message);
        }
    }

    private void enqueueWithLimit(String message) {
        while (outgoingQueue.size() >= MAX_QUEUE_SIZE) {
            outgoingQueue.poll(); // Drop oldest to prevent unbounded growth
        }
        outgoingQueue.offer(message);
    }

    private void flushQueue() {
        String msg;
        while ((msg = outgoingQueue.poll()) != null) {
            if (client != null && client.isOpen()) {
                try {
                    client.send(msg);
                } catch (Exception e) {
                    LOGGER.error("Failed to flush queued message: {}", e.getMessage());
                    break;
                }
            }
        }
    }

    private void startHeartbeat() {
        scheduler.scheduleAtFixedRate(() -> {
            if (connected && client != null && client.isOpen()) {
                try {
                    client.sendPing();
                } catch (Exception e) {
                    LOGGER.debug("Heartbeat ping failed: {}", e.getMessage());
                }
            }
        }, HEARTBEAT_INTERVAL_MS, HEARTBEAT_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }

    public void disconnect() {
        shouldReconnect = false;
        if (client != null) {
            try {
                client.close();
            } catch (Exception e) {
                LOGGER.debug("Error closing WebSocket: {}", e.getMessage());
            }
        }
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        LOGGER.info("WebSocket client shut down");
    }

    public boolean isConnected() {
        return connected;
    }
}
