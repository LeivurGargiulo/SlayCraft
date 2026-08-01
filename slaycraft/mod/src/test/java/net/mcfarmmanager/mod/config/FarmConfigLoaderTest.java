package net.mcfarmmanager.mod.config;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FarmConfigLoaderTest {

    private Path writeTemp(String json) throws IOException {
        Path file = Files.createTempFile("farms", ".json");
        Files.writeString(file, json);
        return file;
    }

    @Test
    void loadsValidConfig() throws IOException {
        String json = """
            { "farms": [ {
              "id": "iron", "name": "Iron Farm", "dimension": "minecraft:overworld",
              "anchor": { "x": 120, "y": 80, "z": -500 }, "entityScanRadius": 32,
              "fakePlayerName": "Worker-Iron",
              "storage": [ { "id": "main-chest", "label": "Main output",
                "position": { "x": 123, "y": 79, "z": -501 } } ]
            } ] }
            """;
        List<FarmConfig> farms = FarmConfigLoader.load(writeTemp(json));
        assertEquals(1, farms.size());
        assertEquals("iron", farms.get(0).id());
        assertEquals(32, farms.get(0).entityScanRadius());
        assertEquals(1, farms.get(0).storage().size());
    }

    @Test
    void nullFakePlayerNameIsAllowed() throws IOException {
        String json = """
            { "farms": [ {
              "id": "iron", "name": "Iron Farm", "dimension": "minecraft:overworld",
              "anchor": { "x": 0, "y": 0, "z": 0 }, "entityScanRadius": 10,
              "storage": []
            } ] }
            """;
        List<FarmConfig> farms = FarmConfigLoader.load(writeTemp(json));
        assertNull(farms.get(0).fakePlayerName());
    }

    @Test
    void rejectsDuplicateFarmIds() throws IOException {
        String json = """
            { "farms": [
              { "id": "iron", "name": "A", "dimension": "minecraft:overworld",
                "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] },
              { "id": "iron", "name": "B", "dimension": "minecraft:overworld",
                "anchor": {"x":1,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] }
            ] }
            """;
        FarmConfigException ex = assertThrows(FarmConfigException.class,
            () -> FarmConfigLoader.load(writeTemp(json)));
        assertTrue(ex.getMessage().contains("duplicate"));
    }

    @Test
    void rejectsEmptyFarmId() throws IOException {
        String json = """
            { "farms": [ { "id": "", "name": "A", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsMissingRequiredField() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsUnknownDimension() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "name": "A", "dimension": "minecraft:not_a_real_dim",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsNonPositiveEntityScanRadius() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "name": "A", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 0, "storage": [] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsDuplicateStoragePositionsWithinAFarm() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "name": "A", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10,
              "storage": [
                { "id": "a", "label": "A", "position": {"x":1,"y":1,"z":1} },
                { "id": "b", "label": "B", "position": {"x":1,"y":1,"z":1} }
              ] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsNullStorageEntry() throws IOException {
        String json = """
            { "farms": [ { "id": "iron", "name": "A", "dimension": "minecraft:overworld",
              "anchor": {"x":0,"y":0,"z":0}, "entityScanRadius": 10, "storage": [ null ] } ] }
            """;
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp(json)));
    }

    @Test
    void rejectsMalformedJson() throws IOException {
        assertThrows(FarmConfigException.class, () -> FarmConfigLoader.load(writeTemp("{ not json")));
    }
}
