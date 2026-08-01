package net.mcfarmmanager.mod.config;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class FarmConfigLoader {
    private static final Set<String> VALID_DIMENSIONS = Set.of(
        "minecraft:overworld", "minecraft:the_nether", "minecraft:the_end"
    );

    private FarmConfigLoader() {}

    private record FarmsFile(List<FarmConfig> farms) {}

    public static List<FarmConfig> load(Path jsonFile) {
        String content;
        try {
            content = Files.readString(jsonFile);
        } catch (IOException e) {
            throw new FarmConfigException("could not read farms.json: " + e.getMessage());
        }

        FarmsFile parsed;
        try {
            parsed = new Gson().fromJson(content, FarmsFile.class);
        } catch (JsonSyntaxException e) {
            throw new FarmConfigException("malformed farms.json: " + e.getMessage());
        }
        if (parsed == null || parsed.farms() == null) {
            throw new FarmConfigException("malformed farms.json: missing \"farms\" array");
        }

        validateAll(parsed.farms());
        return parsed.farms();
    }

    public static void validateAll(List<FarmConfig> farms) {
        Set<String> seenIds = new HashSet<>();
        for (FarmConfig farm : farms) {
            validate(farm, seenIds);
        }
    }

    public static void write(Path jsonFile, List<FarmConfig> farms) {
        validateAll(farms);
        String json = new com.google.gson.GsonBuilder().setPrettyPrinting().create()
                .toJson(new FarmsFile(farms));
        try {
            Files.createDirectories(jsonFile.getParent());
            Path tmp = jsonFile.resolveSibling(jsonFile.getFileName() + ".tmp");
            Files.writeString(tmp, json);
            Files.move(tmp, jsonFile, java.nio.file.StandardCopyOption.REPLACE_EXISTING, java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new FarmConfigException("could not write farms.json: " + e.getMessage());
        }
    }

    public static void validate(FarmConfig farm, Set<String> seenIds) {
        if (farm.id() == null || farm.id().isEmpty()) {
            throw new FarmConfigException("farm id must be non-empty");
        }
        if (!seenIds.add(farm.id())) {
            throw new FarmConfigException("duplicate farm id: " + farm.id());
        }
        if (farm.name() == null || farm.name().isEmpty()) {
            throw new FarmConfigException("farm " + farm.id() + ": name must be non-empty");
        }
        // Validates against fixed set of vanilla dimension ids; farms.json is loaded before
        // any live registry is available, so this is a deliberate simplification.
        if (farm.dimension() == null || !VALID_DIMENSIONS.contains(farm.dimension())) {
            throw new FarmConfigException("farm " + farm.id() + ": unknown dimension: " + farm.dimension());
        }
        if (farm.anchor() == null) {
            throw new FarmConfigException("farm " + farm.id() + ": missing anchor");
        }
        if (farm.entityScanRadius() <= 0) {
            throw new FarmConfigException("farm " + farm.id() + ": entityScanRadius must be positive");
        }
        if (farm.storage() == null) {
            throw new FarmConfigException("farm " + farm.id() + ": storage array is required (may be empty)");
        }
        Set<Position> seenPositions = new HashSet<>();
        for (StorageConfig storage : farm.storage()) {
            if (storage == null) {
                throw new FarmConfigException("farm " + farm.id() + ": storage entry is null");
            }
            if (storage.id() == null || storage.id().isEmpty()) {
                throw new FarmConfigException("farm " + farm.id() + ": storage entry missing id");
            }
            if (!seenPositions.add(storage.position())) {
                throw new FarmConfigException("farm " + farm.id() + ": duplicate storage position: " + storage.position());
            }
        }
        if (farm.afkSpot() != null) {
            if (farm.afkSpot().position() == null) {
                throw new FarmConfigException("farm " + farm.id() + ": afkSpot missing position");
            }
            if (farm.afkSpot().radius() <= 0) {
                throw new FarmConfigException("farm " + farm.id() + ": afkSpot radius must be positive");
            }
        }
    }
}
