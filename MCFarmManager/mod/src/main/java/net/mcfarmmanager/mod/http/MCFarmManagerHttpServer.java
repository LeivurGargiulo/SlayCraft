package net.mcfarmmanager.mod.http;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.sun.net.httpserver.Filter;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.data.FarmDataProvider;
import net.mcfarmmanager.mod.history.HistorySample;
import net.mcfarmmanager.mod.history.HistoryStore;
import net.mcfarmmanager.mod.server.ServerDataProvider;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.net.URLDecoder;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;

public final class MCFarmManagerHttpServer {
    private final List<FarmConfig> farms;
    private final FarmDataProvider farmData;
    private final ServerDataProvider serverData;
    private final HistoryStore historyStore;
    private final int port;
    private final String bindAddress;
    private final Gson gson = new GsonBuilder().serializeNulls().create();
    private HttpServer httpServer;

    public MCFarmManagerHttpServer(List<FarmConfig> farms, FarmDataProvider farmData,
                                    ServerDataProvider serverData, HistoryStore historyStore,
                                    int port, String bindAddress) {
        this.farms = farms;
        this.farmData = farmData;
        this.serverData = serverData;
        this.historyStore = historyStore;
        this.port = port;
        this.bindAddress = bindAddress;
    }

    public void start() throws IOException {
        httpServer = HttpServer.create(new InetSocketAddress(bindAddress, port), 0);
        Filter hostFilter = hostValidationFilter();
        addContext("/farms", this::handleFarms, hostFilter);
        addContext("/players", exchange -> respondJson(exchange, Map.of("players", serverData.players())), hostFilter);
        addContext("/world", exchange -> respondJson(exchange, Map.of("dimensions", serverData.worldState())), hostFilter);
        addContext("/performance", exchange -> respondJson(exchange, serverData.performance()), hostFilter);
        addContext("/status", exchange -> respondJson(exchange, serverData.status(farms.size())), hostFilter);
        httpServer.setExecutor(Executors.newCachedThreadPool());
        httpServer.start();
    }

    private void addContext(String path, HttpHandler handler, Filter filter) {
        HttpContext context = httpServer.createContext(path, handler);
        context.getFilters().add(filter);
    }

    /** Rejects requests whose Host header doesn't match this server's own address, guarding
     * against DNS rebinding now that there's no other auth layer (see SPEC's Security posture). */
    private Filter hostValidationFilter() {
        Set<String> allowedHosts = allowedHosts();
        return new Filter() {
            @Override
            public String description() {
                return "Host header validation";
            }

            @Override
            public void doFilter(HttpExchange exchange, Filter.Chain chain) throws IOException {
                String host = stripPort(exchange.getRequestHeaders().getFirst("Host"));
                if (host == null || !allowedHosts.contains(host.toLowerCase(Locale.ROOT))) {
                    respondJson(exchange, 400, Map.of("error", "invalid host header"));
                    return;
                }
                chain.doFilter(exchange);
            }
        };
    }

    private Set<String> allowedHosts() {
        Set<String> hosts = new HashSet<>();
        hosts.add("localhost");
        hosts.add("127.0.0.1");
        hosts.add("::1");
        if (!bindAddress.isBlank() && !bindAddress.equals("0.0.0.0") && !bindAddress.equals("::")) {
            hosts.add(bindAddress.toLowerCase(Locale.ROOT));
        }
        try {
            InetAddress local = InetAddress.getLocalHost();
            hosts.add(local.getHostAddress().toLowerCase(Locale.ROOT));
            hosts.add(local.getHostName().toLowerCase(Locale.ROOT));
        } catch (UnknownHostException ignored) {
            // No local hostname available; the localhost/bindAddress entries above still apply.
        }
        // getLocalHost() alone is unreliable for "what's my LAN address" (wrong NIC on multi-homed
        // boxes, /etc/hosts quirks like 127.0.1.1) - enumerate every address on every interface instead,
        // since bindAddress 0.0.0.0 means we actually accept traffic addressed to any of them.
        try {
            for (NetworkInterface iface : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                for (InetAddress addr : Collections.list(iface.getInetAddresses())) {
                    hosts.add(addr.getHostAddress().toLowerCase(Locale.ROOT));
                }
            }
        } catch (SocketException ignored) {
            // No interfaces enumerable; the entries already collected above still apply.
        }
        return hosts;
    }

    private static String stripPort(String host) {
        if (host == null) {
            return null;
        }
        if (host.startsWith("[")) {
            int end = host.indexOf(']');
            return end >= 0 ? host.substring(0, end + 1) : host;
        }
        int idx = host.lastIndexOf(':');
        return idx >= 0 ? host.substring(0, idx) : host;
    }

    public void stop() {
        if (httpServer != null) {
            httpServer.stop(0);
        }
    }

    public int boundPort() {
        return httpServer.getAddress().getPort();
    }

    private void handleFarms(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/farms")) {
            respondJson(exchange, Map.of("farms", farms.stream().map(this::summarize).toList()));
            return;
        }

        String remainder = path.substring("/farms/".length());
        if (remainder.endsWith("/history")) {
            handleFarmHistory(exchange, remainder.substring(0, remainder.length() - "/history".length()));
            return;
        }

        FarmConfig farm = findFarm(remainder);
        if (farm == null) {
            respondJson(exchange, 404, Map.of("error", "unknown farm: " + remainder));
            return;
        }
        respondJson(exchange, detail(farm));
    }

    private void handleFarmHistory(HttpExchange exchange, String id) throws IOException {
        FarmConfig farm = findFarm(id);
        if (farm == null) {
            respondJson(exchange, 404, Map.of("error", "unknown farm: " + id));
            return;
        }
        String range = queryParam(exchange, "range", "24h");
        List<HistorySampleView> samples = historyStore.query(id, rangeSinceMillis(range)).stream()
                .map(MCFarmManagerHttpServer::toView)
                .toList();
        respondJson(exchange, new FarmHistoryResponse(id, range, samples));
    }

    private FarmConfig findFarm(String id) {
        return farms.stream().filter(f -> f.id().equals(id)).findFirst().orElse(null);
    }

    private static HistorySampleView toView(HistorySample sample) {
        return new HistorySampleView(
                Instant.ofEpochMilli(sample.sampledAtMillis()).toString(),
                sample.entityCounts(),
                sample.storageCounts());
    }

    private static String queryParam(HttpExchange exchange, String name, String defaultValue) {
        String query = exchange.getRequestURI().getRawQuery();
        if (query == null) {
            return defaultValue;
        }
        for (String param : query.split("&")) {
            int eq = param.indexOf('=');
            String key = eq >= 0 ? param.substring(0, eq) : param;
            if (!key.equals(name)) {
                continue;
            }
            return eq >= 0 ? URLDecoder.decode(param.substring(eq + 1), StandardCharsets.UTF_8) : "";
        }
        return defaultValue;
    }

    private static long rangeSinceMillis(String range) {
        Duration window = switch (range) {
            case "1h" -> Duration.ofHours(1);
            case "7d" -> Duration.ofDays(7);
            case "30d" -> Duration.ofDays(30);
            case "all" -> null;
            default -> Duration.ofHours(24);
        };
        return window == null ? 0L : System.currentTimeMillis() - window.toMillis();
    }

    private FarmSummary summarize(FarmConfig farm) {
        int storageItemCount = farmData.storage(farm).stream()
                .flatMap(s -> s.items().stream())
                .mapToInt(item -> item.count())
                .sum();
        return new FarmSummary(
                farm.id(),
                farm.name(),
                farm.dimension(),
                farmData.entities(farm).size(),
                storageItemCount,
                farmData.chunkLoaded(farm),
                farmData.occupants(farm).size());
    }

    private FarmDetail detail(FarmConfig farm) {
        return new FarmDetail(
                farm.id(),
                farm.name(),
                farm.dimension(),
                farm.anchor(),
                farmData.chunkLoaded(farm),
                farmData.occupants(farm),
                farmData.entities(farm),
                farmData.storage(farm));
    }

    private void respondJson(HttpExchange exchange, Object body) throws IOException {
        respondJson(exchange, 200, body);
    }

    private void respondJson(HttpExchange exchange, int statusCode, Object body) throws IOException {
        byte[] bytes = gson.toJson(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
