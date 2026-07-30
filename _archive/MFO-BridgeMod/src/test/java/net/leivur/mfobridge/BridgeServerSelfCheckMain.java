package net.leivur.mfobridge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.InetAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;

/**
 * Runnable, framework-free self-check for {@link BridgeServer}'s transport layer — the part of
 * Phase 1 that's actually testable outside a running Minecraft client. Not wired into the mod
 * jar or Gradle's test task (this project has no test dependency configured); compile and run
 * directly, e.g.:
 * <pre>
 * javac -cp gson.jar -d out $(find src/main/java/net/leivur/mfobridge/{BridgeServer,CommandDispatcher}.java src/test/java -name '*.java')
 * java -cp out:gson.jar net.leivur.mfobridge.BridgeServerSelfCheckMain
 * </pre>
 */
public final class BridgeServerSelfCheckMain {
	public static void main(String[] args) throws Exception {
		checkLoopbackOnlyBind();
		checkCommandRoundTrip();
		checkMalformedCommandReportsError();
		checkUnknownCommandReportsError();
		checkEventBroadcast();
		System.out.println("BridgeServerSelfCheckMain: all checks passed");
	}

	private static void checkLoopbackOnlyBind() throws IOException {
		BridgeServer server = new BridgeServer(0, (name, payload) -> CompletableFuture.completedFuture(new JsonObject()), msg -> {});
		server.start();
		try {
			assertEquals(InetAddress.getByName("127.0.0.1"), server.getBoundPortAddress(), "server must bind only to the loopback address");
		} finally {
			server.stop();
		}
	}

	private static void checkCommandRoundTrip() throws Exception {
		CommandDispatcher echoDispatcher = (name, payload) -> {
			JsonObject result = new JsonObject();
			result.addProperty("echoedCommand", name);
			return CompletableFuture.completedFuture(result);
		};
		BridgeServer server = new BridgeServer(0, echoDispatcher, msg -> {});
		server.start();
		try (Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), server.getBoundPort())) {
			send(socket, "{\"id\":\"c-1\",\"kind\":\"command\",\"name\":\"look\",\"payload\":{}}");
			JsonObject response = readOne(socket);
			assertEquals("c-1", response.get("id").getAsString(), "response id must echo the request id");
			assertEquals("response", response.get("kind").getAsString(), "kind");
			assertEquals(true, response.get("ok").getAsBoolean(), "ok");
			assertEquals("look", response.getAsJsonObject("payload").get("echoedCommand").getAsString(), "payload");
		} finally {
			server.stop();
		}
	}

	private static void checkMalformedCommandReportsError() throws Exception {
		BridgeServer server = new BridgeServer(0, (name, payload) -> CompletableFuture.completedFuture(new JsonObject()), msg -> {});
		server.start();
		try (Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), server.getBoundPort())) {
			send(socket, "not json at all");
			send(socket, "{\"id\":\"c-2\",\"kind\":\"command\",\"name\":\"look\",\"payload\":{}}");
			JsonObject response = readOne(socket);
			assertEquals("c-2", response.get("id").getAsString(), "malformed line must not desync framing for the next line");
		} finally {
			server.stop();
		}
	}

	private static void checkUnknownCommandReportsError() throws Exception {
		CommandDispatcher failingDispatcher = (name, payload) ->
				CompletableFuture.failedFuture(new IllegalArgumentException("unknown command: " + name));
		BridgeServer server = new BridgeServer(0, failingDispatcher, msg -> {});
		server.start();
		try (Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), server.getBoundPort())) {
			send(socket, "{\"id\":\"c-3\",\"kind\":\"command\",\"name\":\"bogus\",\"payload\":{}}");
			JsonObject response = readOne(socket);
			assertEquals(false, response.get("ok").getAsBoolean(), "unknown command must fail, not no-op");
			assertEquals("unknown command: bogus", response.get("error").getAsString(), "error message");
		} finally {
			server.stop();
		}
	}

	private static void checkEventBroadcast() throws Exception {
		BridgeServer server = new BridgeServer(0, (name, payload) -> CompletableFuture.completedFuture(new JsonObject()), msg -> {});
		server.start();
		try (Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), server.getBoundPort())) {
			// give the accept loop a moment to register the connection before broadcasting
			Thread.sleep(50);
			JsonObject payload = new JsonObject();
			payload.addProperty("reason", "socketClosed");
			server.broadcastEvent("disconnected", payload);
			JsonObject event = readOne(socket);
			assertEquals("event", event.get("kind").getAsString(), "kind");
			assertEquals("disconnected", event.get("name").getAsString(), "name");
			assertEquals("socketClosed", event.getAsJsonObject("payload").get("reason").getAsString(), "payload");
		} finally {
			server.stop();
		}
	}

	private static void send(Socket socket, String line) throws IOException {
		Writer writer = new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8);
		writer.write(line);
		writer.write("\n");
		writer.flush();
	}

	private static JsonObject readOne(Socket socket) throws IOException {
		BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
		String line = reader.readLine();
		if (line == null) {
			throw new AssertionError("connection closed before a line was received");
		}
		return JsonParser.parseString(line).getAsJsonObject();
	}

	private static void assertEquals(Object expected, Object actual, String what) {
		if (!expected.equals(actual)) {
			throw new AssertionError(what + ": expected <" + expected + "> but was <" + actual + ">");
		}
	}
}
