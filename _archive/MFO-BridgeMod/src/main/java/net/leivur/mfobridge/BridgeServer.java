package net.leivur.mfobridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/**
 * Loopback-only TCP/NDJSON server per {@code docs/BRIDGE_MOD_PROTOCOL.md}. Deliberately has no
 * Minecraft-API dependency — command execution is delegated to a {@link CommandDispatcher} — so
 * the transport (framing, loopback enforcement, response/event envelopes) is testable without a
 * running game client. See {@link net.leivur.mfobridge.selftest.BridgeServerSelfCheckMain}.
 */
public final class BridgeServer {
	private final int port;
	private final CommandDispatcher dispatcher;
	private final Consumer<String> log;
	private final Set<Connection> connections = ConcurrentHashMap.newKeySet();
	private final AtomicLong eventIdCounter = new AtomicLong();

	private ServerSocket serverSocket;
	private volatile boolean running;

	public BridgeServer(int port, CommandDispatcher dispatcher, Consumer<String> log) {
		this.port = port;
		this.dispatcher = dispatcher;
		this.log = log;
	}

	/**
	 * Binds only to 127.0.0.1: the OS refuses any non-loopback peer before a connection is even
	 * accepted, which is simpler and more airtight than accepting broadly and filtering after.
	 */
	public void start() throws IOException {
		serverSocket = new ServerSocket(port, 50, InetAddress.getByName("127.0.0.1"));
		running = true;
		Thread acceptThread = new Thread(this::acceptLoop, "mfo-bridge-accept");
		acceptThread.setDaemon(true);
		acceptThread.start();
		log.accept("bridge server listening on 127.0.0.1:" + port);
	}

	/** The actually-bound port — useful when constructed with port 0 (OS-assigned), e.g. in tests. */
	public int getBoundPort() {
		return serverSocket.getLocalPort();
	}

	/** The address the server socket is bound to — should always be 127.0.0.1, verified in tests. */
	public InetAddress getBoundPortAddress() {
		return serverSocket.getInetAddress();
	}

	public void stop() {
		running = false;
		closeQuietly(serverSocket);
		for (Connection connection : connections) {
			connection.close();
		}
		connections.clear();
	}

	/** Sends an unsolicited event ({@code connected}/{@code disconnected}/{@code error}) to every open connection. */
	public void broadcastEvent(String name, JsonObject payload) {
		JsonObject envelope = new JsonObject();
		envelope.addProperty("id", "e-" + eventIdCounter.incrementAndGet());
		envelope.addProperty("kind", "event");
		envelope.addProperty("name", name);
		envelope.add("payload", payload);
		for (Connection connection : connections) {
			connection.send(envelope);
		}
	}

	private void acceptLoop() {
		while (running) {
			try {
				Socket socket = serverSocket.accept();
				Connection connection = new Connection(socket);
				connections.add(connection);
				Thread connectionThread = new Thread(() -> serve(connection), "mfo-bridge-conn-" + socket.getPort());
				connectionThread.setDaemon(true);
				connectionThread.start();
			} catch (IOException e) {
				if (running) {
					log.accept("bridge accept failed: " + e.getMessage());
					JsonObject payload = new JsonObject();
					payload.addProperty("message", e.getMessage() != null ? e.getMessage() : e.toString());
					broadcastEvent("error", payload);
				}
			}
		}
	}

	private void serve(Connection connection) {
		try {
			String line;
			while ((line = connection.reader.readLine()) != null) {
				handleLine(connection, line);
			}
		} catch (IOException e) {
			log.accept("bridge connection error: " + e.getMessage());
		} finally {
			connections.remove(connection);
			connection.close();
		}
	}

	private void handleLine(Connection connection, String line) {
		String id = null;
		try {
			JsonObject request = JsonParser.parseString(line).getAsJsonObject();
			id = request.get("id").getAsString();
			String name = request.get("name").getAsString();
			JsonObject payload = request.has("payload") ? request.getAsJsonObject("payload") : new JsonObject();
			String responseId = id;
			dispatcher.dispatch(name, payload)
					.thenAccept(result -> connection.sendResponse(responseId, true, result, null))
					.exceptionally(ex -> {
						connection.sendResponse(responseId, false, null, rootMessage(ex));
						return null;
					});
		} catch (RuntimeException e) {
			// Covers malformed JSON as well as a dispatcher throwing synchronously while reading
			// payload fields (e.g. a missing/wrong-typed field) — both are untrusted network
			// input, not bugs, so they're reported back rather than propagated.
			log.accept("malformed bridge command: " + line);
			if (id != null) {
				connection.sendResponse(id, false, null, "malformed command: " + e.getMessage());
			}
		}
	}

	private static String rootMessage(Throwable ex) {
		Throwable cause = ex;
		while (cause.getCause() != null) {
			cause = cause.getCause();
		}
		return cause.getMessage() != null ? cause.getMessage() : cause.toString();
	}

	private static void closeQuietly(Closeable closeable) {
		if (closeable == null) {
			return;
		}
		try {
			closeable.close();
		} catch (IOException ignored) {
			// closing on shutdown; nothing actionable if it fails
		}
	}

	private static final class Connection implements Closeable {
		private final Socket socket;
		private final BufferedReader reader;
		private final Writer writer;

		Connection(Socket socket) throws IOException {
			this.socket = socket;
			this.reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
			this.writer = new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8);
		}

		synchronized void send(JsonObject envelope) {
			try {
				writer.write(envelope.toString());
				writer.write("\n");
				writer.flush();
			} catch (IOException ignored) {
				// peer went away; the accept loop's read will observe the closed connection
			}
		}

		void sendResponse(String id, boolean ok, JsonObject payload, String error) {
			JsonObject envelope = new JsonObject();
			envelope.addProperty("id", id);
			envelope.addProperty("kind", "response");
			envelope.addProperty("ok", ok);
			if (ok) {
				envelope.add("payload", payload != null ? payload : new JsonObject());
			} else {
				envelope.addProperty("error", error);
			}
			send(envelope);
		}

		@Override
		public void close() {
			closeQuietly(socket);
		}
	}
}
