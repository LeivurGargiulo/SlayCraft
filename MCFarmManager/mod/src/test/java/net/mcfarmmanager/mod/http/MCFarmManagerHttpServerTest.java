package net.mcfarmmanager.mod.http;

import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.config.Position;
import net.mcfarmmanager.mod.config.StorageConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class MCFarmManagerHttpServerTest {
    private MCFarmManagerHttpServer server;
    private FakeHistoryStore historyStore;
    private int port;
    private HttpClient client = HttpClient.newHttpClient();

    private List<FarmConfig> farms() {
        return List.of(new FarmConfig("iron", "Iron Farm", "minecraft:overworld",
            new Position(120, 80, -500), 32, "Worker-Iron",
            List.of(new StorageConfig("main-chest", "Main output", new Position(123, 79, -501))), null));
    }

    @BeforeEach
    void start() throws IOException {
        historyStore = new FakeHistoryStore();
        server = new MCFarmManagerHttpServer(this::farms, new FakeFarmDataProvider(), new FakeServerDataProvider(),
                historyStore, 0, "127.0.0.1");
        server.start();
        port = server.boundPort();
    }

    @AfterEach
    void stop() { server.stop(); }

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path)).GET().build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void farmsListReturnsSummaries() throws Exception {
        HttpResponse<String> response = get("/farms");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"id\":\"iron\""));
        assertTrue(response.body().contains("\"entityCount\":1"));
        assertTrue(response.body().contains("\"storageItemCount\":1728"));
    }

    @Test
    void farmDetailReturnsFullShape() throws Exception {
        HttpResponse<String> response = get("/farms/iron");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"occupants\""));
        assertTrue(response.body().contains("\"entities\""));
        assertTrue(response.body().contains("\"storage\""));
    }

    @Test
    void unknownFarmReturns404() throws Exception {
        HttpResponse<String> response = get("/farms/does-not-exist");
        assertEquals(404, response.statusCode());
        assertTrue(response.body().contains("unknown farm: does-not-exist"));
    }

    @Test
    void historyEndpointReturnsSamples() throws Exception {
        long sampledAt = System.currentTimeMillis();
        historyStore.recordSample("iron", sampledAt, java.util.Map.of("minecraft:iron_golem", 4),
                java.util.Map.of("minecraft:iron_ingot", 1620));
        HttpResponse<String> response = get("/farms/iron/history");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"farmId\":\"iron\""));
        assertTrue(response.body().contains("\"range\":\"24h\""));
        assertTrue(response.body().contains("\"sampledAt\":\"" + Instant.ofEpochMilli(sampledAt) + "\""));
        assertTrue(response.body().contains("\"minecraft:iron_golem\":4"));
        assertTrue(response.body().contains("\"minecraft:iron_ingot\":1620"));
    }

    @Test
    void historyEndpointHonorsRangeParam() throws Exception {
        long now = System.currentTimeMillis();
        historyStore.recordSample("iron", now - java.time.Duration.ofDays(10).toMillis(),
                java.util.Map.of(), java.util.Map.of());
        historyStore.recordSample("iron", now, java.util.Map.of(), java.util.Map.of());
        HttpResponse<String> response = get("/farms/iron/history?range=1h");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"range\":\"1h\""));
        assertFalse(response.body().contains(Instant.ofEpochMilli(now - java.time.Duration.ofDays(10).toMillis()).toString()));
    }

    @Test
    void historyEndpointUnknownFarmReturns404() throws Exception {
        HttpResponse<String> response = get("/farms/does-not-exist/history");
        assertEquals(404, response.statusCode());
        assertTrue(response.body().contains("unknown farm: does-not-exist"));
    }

    @Test
    void playersEndpoint() throws Exception {
        HttpResponse<String> response = get("/players");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"name\":\"leivur\""));
    }

    @Test
    void worldEndpoint() throws Exception {
        HttpResponse<String> response = get("/world");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"dimension\":\"minecraft:overworld\""));
    }

    @Test
    void performanceEndpoint() throws Exception {
        HttpResponse<String> response = get("/performance");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"tps\":19.87"));
    }

    @Test
    void statusEndpoint() throws Exception {
        HttpResponse<String> response = get("/status");
        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("\"farmCount\":1"));
    }
}
