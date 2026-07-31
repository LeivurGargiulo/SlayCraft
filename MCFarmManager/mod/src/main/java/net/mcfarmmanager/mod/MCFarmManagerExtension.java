// Confirmed via javap -p/-c on carpet/{CarpetExtension,CarpetServer,api/settings/SettingsManager,api/settings/Rule,
// settings/ParsedRule,utils/Translations}.class in fabric-carpet-1.21.11-1.4.194+v251223.jar: extensions implement
// carpet.CarpetExtension and self-register with CarpetServer.manageExtension(this) from a regular Fabric
// ModInitializer (no special fabric.mod.json entrypoint key exists for this - registering via a mixin instead
// logs a warning). Rules are declared as "public static" fields annotated with carpet.api.settings.Rule
// (categories() is a required element, no default) on a class handed to SettingsManager.parseSettingsClass(Class),
// where the SettingsManager instance is returned by CarpetExtension.extensionSettingsManager() so
// CarpetServer.forEachManager(...) picks it up automatically. parseSettingsClass requires a resolved
// "<identifier>.rule.<name>.desc" translation (Objects.requireNonNull in ParsedRule.of) - Translations.updateLanguage()
// gathers these by calling canHasTranslations(language) on every already-registered extension, so it must be
// overridden here rather than shipped as a lang json.
package net.mcfarmmanager.mod;

import carpet.CarpetExtension;
import carpet.CarpetServer;
import carpet.api.settings.Rule;
import carpet.api.settings.RuleCategory;
import carpet.api.settings.SettingsManager;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.mcfarmmanager.mod.data.RealFarmDataProvider;
import net.mcfarmmanager.mod.history.FarmSampler;
import net.mcfarmmanager.mod.history.SqliteHistoryStore;
import net.mcfarmmanager.mod.http.MCFarmManagerHttpServer;
import net.mcfarmmanager.mod.server.RealServerDataProvider;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.storage.LevelResource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public final class MCFarmManagerExtension implements CarpetExtension {
    private static final SettingsManager SETTINGS =
            new SettingsManager("1.0.0", "mcfarmmanager", "MCFarmManager");

    // ServerTickEvents has no unregister API, so the tick callback is registered once per JVM
    // (guarded by this flag) and delegates to whichever FarmSampler is currently active - swapped
    // out on each onServerLoaded/onServerClosed instead of re-registering a new listener.
    private static final AtomicBoolean TICK_LISTENER_REGISTERED = new AtomicBoolean();
    private static volatile FarmSampler activeSampler;

    private MCFarmManagerHttpServer httpServer;
    private SqliteHistoryStore historyStore;

    public static class Settings {
        @Rule(categories = RuleCategory.FEATURE)
        public static boolean mcfarmmanagerEnabled = true;

        @Rule(categories = RuleCategory.FEATURE)
        public static int mcfarmmanagerHttpPort = 8642;

        @Rule(categories = RuleCategory.FEATURE)
        public static String mcfarmmanagerHttpBindAddress = "0.0.0.0";

        @Rule(categories = RuleCategory.FEATURE)
        public static int mcfarmmanagerSampleIntervalMinutes = 5;

        @Rule(categories = RuleCategory.FEATURE)
        public static int mcfarmmanagerHistoryRetentionDays = 30;

        @Rule(categories = RuleCategory.FEATURE)
        public static String mcfarmmanagerApiToken = "";
    }

    @Override
    public Map<String, String> canHasTranslations(String language) {
        if (!"en_us".equals(language)) {
            return null;
        }
        return Map.ofEntries(
                Map.entry("mcfarmmanager.rule.mcfarmmanagerEnabled.name", "MCFarmManager Enabled"),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerEnabled.desc",
                        "Master on/off switch. When false, the HTTP server and sampler don't start."),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerHttpPort.name", "MCFarmManager HTTP Port"),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerHttpPort.desc",
                        "Port the HTTP server (API + dashboard) binds to."),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerHttpBindAddress.name", "MCFarmManager HTTP Bind Address"),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerHttpBindAddress.desc",
                        "Bind address for the HTTP server. LAN-trusted by design."),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerSampleIntervalMinutes.name", "MCFarmManager Sample Interval Minutes"),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerSampleIntervalMinutes.desc",
                        "How often farm history is sampled, in minutes."),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerHistoryRetentionDays.name", "MCFarmManager History Retention Days"),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerHistoryRetentionDays.desc",
                        "Farm history rows older than this many days are pruned on each sample cycle."),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerApiToken.name", "MCFarmManager API Token"),
                Map.entry("mcfarmmanager.rule.mcfarmmanagerApiToken.desc",
                        "Shared secret required in the X-API-Token header for farm-config write requests (POST/PUT/DELETE on /farms). Empty (default) rejects all writes."));
    }

    @Override
    public SettingsManager extensionSettingsManager() {
        return SETTINGS;
    }

    // parseSettingsClass() only builds SETTINGS' internal rule map - it does not wire the
    // `/carpet <rule>` Brigadier command tree for this extension's rules. That requires this
    // extension to also implement registerCommands(dispatcher, context) and forward to
    // SETTINGS.registerCommand(...); CarpetServer only does this automatically for its own
    // built-in CarpetSettings manager, not for extensions. Confirmed live: without this override,
    // the HTTP server started fine on the Settings class' hardcoded field defaults, but every one
    // of the five rules was "Unknown rule" to `/carpet`, and `/carpet list mcfarmmanager` showed
    // nothing beyond the mod's version string.
    @Override
    public void registerCommands(com.mojang.brigadier.CommandDispatcher<net.minecraft.commands.CommandSourceStack> dispatcher,
                                  net.minecraft.commands.CommandBuildContext context) {
        SETTINGS.registerCommand(dispatcher, context);
    }

    void registerSettings() {
        SETTINGS.parseSettingsClass(Settings.class);
        MCFarmManagerMod.LOGGER.info("MCFarmManager Carpet extension registered");
    }

    @Override
    public void onServerLoaded(MinecraftServer server) {
        if (!Settings.mcfarmmanagerEnabled) {
            return;
        }
        RealFarmDataProvider farmData = new RealFarmDataProvider(() -> CarpetServer.minecraft_server);

        try {
            Path dbFile = server.getWorldPath(LevelResource.ROOT).resolve("mcfarmmanager/history.sqlite");
            Files.createDirectories(dbFile.getParent());
            historyStore = new SqliteHistoryStore(dbFile);
        } catch (IOException e) {
            MCFarmManagerMod.LOGGER.error("Failed to open MCFarmManager history store: {}", e.getMessage());
            historyStore = null;
            return;
        }

        activeSampler = new FarmSampler(MCFarmManagerMod::farms, farmData, historyStore,
                () -> Settings.mcfarmmanagerSampleIntervalMinutes, () -> Settings.mcfarmmanagerHistoryRetentionDays);
        if (TICK_LISTENER_REGISTERED.compareAndSet(false, true)) {
            ServerTickEvents.END_SERVER_TICK.register(s -> {
                FarmSampler sampler = activeSampler;
                if (sampler != null) {
                    sampler.onEndTick();
                }
            });
        }

        httpServer = new MCFarmManagerHttpServer(
                MCFarmManagerMod::farms,
                farmData,
                new RealServerDataProvider(() -> CarpetServer.minecraft_server),
                historyStore,
                Settings.mcfarmmanagerHttpPort,
                Settings.mcfarmmanagerHttpBindAddress);
        try {
            httpServer.start();
            MCFarmManagerMod.LOGGER.info("MCFarmManager HTTP server listening on {}:{}",
                    Settings.mcfarmmanagerHttpBindAddress, httpServer.boundPort());
        } catch (IOException e) {
            MCFarmManagerMod.LOGGER.error("Failed to start MCFarmManager HTTP server: {}", e.getMessage());
            httpServer = null;
        }
    }

    @Override
    public void onServerClosed(MinecraftServer server) {
        activeSampler = null;
        if (httpServer != null) {
            httpServer.stop();
            httpServer = null;
        }
        if (historyStore != null) {
            historyStore.close();
            historyStore = null;
        }
    }
}
