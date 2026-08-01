package net.mcfarmmanager.mod;

import carpet.CarpetServer;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.mcfarmmanager.mod.config.FarmConfig;
import net.mcfarmmanager.mod.config.FarmConfigException;
import net.mcfarmmanager.mod.config.FarmConfigLoader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.file.Path;
import java.util.List;

public final class MCFarmManagerMod implements ModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger("mcfarmmanager");

    private static volatile List<FarmConfig> farms = List.of();
    private static volatile Path configPath;

    public static List<FarmConfig> farms() {
        return farms;
    }

    public static void setFarms(List<FarmConfig> updated) {
        FarmConfigLoader.validateAll(updated);
        farms = updated;
    }

    public static Path configPath() {
        return configPath;
    }

    @Override
    public void onInitialize() {
        LOGGER.info("MCFarmManager mod loaded (base entrypoint)");
        MCFarmManagerExtension extension = new MCFarmManagerExtension();
        CarpetServer.manageExtension(extension);
        extension.registerSettings();

        configPath = FabricLoader.getInstance().getConfigDir().resolve("mcfarmmanager/farms.json");
        try {
            farms = FarmConfigLoader.load(configPath);
            LOGGER.info("Loaded {} farm(s) from mcfarmmanager/farms.json", farms.size());
        } catch (FarmConfigException e) {
            LOGGER.error("Failed to load mcfarmmanager/farms.json - mod behavior disabled: {}", e.getMessage());
            farms = List.of();
        }
    }
}
